import type { ResolvedOptions, DCSweepAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCResult } from '../results.js';
import { InvalidCircuitError } from '../errors.js';

export function solveDCOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
): { result: DCResult; assembler: MNAAssembler } {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

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

  newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);

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
