import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { resolveOptions } from '../types.js';
import { attemptStep } from './transient-step.js';
import { createTransientSim } from './transient-driver.js';

/**
 * Issue #376: the transient Newton loop clamped every node-voltage update to
 * 3.5 V per iteration, so a linear node whose solution jumps further than
 * 3.5 V x maxTransientIterations could never converge. ngspice limits only
 * device junction/terminal voltages (pnjlim, fetlim, limvds).
 */

function buildContext(netlist: string) {
  const compiled = parse(netlist).compile();
  const options = resolveOptions(undefined, 1e-3);
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  return { compiled, options, assembler };
}

function nodeIndex(compiled: { nodeNames: string[] }, name: string): number {
  const index = compiled.nodeNames.indexOf(name);
  if (index < 0) throw new Error(`node ${name} not found`);
  return index;
}

describe('transient Newton limiting on linear nodes (issue #376)', () => {
  it('converges a purely linear 1 kV step in one Newton solve', () => {
    const { compiled, options, assembler } = buildContext(`
V1 1 0 DC 1000
R1 1 2 1k
R2 2 0 1k
.tran 1u 1m
`);
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iterations).toBeLessThanOrEqual(2);
      expect(result.solution[nodeIndex(compiled, '2')]).toBeCloseTo(500, 6);
    }
  });

  it('still damps the terminal nodes of a nonlinear device without its own junction limit', () => {
    const { compiled, options, assembler } = buildContext(`
V1 1 0 DC 100
R1 1 2 1k
V2 3 0 DC 5
M1 2 3 0 0 NMOD W=10u L=1u
.model NMOD NMOS(VTO=1 KP=1e-5)
.tran 1u 1m
`);
    const prevSol = new Float64Array(assembler.solution);

    attemptStep(
      { compiled, assembler, options: { ...options, maxTransientIterations: 1 } },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    // Node 1 is only touched by V1/R1: it takes the full linear update.
    expect(assembler.solution[nodeIndex(compiled, '1')]).toBeCloseTo(100, 9);
    // Node 2 is the MOSFET drain: its first update stays capped at 3.5 V.
    expect(Math.abs(assembler.solution[nodeIndex(compiled, '2')])).toBeLessThanOrEqual(3.5 + 1e-12);
  });

  it('leaves diode-only nodes to the diode junction limit (ngspice pnjlim)', () => {
    const { compiled, options, assembler } = buildContext(`
V1 1 0 DC 100
R1 1 2 1k
D1 2 0 DMOD
.model DMOD D(IS=1e-14)
.tran 1u 1m
`);
    const prevSol = new Float64Array(assembler.solution);

    const first = attemptStep(
      { compiled, assembler, options: { ...options, maxTransientIterations: 1 } },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );
    // The first solve linearises the diode at 0 V, so the anode takes the full
    // update instead of a node cap; the diode limits its junction next stamp.
    expect(first.ok).toBe(false);
    expect(assembler.solution[nodeIndex(compiled, '2')]).toBeGreaterThan(3.5);

    assembler.solution.set(prevSol);
    const result = attemptStep(
      { compiled, assembler, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const anode = result.solution[nodeIndex(compiled, '2')];
      const vt = (1.38064852e-23 / 1.6021766208e-19) * 300.15;
      const diode = 1e-14 * Math.expm1(anode / vt) + 1e-12 * anode;
      // Converged on the exact diode law, not a compressed junction.
      expect(Math.abs(vt * Math.log(((100 - anode) / 1e3) / diode))).toBeLessThan(1e-5);
    }
  });

  it('completes the delayed-sine inductor repro and tracks V(2) = -L di/dt', async () => {
    const sim = await createTransientSim(`delayed sine current into inductor
I1 1 0 SIN(0 5 1k 0.5m)
L1 2 0 10mH
R1 1 2 0.001
.tran 0.1m 5m
`);
    const samples: Array<{ time: number; v2: number }> = [];
    let accepted = 0;
    while (!sim.isDone && accepted < 50_000) {
      const step = sim.advance();
      accepted++;
      samples.push({ time: step.time, v2: step.voltages.get('2')! });
    }
    expect(sim.isDone).toBe(true);
    sim.dispose();

    // SPICE current-source convention: I1 pushes 5 sin(...) A from node 1
    // through the source to ground, so the inductor current from 2 to 0 is
    // -i(t) and V(2) = -L di/dt = -L * 5 * w * cos(w (t - td)), amplitude
    // 314 V. On this 0.1 ms TMAX grid ngspice-47 (59 points, bounded only by
    // INDtrunc) is itself 156 V off that analytic curve; spice-ts follows
    // ngspice's INDtrunc step control (#621), so compare with ngspice-47 on
    // the identical deck, linearly interpolated at these times.
    const amplitude = 10e-3 * 5 * 2 * Math.PI * 1e3;
    const ngspice: ReadonlyArray<readonly [number, number]> = [
      [1.75e-3, 21.9491], [2e-3, 195.557], [2.5e-3, -195.557], [3e-3, 195.557],
      [3.5e-3, -195.557], [4e-3, 195.557], [4.5e-3, -195.557], [5e-3, 174.514],
    ];
    expect(samples.length).toBeLessThan(2 * 59);
    for (const [time, expected] of ngspice) {
      const after = samples.findIndex(sample => sample.time >= time - 1e-15);
      const before = samples[Math.max(after - 1, 0)]!;
      const next = samples[after]!;
      const v2 = next.time === before.time
        ? next.v2
        : before.v2 + (next.v2 - before.v2) * (time - before.time) / (next.time - before.time);
      expect(Math.abs(v2 - expected)).toBeLessThan(0.02 * amplitude);
    }
  });
});
