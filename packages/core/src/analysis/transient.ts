import type {
  ConvergenceTelemetry, ResolvedOptions, SimulationOptions, TransientAnalysis,
} from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { TransientResult } from '../results.js';
import { createDriverFromCompiled } from './transient-driver.js';
import { maxTimestepOption } from './max-timestep.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

/**
 * The `.tran` analysis as the driver runs it. `.tran` TMAX is the step cap, as
 * in ngspice; without one, a caller `maxTimestep` option replaces the default
 * min(TSTEP, TSTOP/50) cap. A zero TSTEP runs at the cap, else TSTOP/50.
 * An option of 0 is unset; negative or non-finite options throw.
 */
export function runnableTransient(
  analysis: TransientAnalysis,
  options?: Pick<SimulationOptions, 'maxTimestep'>,
): TransientAnalysis {
  const option = maxTimestepOption(options?.maxTimestep);
  const maxTimestep = analysis.maxTimestep ?? option;
  const capped = maxTimestep === undefined ? analysis : { ...analysis, maxTimestep };
  if (capped.timestep > 0) return capped;
  return { ...capped, timestep: maxTimestep ?? analysis.stopTime / 50 };
}

/**
 * One-shot transient analysis. Consumes a {@link TransientSim} internally
 * and accumulates every timestep into a {@link TransientResult}.
 */
export function solveTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
  convergence?: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): TransientResult {
  const { nodeNames, branchNames } = compiled;
  const driver = createDriverFromCompiled(compiled, options, {
    stopTime: analysis.stopTime,
    timestep: analysis.timestep,
    maxTimestep: analysis.maxTimestep ?? Math.min(analysis.timestep, analysis.stopTime / 50),
    initialSolution,
    convergence,
    guard,
  });

  const timePoints: number[] = [0];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  // Seed with the DC operating point at t=0
  guard?.recordResultPoint();
  const initialStep = driver.peekInitialStep();
  for (const [name, v] of initialStep.voltages) voltageArrays.get(name)!.push(v);
  for (const [name, i] of initialStep.currents) currentArrays.get(name)!.push(i);

  try {
    while (!driver.isDone) {
      guard?.checkpoint('solve:transient-step');
      guard?.recordResultPoint();
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
