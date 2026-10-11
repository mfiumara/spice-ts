import type { ConvergenceTelemetry, ResolvedOptions } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCResult } from '../results.js';
import { createConvergenceTelemetry, snapshotConvergenceTelemetry } from '../convergence-telemetry.js';
import { ConvergenceError } from '../errors.js';
import { createNodeStateSolution } from './initial-state.js';
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
    // Fallback: GMIN stepping homotopy. Solve at each elevated gmin level,
    // handing each converged iterate off as the initial guess for the next
    // lower gmin. Then finish with the user-configured gmin.
    const savedSolution = new Float64Array(assembler.solution);
    if (!gminStepping(assembler, devices, options, nodeNames, convergence, guard)) {
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

/** ngspice defaults: `itl2` (CKTdcTrcvMaxIter), `gminfactor` (CKTgminFactor), device CKTgmin. */
const DC_TRCV_MAX_ITER = 50;
const GMIN_FACTOR = 10;
const DEVICE_GMIN = 1e-12;
/** ngspice-47 NIiter raises any iteration limit below 100 to 100 ("some convergence issues get resolved by increasing max iter"). */
const NIITER_MIN_ITER = 100;
const HOMOTOPY_STEP_MAX_ITER = Math.max(DC_TRCV_MAX_ITER, NIITER_MIN_ITER);

/**
 * Dynamic GMIN stepping, ported from ngspice `dynamic_gmin` (cktop.c, Alan
 * Gillespie). Restarts from an all-zero node vector, adds a diagonal shunt to
 * every node starting at 1e-3 S and lowers it by an adaptive factor: the
 * factor grows after cheap steps, shrinks after expensive ones, and a failed
 * step retreats to the last converged iterate with a smaller factor. The
 * final solve uses the user-configured `gmin` (ngspice `CKTgshunt`).
 *
 * GMIN stepping is a *DC-OP* technique — never a transient-step technique.
 * Committing GMIN-distorted solutions as real transient output samples
 * breaks LC tanks and switching converters (issues #42, #43, #45).
 */
function gminStepping(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): boolean {
  const numNodes = assembler.numNodes;
  assembler.solution.fill(0, 0, numNodes);
  const lastGood = new Float64Array(assembler.solution);
  const gtarget = Math.max(DEVICE_GMIN, options.gmin);
  let factor = GMIN_FACTOR;
  let oldGmin = 1e-2;
  let diagGmin = oldGmin / factor;

  for (;;) {
    convergence.dc.gminStepAttempts++;
    let iters: number;
    try {
      iters = newtonRaphson(
        assembler, devices, { ...options, gmin: diagGmin }, HOMOTOPY_STEP_MAX_ITER, nodeNames, convergence.dc, guard,
      );
    } catch (error) {
      if (error instanceof ProtocolExecutionError) throw error;
      convergence.dc.gminStepFailures++;
      if (factor < 1.00005) return false;
      factor = Math.sqrt(Math.sqrt(factor));
      diagGmin = oldGmin / factor;
      assembler.solution.set(lastGood);
      continue;
    }
    if (diagGmin <= gtarget) break;
    lastGood.set(assembler.solution);
    if (iters <= DC_TRCV_MAX_ITER / 4) factor = Math.min(factor * Math.sqrt(factor), GMIN_FACTOR);
    if (iters > (3 * DC_TRCV_MAX_ITER) / 4) factor = Math.max(Math.sqrt(factor), 1.00005);
    oldGmin = diagGmin;
    if (diagGmin < factor * gtarget) {
      factor = diagGmin / gtarget;
      diagGmin = gtarget;
    } else {
      diagGmin /= factor;
    }
  }

  // Final solve at the user-configured gmin — this is the committed answer.
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
