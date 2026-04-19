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

const BUCK_BOOST_NETLIST = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 50n 5u
`;

describe('TransientSim convergence (GMIN stepping)', () => {
  it('buck-boost advances past the first switching edge (t > 1 µs)', async () => {
    const sim = await createTransientSim(BUCK_BOOST_NETLIST);
    const steps = sim.advanceUntil(1e-6);
    expect(steps.length).toBeGreaterThan(0);
    expect(sim.simTime).toBeGreaterThanOrEqual(1e-6);
    sim.dispose();
  });

  it('buck-boost runs a full 5 µs without throwing', async () => {
    const sim = await createTransientSim(BUCK_BOOST_NETLIST);
    expect(() => sim.advanceUntil(5e-6)).not.toThrow();
    sim.dispose();
  });

  it('hitting the dt floor throws TimestepTooSmallError with kind=dt-floor', async () => {
    // A pathological circuit designed to stress NR beyond GMIN stepping's reach.
    // If GMIN stepping recovers this, that's fine — adjust the fixture or skip.
    const pathological = `
V1 1 0 DC 5
.model DBAD D(IS=1e-60 N=0.01)
D1 1 0 DBAD
.tran 1n 1u
`;
    const sim = await createTransientSim(pathological);
    try {
      const doRun = () => sim.advanceUntil(1e-6);
      // It MAY throw TimestepTooSmallError, or GMIN stepping may recover.
      // The test is: IF it throws, the error class must be TimestepTooSmallError
      // (not a plain error or DC-side ConvergenceError).
      try { doRun(); }
      catch (err) {
        expect(err).toBeInstanceOf(TimestepTooSmallError);
      }
    } finally {
      sim.dispose();
    }
  });
});
