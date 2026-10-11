import type {
  ConvergenceTelemetry, ResolvedOptions, SimulationOptions, TransientAnalysis, TransientStep,
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
 * Whether an accepted timepoint is part of the `.tran` output. Integration
 * always starts at t = 0; like ngspice dctran.c (`CKTtime >= CKTinitTime`),
 * only points at or after TSTART are saved.
 */
export function isSavedTransientPoint(analysis: TransientAnalysis, time: number): boolean {
  return time >= (analysis.startTime ?? 0);
}

/**
 * One-shot transient analysis. Consumes a {@link TransientSim} internally
 * and accumulates every saved timestep (t >= TSTART) into a
 * {@link TransientResult}.
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

  const timePoints: number[] = [];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  const save = (step: TransientStep): void => {
    guard?.recordResultPoint();
    timePoints.push(step.time);
    for (const [name, v] of step.voltages) voltageArrays.get(name)!.push(v);
    for (const [name, i] of step.currents) currentArrays.get(name)!.push(i);
  };

  try {
    // Seed with the DC operating point at t=0
    const initialStep = driver.peekInitialStep();
    if (isSavedTransientPoint(analysis, initialStep.time)) save(initialStep);
    while (!driver.isDone) {
      guard?.checkpoint('solve:transient-step');
      const step = driver.advance();
      if (isSavedTransientPoint(analysis, step.time)) save(step);
    }
  } finally {
    driver.dispose();
  }

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}
