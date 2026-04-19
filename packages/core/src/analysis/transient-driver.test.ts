import { describe, it, expect } from 'vitest';
import { createTransientSim } from './transient-driver.js';

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
});
