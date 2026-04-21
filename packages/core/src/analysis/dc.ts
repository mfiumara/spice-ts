import type { ResolvedOptions, DCSweepAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCResult } from '../results.js';

/**
 * GMIN stepping schedule for DC operating point. Starts from an easy problem
 * (large artificial conductance) and homotopes down to the user-configured
 * gmin, reusing each converged iterate as the initial guess for the next
 * lower gmin. Mirrors ngspice `CKTop` / `dynamic_gmin` from cktop.c.
 *
 * GMIN stepping is a *DC-OP* technique — never a transient-step technique.
 * Committing GMIN-distorted solutions as real transient output samples
 * breaks LC tanks and switching converters (issues #42, #43, #45).
 */
const DC_GMIN_SCHEDULE = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11] as const;

export function solveDCOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): { result: DCResult; assembler: MNAAssembler } {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

  if (initialSolution) {
    assembler.solution.set(initialSolution);
  }

  // Source ramping: gradually ramp source voltages to help NR convergence
  // for circuits with many nonlinear devices (e.g., CMOS inverter chains).
  const hasNonlinear = devices.some(d => d.isNonlinear);
  if (hasNonlinear) {
    const rampSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const scale of rampSteps) {
      const savedSolution = new Float64Array(assembler.solution);
      assembler.sourceScale = scale;
      try {
        newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);
      } catch {
        // Restore last good solution so divergence doesn't cascade
        assembler.solution.set(savedSolution);
      }
    }
    assembler.sourceScale = 1.0;
  }

  try {
    newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);
  } catch (err) {
    if (!hasNonlinear) throw err;
    // Fallback: GMIN stepping homotopy. Solve at each elevated gmin level,
    // handing each converged iterate off as the initial guess for the next
    // lower gmin. Then finish with the user-configured gmin.
    const savedSolution = new Float64Array(assembler.solution);
    if (!gminStepping(assembler, devices, options, nodeNames)) {
      assembler.solution.set(savedSolution);
      throw err;
    }
  }

  const voltageMap = new Map<string, number>();
  for (let i = 0; i < nodeNames.length; i++) {
    voltageMap.set(nodeNames[i], assembler.solution[i]);
  }

  const currentMap = new Map<string, number>();
  for (let i = 0; i < branchNames.length; i++) {
    currentMap.set(branchNames[i], assembler.solution[nodeCount + i]);
  }

  return {
    result: new DCResult(voltageMap, currentMap),
    assembler,
  };
}

function gminStepping(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
): boolean {
  // Ramp gmin from large (easy to solve) down to the user target, warm-
  // starting each solve from the previous converged iterate.
  for (const gmin of DC_GMIN_SCHEDULE) {
    if (gmin <= options.gmin) break;
    try {
      newtonRaphson(assembler, devices, { ...options, gmin }, options.maxIterations, nodeNames);
    } catch {
      return false;
    }
  }
  // Final solve at the user-configured gmin — this is the committed answer.
  try {
    newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);
    return true;
  } catch {
    return false;
  }
}
