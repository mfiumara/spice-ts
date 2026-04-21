import { describe, it, expect } from 'vitest';
import { createTransientSim } from './transient-driver.js';
import { TimestepTooSmallError } from '../errors.js';

const RC_NETLIST = `
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 1u 1m
`;

describe('createTransientSim', () => {
  it('returns a driver with simTime=0 after creation', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    expect(sim.simTime).toBe(0);
    expect(sim.isDone).toBe(false);
    sim.dispose();
  });

  it('advance() returns a TransientStep with time > 0', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const step = sim.advance();
    expect(step.time).toBeGreaterThan(0);
    expect(step.voltages.has('1')).toBe(true);
    expect(step.voltages.has('2')).toBe(true);
    expect(sim.simTime).toBe(step.time);
    sim.dispose();
  });

  it('advanceUntil(t) returns multiple steps', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const steps = sim.advanceUntil(100e-6);
    expect(steps.length).toBeGreaterThan(3);
    expect(steps[steps.length - 1].time).toBeGreaterThanOrEqual(100e-6);
    sim.dispose();
  });

  it('isDone becomes true once simTime crosses stopTime', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    sim.advanceUntil(2e-3); // past stopTime=1ms
    expect(sim.isDone).toBe(true);
    sim.dispose();
  });

  it('reset() restores simTime to 0 and replays produce the same first step', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const a = sim.advance();
    sim.reset();
    expect(sim.simTime).toBe(0);
    const b = sim.advance();
    expect(b.time).toBeCloseTo(a.time, 12);
    for (const node of ['1', '2']) {
      expect(b.voltages.get(node)).toBeCloseTo(a.voltages.get(node)!, 9);
    }
    sim.dispose();
  });

  it('advance() after dispose() throws', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    sim.dispose();
    expect(() => sim.advance()).toThrow();
  });

  it('matches simulate() trajectory on RC circuit', async () => {
    const { simulate } = await import('../simulate.js');
    const baseline = await simulate(RC_NETLIST);
    const baselineV2 = baseline.transient!.voltage('2');

    const sim = await createTransientSim(RC_NETLIST);
    const steps = sim.advanceUntil(1e-3);
    sim.dispose();

    // The driver produces its own timestep schedule (may not match exactly
    // but should converge to the same RC step response within ~1e-9 at common
    // points). Compare steady-state value only as a lightweight check.
    const finalDriver = steps[steps.length - 1];
    const driverV2 = finalDriver.voltages.get('2')!;
    const baselineFinal = baselineV2[baselineV2.length - 1];
    expect(driverV2).toBeCloseTo(baselineFinal, 9);
  });
});

describe('TransientSim boundary behavior', () => {
  it('advance() past isDone does not produce dt=0 (no division-by-zero)', async () => {
    // Regression: previously, the grow-factor clamp at the end of the last
    // step set `dt = stopTime - this.time` which evaluates to 0 once time has
    // reached stopTime. Calling advance() again then passed dt=0 into
    // `buildCompanionSystem`, producing `Infinity` in the matrix.
    const sim = await createTransientSim(RC_NETLIST);
    sim.advanceUntil(2e-3);
    expect(sim.isDone).toBe(true);
    // Spec: stopTime is advisory, advance() may be called past it.
    const step = sim.advance();
    expect(Number.isFinite(step.time)).toBe(true);
    expect(step.time).toBeGreaterThan(sim.stopTime!);
    for (const v of step.voltages.values()) expect(Number.isFinite(v)).toBe(true);
    sim.dispose();
  });
});

describe('TransientSim convergence', () => {
  it('hitting the dt floor throws TimestepTooSmallError', async () => {
    // Force dt-floor by starving NR of iterations. Every attemptStep call
    // returns ok=false immediately, so the driver keeps cutting dt by 8 until
    // it falls below MIN_TIMESTEP.
    const sim = await createTransientSim(`
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 1u 1m
`, { maxTransientIterations: 0 });
    try {
      expect(() => sim.advanceUntil(1e-6)).toThrow(TimestepTooSmallError);
    } finally {
      sim.dispose();
    }
  });
});
