// Evidence only. Centering AFTER assembly cannot recover stamp cancellation.
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';
import { BJT } from '../../packages/core/src/devices/bjt.js';
import type { CompiledCircuit } from '../../packages/core/src/circuit.js';
import type { MNAAssembler } from '../../packages/core/src/mna/assembler.js';

// Self-written rest reduction, rounded parameters; MIT, same as spice-ts.
export const REST = `Reverse-biased BJT centered-solve reduction (#1037)
V1 c 0 46.5
Q1 c 0 0 N
.model N NPN(IS=1e-14 BF=200 BR=6 VAF=75 CJC=7p CJE=22p TR=50n TF=400p RB=10 RC=1)
.options rshunt=1G
.tran 100f 10p
.end
`;

interface Load {
  vBE: number; vBC: number; collectorCurrent: number; baseCurrent: number;
  gmForward: number; gmReverse: number; gpi: number; gmu: number;
}
interface SolveRow {
  time: number; dt: number; anchor: number[]; rhs: number[]; residual: number[];
  direct: number[]; centered: number[]; matrix: { colPtr: number[]; rowIdx: number[]; values: number[] };
}
interface CheckRow {
  time: number; dt: number; passed: boolean; limited: boolean;
  load: Load; vBE: number; vBC: number; deltaVBE: number; deltaVBC: number;
  baseError: number; baseTolerance: number; solution: number[];
}

export async function probe(text: string, centered: boolean) {
  const sim = await createTransientSim(text);
  const driver = sim as unknown as { assembler: MNAAssembler; compiled: CompiledCircuit };
  const { assembler, compiled } = driver;
  const initial = Array.from(assembler.solution);
  const bjt = compiled.devices.find(device => device instanceof BJT) as BJT;
  const solves: SolveRow[] = [];
  const checks: CheckRow[] = [];
  const getSolver = assembler.getSparseSolver.bind(assembler);
  let installed = false;
  assembler.getSparseSolver = () => {
    const solver = getSolver();
    if (installed) return solver;
    installed = true;
    const solve = solver.solve.bind(solver);
    solver.solve = rhs => {
    const matrix = assembler.getCscMatrix();
    const anchor = new Float64Array(assembler.solution);
    const residual = new Float64Array(rhs);
    for (let col = 0; col < matrix.size; col++) {
      for (let k = matrix.colPtr[col]; k < matrix.colPtr[col + 1]; k++) {
        residual[matrix.rowIdx[k]] -= matrix.values[k] * anchor[col];
      }
    }
    const direct = solve(new Float64Array(rhs));
    const shifted = solve(new Float64Array(residual));
    for (let i = 0; i < shifted.length; i++) shifted[i] += anchor[i];
    solves.push({ time: assembler.time, dt: assembler.dt, anchor: Array.from(anchor), rhs: Array.from(rhs), residual: Array.from(residual), direct: Array.from(direct), centered: Array.from(shifted), matrix: { colPtr: Array.from(matrix.colPtr), rowIdx: Array.from(matrix.rowIdx), values: Array.from(matrix.values) } });
    return centered ? shifted : direct;
    };
    return solver;
  };
  const check = bjt.convergenceTest.bind(bjt);
  bjt.convergenceTest = (solution, tolerances) => {
    const passed = check(solution, tolerances);
    const load = { ...(bjt as unknown as { lastLoad: Load }).lastLoad };
    const voltage = (n: number) => n < 0 ? 0 : solution[n];
    const vBE = voltage(bjt.nodes[1]) - voltage(bjt.nodes[2]);
    const vBC = voltage(bjt.nodes[1]) - voltage(bjt.nodes[0]);
    const deltaVBE = vBE - load.vBE;
    const deltaVBC = vBC - load.vBC;
    const predicted = load.baseCurrent + load.gpi * deltaVBE + load.gmu * deltaVBC;
    checks.push({ time: assembler.time, dt: assembler.dt, passed, limited: bjt.limitedLastStamp(), load, vBE, vBC, deltaVBE, deltaVBC, baseError: Math.abs(predicted - load.baseCurrent), baseTolerance: tolerances.abstol + tolerances.reltol * Math.max(Math.abs(predicted), Math.abs(load.baseCurrent)), solution: Array.from(solution) });
    return passed;
  };
  let error: string | null = null;
  const points: { time: number; solution: number[] }[] = [];
  const start = performance.now();
  try {
    while (!sim.isDone) {
      const point = sim.advance();
      points.push({ time: point.time, solution: Array.from(assembler.solution) });
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.name : String(caught);
  }
  const result = { centered, initial, nodes: bjt.nodes, error, time: sim.simTime, runtimeMs: performance.now() - start, convergence: structuredClone(sim.convergence), points, solves, checks };
  sim.dispose();
  return result;
}
