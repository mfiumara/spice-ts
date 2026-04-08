import type { ResolvedOptions, TransientAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { solveLU } from '../solver/lu-solver.js';
import { TimestepTooSmallError } from '../errors.js';
import { TransientResult } from '../results.js';

const MIN_TIMESTEP = 1e-18;

export function solveTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): TransientResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

  // Set initial conditions from DC operating point
  if (initialSolution) {
    assembler.solution.set(initialSolution);
  }

  const maxDt = analysis.maxTimestep ?? (analysis.stopTime / 50);
  let dt = Math.min(analysis.timestep, maxDt);

  // Storage for results
  const timePoints: number[] = [0];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();

  for (const name of nodeNames) {
    voltageArrays.set(name, [assembler.solution[compiled.nodeIndexMap.get(name)!]]);
  }
  for (let i = 0; i < branchNames.length; i++) {
    currentArrays.set(branchNames[i], [assembler.solution[nodeCount + i]]);
  }

  let time = 0;

  while (time < analysis.stopTime - dt * 0.001) {
    const prevSol = new Float64Array(assembler.solution);
    const nextTime = Math.min(time + dt, analysis.stopTime);
    const actualDt = nextTime - time;

    assembler.setTime(nextTime, actualDt);

    let converged = false;

    for (let iter = 0; iter < options.maxTransientIterations; iter++) {
      buildCompanionSystem(assembler, devices, actualDt, options.integrationMethod, prevSol);

      const x = solveLU(assembler.G, new Float64Array(assembler.b));

      const prev = new Float64Array(assembler.solution);
      assembler.solution.set(x);

      if (isConvergedTransient(x, prev, nodeCount, options)) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      dt = dt / 4;
      if (dt < MIN_TIMESTEP) {
        throw new TimestepTooSmallError(time, dt);
      }
      assembler.solution.set(prevSol);
      continue;
    }

    // Record result
    time = nextTime;
    timePoints.push(time);

    for (const name of nodeNames) {
      voltageArrays.get(name)!.push(assembler.solution[compiled.nodeIndexMap.get(name)!]);
    }
    for (let i = 0; i < branchNames.length; i++) {
      currentArrays.get(branchNames[i])!.push(assembler.solution[nodeCount + i]);
    }

    // Adaptive: grow timestep if converged
    dt = Math.min(dt * 1.5, maxDt, analysis.stopTime - time);
    if (dt < MIN_TIMESTEP && time < analysis.stopTime - MIN_TIMESTEP) break;
  }

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}

function isConvergedTransient(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  options: ResolvedOptions,
): boolean {
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = i < numNodes
      ? options.vntol + options.reltol * Math.abs(current[i])
      : options.abstol + options.reltol * Math.abs(current[i]);
    if (diff > tol) return false;
  }
  return true;
}
