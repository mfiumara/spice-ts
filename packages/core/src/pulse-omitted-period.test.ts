import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

/**
 * Issue #469: corpus-e d_bjt-rtlinv.ckt drives the chain with
 * `pulse(0 5 2ns 2ns 2ns 80ns)`, a PULSE with PER omitted. Its corners were
 * dropped (0 * Infinity is NaN in the breakpoint loop), so the first step ran
 * from 0 straight to 4 ns across the whole 2-4 ns rising edge. ngspice-47
 * lands on 2 ns and 4 ns and is within 16 mV of its own converged run on v(3).
 */
const FIXTURE = readFileSync(
  new URL('../../../benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-rtlinv.ckt', import.meta.url),
  'utf8',
);
const CONVERGED = FIXTURE.replace('.tran 5ns 200ns', '.options reltol=1e-6\n.tran 5ns 200ns 0 10ps');

function interpolate(time: Float64Array | number[], values: Float64Array | number[], at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

describe('PULSE with omitted TR/TF/PER parameters behaves like ngspice-47 (#469)', () => {
  it('rises over TSTEP when TR is omitted, as ngspice-47 does (ngspice tests/general/rc.cir)', async () => {
    // `pulse (0 1)` under `.tran 0.1 7.0`: ngspice-47 ramps v(1) from 0 at
    // t=0 to 1 at TSTEP = 0.1 (v(1) = 7.0e-3 at its 7.0e-4 s first point).
    const rc = readFileSync(
      new URL('../../../benchmarks/corpus/ngspice/fixtures/tests/general/rc.cir', import.meta.url),
      'utf8',
    );
    const { transient } = await simulate(rc);
    const time = Array.from(transient!.time);
    const v1 = Array.from(transient!.voltage('1'));
    expect(time.some(t => Math.abs(t - 0.1) < 1e-14)).toBe(true);
    for (let i = 0; i < time.length; i++) {
      expect(v1[i]).toBeCloseTo(Math.min(time[i] / 0.1, 1), 9);
    }
  });

  it('lands on the 2 ns and 4 ns corners of the unchanged corpus-e RTL chain', async () => {
    const { transient } = await simulate(FIXTURE);
    const time = Array.from(transient!.time);
    for (const corner of [2e-9, 4e-9, 84e-9, 86e-9]) {
      expect(Math.min(...time.map(t => Math.abs(t - corner)))).toBeLessThan(1e-14);
    }
  });

  it('keeps v(3) at default settings within 20 mV of the same deck run to convergence', async () => {
    const [defaults, converged] = await Promise.all([simulate(FIXTURE), simulate(CONVERGED)]);
    const time = Array.from(defaults.transient!.time);
    const v3 = Array.from(defaults.transient!.voltage('3'));
    const referenceTime = Array.from(converged.transient!.time);
    const reference = Array.from(converged.transient!.voltage('3'));
    let worst = 0;
    for (let i = 0; i < time.length; i++) {
      worst = Math.max(worst, Math.abs(v3[i] - interpolate(referenceTime, reference, time[i])));
    }
    // main 3a7ad44: 0.341 V; with the corners: 3.8 mV. ngspice-47 default vs its
    // own converged run on the same decks: 16 mV.
    expect(worst).toBeLessThan(0.02);
  });
});
