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

  // The driver builds each step's maps in nodeNames/branchNames order, so the
  // k-th entry normally belongs to the k-th array; a name mismatch falls back
  // to the keyed lookup. This avoids one Map lookup per variable per point.
  const voltageColumns = nodeNames.map(name => voltageArrays.get(name)!);
  const currentColumns = branchNames.map(name => currentArrays.get(name)!);
  const appendOrdered = (
    entries: Map<string, number>,
    names: readonly string[],
    columns: number[][],
    arrays: Map<string, number[]>,
  ): void => {
    let k = 0;
    for (const [name, value] of entries) {
      if (k < names.length && names[k] === name) columns[k].push(value);
      else arrays.get(name)!.push(value);
      k++;
    }
  };
  const save = (step: TransientStep): void => {
    guard?.recordResultPoint();
    timePoints.push(step.time);
    appendOrdered(step.voltages, nodeNames, voltageColumns, voltageArrays);
    appendOrdered(step.currents, branchNames, currentColumns, currentArrays);
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
