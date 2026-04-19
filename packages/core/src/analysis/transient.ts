import type { ResolvedOptions, TransientAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { TransientResult } from '../results.js';
import { createDriverFromCompiled } from './transient-driver.js';

/**
 * One-shot transient analysis. Consumes a {@link TransientSim} internally
 * and accumulates every timestep into a {@link TransientResult}.
 */
export function solveTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): TransientResult {
  const { nodeNames, branchNames } = compiled;
  const driver = createDriverFromCompiled(compiled, options, {
    stopTime: analysis.stopTime,
    timestep: analysis.timestep,
    maxTimestep: analysis.maxTimestep ?? Math.min(analysis.timestep, analysis.stopTime / 50),
    initialSolution,
  });

  const timePoints: number[] = [0];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  // Seed with the DC operating point at t=0
  const initialStep = driver.peekInitialStep();
  for (const [name, v] of initialStep.voltages) voltageArrays.get(name)!.push(v);
  for (const [name, i] of initialStep.currents) currentArrays.get(name)!.push(i);

  try {
    while (!driver.isDone) {
      const step = driver.advance();
      timePoints.push(step.time);
      for (const [name, v] of step.voltages) voltageArrays.get(name)!.push(v);
      for (const [name, i] of step.currents) currentArrays.get(name)!.push(i);
    }
  } finally {
    driver.dispose();
  }

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}
