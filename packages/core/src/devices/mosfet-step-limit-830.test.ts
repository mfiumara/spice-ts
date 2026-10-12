import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { MOSFET } from './mosfet.js';

// Issue #830: MOS1 Newton step limiting ran per device through closures and
// array destructuring on every iteration (18% of cmos-chain-10k OP time).
// The allocation-free per-instance path and the batched list path must return
// exactly what the previous implementation returned, bit for bit.

const NETLIST = `
VDD vdd 0 3.3
VIN in 0 PULSE(0 3.3 1n 100p 100p 2n 5n)
M1 out in 0 0 NM W=2u L=1u
M2 out in vdd vdd PM W=4u L=1u
R1 out mid 1k
M3 o2 out 0 0 NM W=2u L=1u
M4 o2 out vdd vdd PM W=4u L=1u
M5 o3 o2 mid sub NM W=1u L=0.5u
M6 mid o3 o2 o2 PM W=3u L=1u
R2 o3 0 10k
R3 sub 0 1meg
M7 vdd o3 o2 0 NM W=1u L=1u
M8 0 in o3 0 NM W=1u L=1u
M9 o3 vdd in 0 NM W=1u L=1u
.model NM NMOS(VTO=0.7 KP=110u GAMMA=0.4 LAMBDA=0.04 PHI=0.65 IS=1e-15)
.model PM PMOS(VTO=-0.7 KP=50u GAMMA=0.57 LAMBDA=0.05 PHI=0.65)
.tran 0.1n 10n
`;

/** ngspice devsup.c DEVfetlim, as in mosfet.ts before #830. */
function referenceFetlim(vnew: number, vold: number, vto: number): number {
  const vtsthi = Math.abs(2 * (vold - vto)) + 2;
  const vtstlo = Math.abs(vold - vto) + 1;
  const vtox = vto + 3.5;
  const delv = vnew - vold;
  if (vold >= vto) {
    if (vold >= vtox) {
      if (delv <= 0) {
        if (vnew >= vtox) return -delv > vtstlo ? vold - vtstlo : vnew;
        return Math.max(vnew, vto + 2);
      }
      return delv >= vtsthi ? vold + vtsthi : vnew;
    }
    return delv <= 0 ? Math.max(vnew, vto - 0.5) : Math.min(vnew, vto + 4);
  }
  if (delv <= 0) return -delv > vtsthi ? vold - vtsthi : vnew;
  const vtemp = vto + 0.5;
  if (vnew <= vtemp) return delv > vtstlo ? vold + vtstlo : vnew;
  return vtemp;
}

/** MOSFET.limitNewtonStep + gateStepScale exactly as they were before #830. */
function referenceLimit(mosfet: MOSFET, previous: Float64Array, candidate: Float64Array): number {
  const [nD, nG, nS] = mosfet.nodes;
  const voltage = (solution: Float64Array, node: number): number => node >= 0 ? solution[node] : 0;
  const terminal = (solution: Float64Array, positive: number, negative: number): number =>
    voltage(solution, positive) - voltage(solution, negative);
  const vgsStep = Math.abs(terminal(candidate, nG, nS) - terminal(previous, nG, nS));
  const vdsStep = Math.abs(terminal(candidate, nD, nS) - terminal(previous, nD, nS));
  const largestStep = Math.max(vgsStep, vdsStep);
  const terminalScale = largestStep > 10 ? 10 / largestStep : 1;

  const { polarity } = mosfet.params;
  const previousVds = polarity * (voltage(previous, nD) - voltage(previous, nS));
  const reference = previousVds >= 0 ? nS : nD;
  const previousGate = polarity * (voltage(previous, nG) - voltage(previous, reference));
  const proposedGate = polarity * (voltage(candidate, nG) - voltage(candidate, reference));
  const delta = proposedGate - previousGate;
  let gateScale = 1;
  if (delta !== 0) {
    const von = (mosfet as unknown as { lastVon: number }).lastVon;
    const limited = referenceFetlim(proposedGate, previousGate, von);
    gateScale = Math.min(1, Math.max(0, (limited - previousGate) / delta));
  }
  return Math.min(terminalScale, gateScale);
}

function lockedSide(): { assembler: MNAAssembler; mosfets: MOSFET[] } {
  const compiled = parse(NETLIST).compile();
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  assembler.clear();
  const ctx = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(ctx);
  assembler.lockTopology();
  const mosfets = compiled.devices.filter((device): device is MOSFET => device instanceof MOSFET);
  return { assembler, mosfets };
}

describe('MOS1 Newton step limiting (#830)', () => {
  it('per-instance and batched limits equal the pre-#830 limit bit for bit', () => {
    const { assembler, mosfets: all } = lockedSide();
    // Ground terminals (M1, M3, M8, M9), a source on unknown 0 and
    // reverse-mode devices are covered.
    expect(all.some(mosfet => mosfet.nodes.slice(0, 3).some(node => node < 0))).toBe(true);
    expect(all.some(mosfet => mosfet.nodes[2] === 0)).toBe(true);
    const lists: MOSFET[][] = [all, all.slice(0, 4), all.slice(3), [...all], [all[7], all[2], all[5]], all];
    let limitedSteps = 0;
    let zeroVds = 0;
    let zeroGateStep = 0;
    for (let pass = 0; pass < 48; pass++) {
      const list = lists[pass % lists.length];
      if (pass === 13) for (const mosfet of [all[1], all[4]]) mosfet.setTemperature(85);
      // Every fourth pass puts the solution on a coarse grid, so terminals
      // coincide (vds = 0 exactly) and gate steps cancel (delta = 0 exactly).
      const coarse = pass % 4 === 1;
      for (let i = 0; i < assembler.systemSize; i++) {
        assembler.solution[i] = coarse
          ? (i * 5 + pass) % 3
          : 2.5 * Math.sin(1.3 * i + 0.9 * pass) - 0.4 * ((i + pass) % 3);
      }
      assembler.clear();
      if (pass % 4 === 3) {
        const ctx = assembler.getStampContext(1);
        for (const mosfet of list) mosfet.stamp(ctx);
      } else {
        MOSFET.batchStamp(
          list, assembler.gValues, assembler.b, assembler.solution, assembler.stampIndex,
          assembler.deviceGmin,
        );
      }
      const previous = new Float64Array(assembler.solution);
      // Small, large (> 10 V terminal step) and zero-gate-step candidates; on
      // coarse passes, whole-grid steps of 0 or 15 V, so a gate and its
      // reference can move together while the drain moves by more than 10 V.
      const amplitude = [0.3, 4, 30][pass % 3];
      const candidate = coarse
        ? previous.map((value, i) => value + 15 * ((i * 3 + pass) % 2))
        : previous.map((value, i) => value + amplitude * Math.cos(i * 0.7 + pass));
      if (pass % 6 === 5) candidate.set(previous);

      let expectedMin = 1;
      for (const mosfet of all) {
        const expected = referenceLimit(mosfet, previous, candidate);
        expect(Object.is(mosfet.limitNewtonStep(previous, candidate), expected)).toBe(true);
        if (expected < 1) limitedSteps++;
        if (list.includes(mosfet)) expectedMin = Math.min(expectedMin, expected);
        const v = (x: Float64Array, node: number): number => (node >= 0 ? x[node] : 0);
        const [d, g, s] = mosfet.nodes;
        if (v(previous, d) === v(previous, s)) zeroVds++;
        if (expected < 1 && v(candidate, g) - v(previous, g) === v(candidate, s) - v(previous, s)) zeroGateStep++;
      }
      expect(Object.is(MOSFET.batchNewtonStepScale(list, previous, candidate), expectedMin)).toBe(true);
    }
    // The comparison must exercise the limiting branches, not only scale = 1.
    expect(limitedSteps).toBeGreaterThan(20);
    expect(zeroVds).toBeGreaterThan(5);
    expect(zeroGateStep).toBeGreaterThan(2);
  });

  it('returns 1 for an empty list', () => {
    expect(MOSFET.batchNewtonStepScale([], new Float64Array(2), new Float64Array([5, 7]))).toBe(1);
  });
});
