import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ConvergenceError } from '../errors.js';
import { createTransientSim } from './transient-driver.js';
import { TransientProgressMonitor } from './transient-progress.js';

// Unchanged Xyce fixture from issue #366 (sha256 a0a869d9...8b35). A PULSE
// current source drives a 10 mH inductor through 1 mOhm, so V(2) = L di/dt.
const INDUCTOR_FIXTURE = readFileSync(
  new URL('../../../../benchmarks/corpus/xyce/fixtures/INDUCTOR/inductor.cir', import.meta.url),
  'utf8',
);

/**
 * Advance at most `maxSteps` accepted timepoints. A step loop that cannot
 * reach stopTime inside the bound is reported instead of hanging the suite.
 */
async function runBounded(netlist: string, maxSteps: number) {
  const sim = await createTransientSim(netlist);
  let accepted = 0;
  const samples: Array<{ time: number; v1: number; v2: number }> = [];
  while (!sim.isDone && accepted < maxSteps) {
    const step = sim.advance();
    accepted++;
    samples.push({ time: step.time, v1: step.voltages.get('1')!, v2: step.voltages.get('2')! });
  }
  return { sim, accepted, samples };
}

describe('transient step-loop termination (issue #366)', () => {
  it('reaches stopTime on the unchanged xyce inductor fixture within a bounded step count', async () => {
    const { sim, accepted } = await runBounded(INDUCTOR_FIXTURE, 20_000);
    expect(sim.isDone).toBe(true);
    expect(accepted).toBeLessThan(20_000);
    sim.dispose();
  });

  it('does not ring the first trapezoidal step after the DC operating point', async () => {
    // During the 1 ms rise di/dt = 5 kA/s, so V(2) = -L di/dt = -50 V once
    // the source ramp has started. Trapezoidal integration seeded with the
    // zero-voltage DC history reports -100 V, then alternates around -50 V.
    const { sim, samples } = await runBounded(INDUCTOR_FIXTURE, 20_000);
    const ramp = samples.filter(sample => sample.time > 0 && sample.time < 0.95e-3);
    expect(ramp.length).toBeGreaterThan(0);
    for (const sample of ramp) expect(sample.v2).toBeCloseTo(-50, 3);
    sim.dispose();
  });

  it('keeps the order-1 start step small relative to the first source corner', async () => {
    // A 1 ns ramp into an RC low-pass: v(t) ~= a t^2 / (2 RC) for t << RC.
    // Backward Euler across the whole ramp doubles that; ngspice limits the
    // first step to 0.1 x the first breakpoint gap, then cuts it by 10.
    const netlist = `ramp into rc
V1 1 0 PULSE(0 5 0 1n 1n 1m 2m)
R1 1 2 1k
C1 2 0 1u
.tran 10u 5m
`;
    const sim = await createTransientSim(netlist);
    const first = sim.advance();
    expect(first.time).toBeLessThanOrEqual(1e-11 * (1 + 1e-9));
    const atCorner = sim.advanceUntil(1e-9).at(-1)!;
    expect(atCorner.time).toBeCloseTo(1e-9, 18);
    const slope = 5 / 1e-9;
    const analytic = slope * (1e-9) ** 2 / (2 * 1e-3);
    expect(Math.abs(atCorner.voltages.get('2')! - analytic) / analytic).toBeLessThan(0.05);
    sim.dispose();
  });

  it('recovers from trapezoidal ringing at a slope kink that no source reports as a breakpoint', async () => {
    // A delayed SIN current starts with a slope discontinuity at TD, which
    // the SIN waveform does not publish as a breakpoint (neither does
    // ngspice). The trapezoidal step across it rings in V(2) = -L di/dt with
    // an amplitude that does not shrink with dt, so node-voltage LTE rejects
    // every step and the accepted dt collapses to the numerical floor.
    const netlist = `delayed sine current into an inductor
I1 1 0 SIN(0 0.01 1Meg 1u)
L1 2 0 10uH
R1 1 2 1m
.tran 10n 3u
`;
    const { sim, accepted, samples } = await runBounded(netlist, 20_000);
    expect(sim.isDone).toBe(true);
    expect(accepted).toBeLessThan(20_000);
    // Away from the kink the exact response is V(2) = -L * 2*pi*f * A *
    // cos(...), but the trapezoidal ringing the kink starts is not damped:
    // ngspice-47 (308 points, INDtrunc step control) stays up to 44% of the
    // peak off that curve. spice-ts follows the same CKTtrunc control (#621),
    // so compare with ngspice-47 on the identical deck at these times.
    const peak = 10e-6 * 2 * Math.PI * 1e6 * 0.01;
    const ngspice: ReadonlyArray<readonly [number, number]> = [
      [1.25e-6, -0.121696], [1.5e-6, 0.749974], [1.75e-6, -0.121701], [2e-6, -0.506577],
      [2.25e-6, -0.121696], [2.5e-6, 0.749974], [2.75e-6, -0.121701], [3e-6, -0.351937],
    ];
    expect(accepted).toBeLessThan(2 * 308);
    for (const [time, expected] of ngspice) {
      const after = samples.findIndex(sample => sample.time >= time - 1e-18);
      const before = samples[Math.max(after - 1, 0)]!;
      const next = samples[after]!;
      const v2 = next.time === before.time
        ? next.v2
        : before.v2 + (next.v2 - before.v2) * (time - before.time) / (next.time - before.time);
      expect(Math.abs(v2 - expected)).toBeLessThan(0.03 * peak);
    }
    sim.dispose();
  });

  it('turns a non-progressing step loop into a structured lte-cascade error', async () => {
    const stalled = vi.spyOn(TransientProgressMonitor.prototype, 'accept').mockReturnValue('stalled');
    try {
      const sim = await createTransientSim(INDUCTOR_FIXTURE);
      let error: unknown;
      try {
        sim.advance();
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConvergenceError);
      expect((error as ConvergenceError).kind).toBe('lte-cascade');
      expect((error as ConvergenceError).convergence?.transient.failure).toBe('lte-cascade');
      expect(sim.convergence.transient.failure).toBe('lte-cascade');
      sim.dispose();
    } finally {
      stalled.mockRestore();
    }
  });
});
