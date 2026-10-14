// Evidence only. Instance-local experiment, never imported by production.
import { BJT } from '../devices/bjt.js';
import type { CompiledCircuit } from '../circuit.js';
import type { TransientChargeState } from '../devices/charge-state.js';
import type { StampContext } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import { createTransientSim } from './transient-driver.js';

interface ChargePoint {
  nodeVBE: number; nodeVBC: number; nodeVBX: number; vSub: number;
  substrateNode: number; qBE: number; qBC: number; qBX: number; qSub: number;
  capBE: number; capBC: number; capBX: number; capSub: number; crossCapacitance: number;
}
interface ChargeAccess {
  charges: TransientChargeState;
  chargesAtLimitedJunctions: boolean;
  params: { polarity: number; SUBS: number };
  externalBaseNode: number;
  substrateNode: number;
  evaluateCharges(ctx: StampContext, limited: boolean): ChargePoint;
}
interface BranchTerm {
  name: string; positive: number; negative: number;
  current: number; conductance: number; voltage: number; anchorVoltage: number;
  equivalent: number; centeredCurrent: number;
}
interface AssemblyRow {
  time: number; dt: number; anchor: number[]; beforeRhs: number[];
  beforeResidual: number[]; afterRhs: number[]; afterResidual: number[];
  prechargeResidual: number[]; branches: BranchTerm[];
  rhsAdds: { row: number; value: number; before: number; after: number }[];
}
function residual(assembler: MNAAssembler): Float64Array {
  const out = new Float64Array(assembler.b);
  if (!assembler.isFastPath) {
    // Match the locked CSC column-first accumulation order.
    for (let col = 0; col < assembler.systemSize; col++) {
      for (let row = 0; row < assembler.systemSize; row++) {
        const value = assembler.G.getRow(row).get(col);
        if (value !== undefined) out[row] -= value * assembler.solution[col];
      }
    }
    return out;
  }
  const matrix = assembler.getCscMatrix();
  for (let col = 0; col < matrix.size; col++) {
    for (let k = matrix.colPtr[col]; k < matrix.colPtr[col + 1]; k++) {
      out[matrix.rowIdx[k]] -= matrix.values[k] * assembler.solution[col];
    }
  }
  return out;
}

/** Shift only the charge load before its absolute companion terms are formed.
 * The remaining static/C-matrix system is still centered after its assembly.
 * This is a boundary experiment, NOT a general reference-centered solver.
 */
export async function probePrecharge(text: string, usePrecharge: boolean) {
  const sim = await createTransientSim(text);
  const { assembler, compiled } = sim as unknown as { assembler: MNAAssembler; compiled: CompiledCircuit };
  const bjts = compiled.devices.filter(device => device instanceof BJT) as BJT[];
  if (bjts.length !== 1) throw new Error('The evidence probe requires exactly one BJT');
  const bjt = bjts[0];
  if (compiled.devices.some(device => device !== bjt && device.stampTransientCharge !== undefined)) {
    throw new Error('Other charge-integrating devices are outside this evidence probe');
  }
  const access = bjt as unknown as ChargeAccess;
  const rows: AssemblyRow[] = [];
  let pendingResidual: Float64Array | undefined;
  const original = bjt.stampTransientCharge.bind(bjt);
  bjt.stampTransientCharge = (ctx, integration) => {
    const beforeRhs = Array.from(assembler.b);
    const beforeResidual = residual(assembler);
    const shifted = new Float64Array(beforeResidual);
    const point = { ...access.evaluateCharges(ctx, access.chargesAtLimitedJunctions) };
    access.charges.begin(integration);
    const factor = access.charges.factor;
    const { polarity, SUBS } = access.params;
    const [c, b, e] = bjt.nodes;
    const at = (node: number) => node < 0 ? 0 : assembler.solution[node];
    const branches: BranchTerm[] = [];
    const branch = (name: string, positive: number, negative: number, current: number, conductance: number, voltage: number, cross = 0) => {
      const anchorVoltage = at(positive) - at(negative);
      // Subtract branch voltages BEFORE multiplying by the large conductance.
      const centeredCurrent = current + conductance * (anchorVoltage - voltage) + cross;
      branches.push({ name, positive, negative, current, conductance, voltage, anchorVoltage, equivalent: current - conductance * voltage, centeredCurrent });
      if (positive >= 0) shifted[positive] -= centeredCurrent;
      if (negative >= 0) shifted[negative] += centeredCurrent;
    };
    const cross = factor * point.crossCapacitance;
    branch('qbe', b, e, polarity * access.charges.current(0, point.qBE), factor * point.capBE, polarity * point.nodeVBE,
      cross * ((at(b) - at(c)) - polarity * point.nodeVBC));
    branch('qbc', b, c, polarity * access.charges.current(1, point.qBC), factor * point.capBC, polarity * point.nodeVBC);
    const sign = -polarity * SUBS;
    branch('qsub', point.substrateNode, access.substrateNode, sign * access.charges.current(2, point.qSub), factor * point.capSub, sign * point.vSub);
    branch('qbx', access.externalBaseNode, c, polarity * access.charges.current(3, point.qBX), factor * point.capBX, polarity * point.nodeVBX);
    // Original load still runs, including its unmodified convergence state.
    const rhsAdds: AssemblyRow['rhsAdds'] = [];
    original({ ...ctx, stampB: (row, value) => {
      const before = assembler.b[row];
      ctx.stampB(row, value);
      rhsAdds.push({ row, value, before, after: assembler.b[row] });
    } }, integration);
    rows.push({ time: ctx.time, dt: ctx.dt, anchor: Array.from(assembler.solution), beforeRhs, beforeResidual: Array.from(beforeResidual), afterRhs: Array.from(assembler.b), afterResidual: Array.from(residual(assembler)), prechargeResidual: Array.from(shifted), branches, rhsAdds });
    pendingResidual = shifted;
  };
  const getSolver = assembler.getSparseSolver.bind(assembler);
  let installed = false;
  assembler.getSparseSolver = () => {
    const solver = getSolver();
    if (installed) return solver;
    installed = true;
    const solve = solver.solve.bind(solver);
    solver.solve = rhs => {
      if (!usePrecharge) return solve(rhs);
      if (pendingResidual === undefined) throw new Error('Missing precharge load');
      const answer = solve(pendingResidual);
      for (let i = 0; i < answer.length; i++) answer[i] += assembler.solution[i];
      return answer;
    };
    return solver;
  };
  const initial = Array.from(assembler.solution);
  const points: { time: number; vbe: number; vbc: number }[] = [];
  let error: string | null = null;
  const start = performance.now();
  try {
    while (!sim.isDone) {
      const point = sim.advance();
      const [c, b, e] = bjt.nodes;
      const at = (node: number) => node < 0 ? 0 : assembler.solution[node];
      points.push({ time: point.time, vbe: at(b) - at(e), vbc: at(b) - at(c) });
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.name : String(caught);
  }
  const result = { usePrecharge, initial, nodes: bjt.nodes, error, time: sim.simTime, runtimeMs: performance.now() - start, convergence: structuredClone(sim.convergence), points, rows };
  sim.dispose();
  return result;
}
