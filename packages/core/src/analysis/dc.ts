import type { ConvergenceTelemetry, ResolvedOptions } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCResult } from '../results.js';
import { createConvergenceTelemetry, snapshotConvergenceTelemetry } from '../convergence-telemetry.js';
import { ConvergenceError } from '../errors.js';
import { createNodeStateSolution } from './initial-state.js';
import { DEVICE_GMIN } from '../devices/device.js';
import {
  ProtocolExecutionError,
  type ProtocolExecutionGuard,
} from '../protocol/execution-guard.js';

type DCSourceMode = 'operating-point' | 'transient';

export function solveDCOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
  convergence: ConvergenceTelemetry = createConvergenceTelemetry(),
  sourceMode: DCSourceMode = 'operating-point',
  guard?: ProtocolExecutionGuard,
): { result: DCResult; assembler: MNAAssembler; convergence: ConvergenceTelemetry } {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount, {
    variables: createMatrixVariableIdentities(nodeNames, branchNames),
    useDcSourceValue: sourceMode === 'operating-point',
  });

  for (const device of devices) device.beginOperatingPoint?.();

  if (initialSolution) {
    assembler.solution.set(initialSolution);
  } else {
    assembler.solution.set(createNodeStateSolution(compiled, 'guess'));
  }

  // Source ramping: gradually ramp source voltages to help NR convergence
  // for circuits with many nonlinear devices (e.g., CMOS inverter chains).
  const hasNonlinear = devices.some(d => d.isNonlinear);
  if (hasNonlinear) {
    const rampSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const scale of rampSteps) {
      convergence.dc.sourceStepAttempts++;
      const savedSolution = new Float64Array(assembler.solution);
      assembler.sourceScale = scale;
      try {
        newtonRaphson(
          assembler, devices, options, options.maxIterations, nodeNames, convergence.dc, guard,
        );
      } catch (error) {
        if (error instanceof ProtocolExecutionError) throw error;
        convergence.dc.sourceStepFailures++;
        // Restore last good solution so divergence doesn't cascade
        assembler.solution.set(savedSolution);
      }
    }
    assembler.sourceScale = 1.0;
  }

  try {
    newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames, convergence.dc, guard);
  } catch (err) {
    if (err instanceof ProtocolExecutionError) throw err;
    if (!hasNonlinear) {
      if (err instanceof ConvergenceError) {
        convergence.dc.failure = err.kind;
        err.convergence = snapshotConvergenceTelemetry(convergence);
      }
      throw err;
    }
    // Fallback: GMIN stepping homotopies, in ngspice-47 CKTop order. Dynamic
    // gmin steps a diagonal shunt on every node; if that fails, true gmin
    // steps the device junction gmin. Each solves at elevated gmin levels,
    // handing each converged iterate off as the initial guess for the next
    // lower gmin, then finishes at the nominal gmin.
    const savedSolution = new Float64Array(assembler.solution);
    if (!gminSteppingHomotopy(assembler, devices, options, nodeNames, convergence, guard)) {
      assembler.solution.set(savedSolution);
      if (err instanceof ConvergenceError) {
        convergence.dc.failure = err.kind;
        err.convergence = snapshotConvergenceTelemetry(convergence);
      }
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
    convergence,
  };
}


/**
 * ngspice-47 CKTop gmin homotopies after a failed plain Newton solve: dynamic
 * gmin stepping, then true gmin stepping. Returns whether the final solve at
 * the nominal gmin converged; the solution is then left in `assembler`.
 */
export function gminSteppingHomotopy(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): boolean {
  return dynamicGminStepping(assembler, devices, options, nodeNames, convergence, guard)
    || trueGminStepping(assembler, devices, options, nodeNames, convergence, guard);
}

/** ngspice defaults: `itl2` (CKTdcTrcvMaxIter), `gminfactor` (CKTgminFactor). */
const DC_TRCV_MAX_ITER = 50;
const GMIN_FACTOR = 10;
/** ngspice-47 NIiter raises any iteration limit below 100 to 100 ("some convergence issues get resolved by increasing max iter"). */
const NIITER_MIN_ITER = 100;
const HOMOTOPY_STEP_MAX_ITER = Math.max(DC_TRCV_MAX_ITER, NIITER_MIN_ITER);

/**
 * Dynamic GMIN stepping, ported from ngspice `dynamic_gmin` (cktop.c, Alan
 * Gillespie). Steps a diagonal shunt on every node from 1e-3 S down to the
 * user-configured `gmin` (ngspice `CKTgshunt`), which the final solve uses.
 *
 * GMIN stepping is a *DC-OP* technique — never a transient-step technique.
 * Committing GMIN-distorted solutions as real transient output samples
 * breaks LC tanks and switching converters (issues #42, #43, #45).
 */
function dynamicGminStepping(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): boolean {
  const reachedTarget = stepGmin(
    assembler, Math.max(DEVICE_GMIN, options.gmin), 1.00005, convergence,
    diagGmin => newtonRaphson(
      assembler, devices, { ...options, gmin: diagGmin }, HOMOTOPY_STEP_MAX_ITER, nodeNames, convergence.dc, guard,
    ),
  );
  return reachedTarget && finalGminSolve(assembler, devices, options, nodeNames, convergence, guard);
}

/**
 * True GMIN stepping, ported from ngspice-47 `new_gmin` (cktop.c), which
 * CKTop runs when dynamic gmin stepping fails. Same adaptive schedule, but it
 * steps the device gmin (`CKTgmin`) that models add across their pn
 * junctions instead of a node-to-ground shunt, and an expensive step keeps a
 * reduction factor of at least 3. For a CMOS stage the junction gmin ties the
 * output to both rails, rather than pulling every node to ground.
 *
 * Devices that read `StampContext.gmin` take part (MOS1 bulk
 * junctions); other models keep their fixed 1e-12 S junction gmin.
 */
function trueGminStepping(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): boolean {
  let reachedTarget: boolean;
  try {
    reachedTarget = stepGmin(
      assembler, DEVICE_GMIN, 3, convergence,
      deviceGmin => {
        assembler.deviceGmin = deviceGmin;
        return newtonRaphson(
          assembler, devices, options, HOMOTOPY_STEP_MAX_ITER, nodeNames, convergence.dc, guard,
        );
      },
    );
  } finally {
    assembler.deviceGmin = DEVICE_GMIN;
  }
  return reachedTarget && finalGminSolve(assembler, devices, options, nodeNames, convergence, guard);
}

/**
 * Adaptive gmin schedule shared by ngspice `dynamic_gmin` and `new_gmin`.
 * Restarts from an all-zero node vector and lowers gmin from 1e-3 S towards
 * `gtarget`: the reduction factor grows after cheap steps, shrinks to at
 * least `slowStepFactorFloor` after expensive ones, and a failed step retreats
 * to the last converged iterate with a smaller factor. Returns whether the
 * step at `gtarget` converged.
 */
function stepGmin(
  assembler: MNAAssembler,
  gtarget: number,
  slowStepFactorFloor: number,
  convergence: ConvergenceTelemetry,
  solveAt: (gmin: number) => number,
): boolean {
  assembler.solution.fill(0, 0, assembler.numNodes);
  const lastGood = new Float64Array(assembler.solution);
  let factor = GMIN_FACTOR;
  let oldGmin = 1e-2;
  let gmin = oldGmin / factor;

  for (;;) {
    convergence.dc.gminStepAttempts++;
    let iters: number;
    try {
      iters = solveAt(gmin);
    } catch (error) {
      if (error instanceof ProtocolExecutionError) throw error;
      convergence.dc.gminStepFailures++;
      if (factor < 1.00005) return false;
      factor = Math.sqrt(Math.sqrt(factor));
      gmin = oldGmin / factor;
      assembler.solution.set(lastGood);
      continue;
    }
    if (gmin <= gtarget) return true;
    lastGood.set(assembler.solution);
    if (iters <= DC_TRCV_MAX_ITER / 4) factor = Math.min(factor * Math.sqrt(factor), GMIN_FACTOR);
    if (iters > (3 * DC_TRCV_MAX_ITER) / 4) factor = Math.max(Math.sqrt(factor), slowStepFactorFloor);
    oldGmin = gmin;
    if (gmin < factor * gtarget) {
      factor = gmin / gtarget;
      gmin = gtarget;
    } else {
      gmin /= factor;
    }
  }
}

/** Final solve at the nominal gmin after a homotopy — this is the committed answer. */
function finalGminSolve(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): boolean {
  convergence.dc.gminStepAttempts++;
  try {
    newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames, convergence.dc, guard);
    return true;
  } catch (error) {
    if (error instanceof ProtocolExecutionError) throw error;
    convergence.dc.gminStepFailures++;
    return false;
  }
}
