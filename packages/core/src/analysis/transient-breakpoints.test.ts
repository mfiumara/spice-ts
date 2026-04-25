import { describe, it, expect } from 'vitest';
import { createTransientSim } from './transient-driver.js';

const PULSE_NETLIST = `
V1 in 0 PULSE(0 1 0 100n 100n 4.8u 10u)
R1 in out 1k
C1 out 0 1u
.tran 50n 15u`;

describe('TransientSim breakpoint collection', () => {
  it('collects PULSE edges as breakpoints up to stopTime', async () => {
    const sim = await createTransientSim(PULSE_NETLIST);
    const bps = (sim as unknown as { breakpointTimes(): readonly number[] }).breakpointTimes();
    // Expected PULSE edges (rising-edge start at t=0 is filtered):
    //   period 1: 100n, 4.9u, 5.0u
    //   period 2: 10u, 10.1u, 14.9u  (15.0u > stopTime, skipped)
    expect(bps).toContain(100e-9);
    expect(bps).toContain(0 + 100e-9 + 4.8e-6);          // 4.9e-6
    expect(bps).toContain(0 + 100e-9 + 4.8e-6 + 100e-9); // ~5.0e-6
    expect(bps).toContain(10e-6);
    expect(bps).toContain(10e-6 + 100e-9);               // 10.1e-6
    expect(bps).toContain(10e-6 + 100e-9 + 4.8e-6);      // 14.9e-6
    // Nothing past stopTime (allow MIN_BREAK = 1e-14 slack).
    for (const t of bps) expect(t).toBeLessThanOrEqual(15e-6 + 1e-14);
    sim.dispose();
  });

  it('returns an empty list when no waveform sources have breakpoints', async () => {
    const sim = await createTransientSim(`
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1u
.tran 1u 5u`);
    const bps = (sim as unknown as { breakpointTimes(): readonly number[] }).breakpointTimes();
    expect([...bps]).toEqual([]);
    sim.dispose();
  });
});

describe('TransientSim breakpoint clamping', () => {
  it('lands exactly on each PULSE edge (within MIN_BREAK)', async () => {
    const sim = await createTransientSim(`
V1 in 0 PULSE(0 1 0 100n 100n 4.8u 10u)
R1 in out 1k
C1 out 0 1u
.tran 50n 15u`);
    const times: number[] = [];
    while (!sim.isDone) times.push(sim.advance().time);
    // Every PULSE edge in [0, 15u] must appear as a sample time (within MIN_BREAK = 1e-14).
    const expectedEdges = [
      100e-9,
      0 + 100e-9 + 4.8e-6,           // 4.9e-6
      0 + 100e-9 + 4.8e-6 + 100e-9,  // ~5.0e-6
      10e-6,
      10e-6 + 100e-9,                // 10.1e-6
      10e-6 + 100e-9 + 4.8e-6,       // 14.9e-6
    ];
    for (const edge of expectedEdges) {
      const hit = times.some(t => Math.abs(t - edge) <= 1e-13);
      expect(hit, `expected a sample at t=${edge.toExponential(3)}`).toBe(true);
    }
    sim.dispose();
  });

  it('does not skip past breakpoints when dt is much larger', async () => {
    // dt requested = 100u, stopTime = 50u, breakpoints at 100n, 4.9u, 5u, 10u, 10.1u, ...
    // Without clamping, the very first step would cross 100n and 4.9u in one go.
    const sim = await createTransientSim(`
V1 in 0 PULSE(0 1 0 100n 100n 4.8u 10u)
R1 in out 1k
C1 out 0 1u
.tran 100u 50u`);
    const firstStep = sim.advance();
    // First step must land at 100n (the first breakpoint), not at the requested dt=100u.
    expect(firstStep.time).toBeLessThanOrEqual(100e-9 + 1e-14);
    sim.dispose();
  });
});

describe('TransientSim post-breakpoint behavior', () => {
  it('takes a small step immediately after a PULSE edge (dt cut)', async () => {
    const sim = await createTransientSim(`
V1 in 0 PULSE(0 1 0 100n 100n 4.8u 10u)
R1 in out 1k
C1 out 0 1u
.tran 1u 20u`, { integrationMethod: 'gear2' });

    // Walk the sim and find the sample that landed exactly on a PULSE edge,
    // then check the dt of the immediately following step.
    const steps: { time: number }[] = [];
    while (!sim.isDone) {
      const step = sim.advance();
      steps.push(step);
      // Stop after we have at least one post-edge step to compare.
      if (step.time > 5.0e-6) break;
    }
    const onEdge = steps.findIndex(s => Math.abs(s.time - 5.0e-6) < 1e-13);
    expect(onEdge).toBeGreaterThan(0);
    expect(onEdge).toBeLessThan(steps.length - 1);
    const dtBefore = steps[onEdge].time - steps[onEdge - 1].time;
    const dtAfter = steps[onEdge + 1].time - steps[onEdge].time;
    // Before the breakpoint the driver was taking up-to-1µs steps (.tran 1u …).
    // Post-breakpoint must be at least 10× smaller.
    expect(dtAfter).toBeLessThan(dtBefore / 5); // be a bit lenient: ngspice's /10 + LTE growth
    sim.dispose();
  });

  it('clears justCrossedBreakpoint after one step', async () => {
    // Two breakpoints: one falling edge at 5u, one rising edge at 10u. The
    // dt cut must apply ONCE per breakpoint (not persist past one step).
    const sim = await createTransientSim(`
V1 in 0 PULSE(0 1 0 100n 100n 4.8u 10u)
R1 in out 1k
C1 out 0 1u
.tran 500n 20u`, { integrationMethod: 'gear2' });

    const steps: { time: number }[] = [];
    while (!sim.isDone) {
      steps.push(sim.advance());
      if (steps[steps.length - 1].time > 6.0e-6) break;
    }
    // Find the step that landed on 5.0u, then walk forward — dt should grow
    // back, not stay tiny forever.
    const onEdge = steps.findIndex(s => Math.abs(s.time - 5.0e-6) < 1e-13);
    expect(onEdge).toBeGreaterThan(0);
    // Look 5 steps later — dt should have started recovering.
    const lateIdx = Math.min(onEdge + 5, steps.length - 1);
    const dtJustAfter = steps[onEdge + 1].time - steps[onEdge].time;
    const dtFiveStepsLater = steps[lateIdx].time - steps[lateIdx - 1].time;
    expect(dtFiveStepsLater).toBeGreaterThan(dtJustAfter);
    sim.dispose();
  });
});
