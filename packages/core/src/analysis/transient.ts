import type {
  ConvergenceTelemetry, ResolvedOptions, SimulationOptions, TransientAnalysis,
} from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { TransientResult } from '../results.js';
import { createDriverFromCompiled } from './transient-driver.js';
import { transientStepCap } from './max-timestep.js';

export { runnableTransient } from './max-timestep.js';
import { ColumnRecorder } from './transient-columns.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

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
    maxTimestep: transientStepCap(analysis),
    initialSolution,
    useInitialConditions: analysis.useInitialConditions,
    convergence,
    guard,
  });

  const timePoints: number[] = [];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  // Record each saved point straight from the solution vector (#548). The
  // driver's TransientStep Maps (`advance()`) cost two Map inserts per
  // variable per step; on large linear decks that was the top self-time
  // frame. The column plan below reproduces those Maps' semantics exactly:
  // one column per distinct name, in first-occurrence order, holding the
  // solution entry of the name's last occurrence (Map.set overwrites).
  const nodeSlots = new Map<string, number>();
  for (const name of nodeNames) nodeSlots.set(name, compiled.nodeIndexMap.get(name)!);
  const branchSlots = new Map<string, number>();
  branchNames.forEach((name, i) => branchSlots.set(name, compiled.nodeCount + i));
  const columns: number[][] = [];
  const slots: number[] = [];
  for (const [name, slot] of nodeSlots) { columns.push(voltageArrays.get(name)!); slots.push(slot); }
  for (const [name, slot] of branchSlots) { columns.push(currentArrays.get(name)!); slots.push(slot); }
  // Points are buffered in a typed chunk and appended a column at a time
  // (#609); the columns are complete once `flush()` runs below.
  const recorder = new ColumnRecorder(columns, slots);
  const save = (time: number, solution: Float64Array): void => {
    guard?.recordResultPoint();
    timePoints.push(time);
    recorder.record(solution);
  };

  try {
    // Seed with the DC operating point at t=0
    if (isSavedTransientPoint(analysis, driver.simTime)) save(driver.simTime, driver.currentSolution());
    while (!driver.isDone) {
      guard?.checkpoint('solve:transient-step');
      const solution = driver.advanceSolution();
      if (isSavedTransientPoint(analysis, driver.simTime)) save(driver.simTime, solution);
    }
  } finally {
    driver.dispose();
  }
  recorder.flush();

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}
