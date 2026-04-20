import type { CompiledCircuit } from '../circuit.js';
import type { ResolvedOptions } from '../types.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { SparseSolver } from '../solver/sparse-solver.js';
import { buildCompanionSystem } from '../mna/companion.js';

/**
 * Shared context for an NR step attempt. The assembler and solver are
 * long-lived — reused across retries so pattern analysis and typed-array
 * allocations amortize. `attemptStep` mutates `assembler` internally; the
 * driver wrapping it may additionally reset `assembler.solution` between
 * retries to restore from a previous snapshot.
 */
export interface StepContext {
  readonly compiled: CompiledCircuit;
  /** Shared assembler — reused across attempts to avoid re-allocation. */
  readonly assembler: MNAAssembler;
  /** Shared solver — callers are responsible for `analyzePattern` lifecycle. */
  readonly solver: SparseSolver;
  readonly options: ResolvedOptions;
}

/**
 * Parameters for a single NR attempt at a single timestep.
 */
export interface StepAttempt {
  /** Requested timestep in seconds. */
  readonly dt: number;
  /** Target simulation time (= prev time + dt). */
  readonly time: number;
  /** Solution vector from the previous converged step. */
  readonly prevSolution: Float64Array;
  /** `b(n)` from the previous converged step (trapezoidal only; undefined on step 1). */
  readonly prevB: Float64Array | undefined;
  /** GMIN to use for this attempt. */
  readonly gmin: number;
  /** Per-iteration node-voltage damping cap (volts). */
  readonly voltageLimit: number;
}

export type StepResult =
  | {
      readonly ok: true;
      /** Converged solution (new Float64Array, safe to retain). */
      readonly solution: Float64Array;
      /** Number of NR iterations used. */
      readonly iterations: number;
      /** True if the damping loop detected NR sign-flip oscillation on any node. */
      readonly oscillated: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'nr-divergence';
      readonly iterations: number;
      readonly lastSolution: Float64Array;
      readonly prevIterSolution: Float64Array;
      readonly oscillated: boolean;
    };

/**
 * Attempt one transient timestep using Newton-Raphson. Caller supplies the
 * assembler and solver; the function builds the companion system, runs NR to
 * convergence (or gives up), and returns either the converged solution or a
 * diagnostic failure result.
 *
 * Leaves `ctx.assembler.solution` in an indeterminate state on failure —
 * callers that need to retry a different `dt` or `gmin` must restore it from
 * their own snapshot (`prevSolution`).
 */
export function attemptStep(ctx: StepContext, attempt: StepAttempt): StepResult {
  const { compiled, assembler, solver, options } = ctx;
  const { devices, nodeCount } = compiled;
  const { dt, time, prevSolution, prevB, gmin } = attempt;
  let voltageLimit = attempt.voltageLimit;
  const TIGHT_LIMIT = 0.5;

  assembler.setTime(time, dt);

  let prevIterSolution = new Float64Array(assembler.solution);
  let prevDelta: Float64Array | undefined;
  let oscillated = false;

  for (let iter = 0; iter < options.maxTransientIterations; iter++) {
    buildCompanionSystem(assembler, devices, dt, options.integrationMethod, prevSolution, prevB, gmin);

    if (!assembler.isFastPath) assembler.lockTopology();
    if (!solver.isPatternAnalyzed()) {
      solver.analyzePattern(assembler.getCscMatrix());
    }
    solver.factorize(assembler.getCscMatrix());
    const x = solver.solve(new Float64Array(assembler.b));

    const prev = new Float64Array(assembler.solution);

    // Compute raw deltas before damping so oscillation detection sees the actual iterate
    const rawDelta = new Float64Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) rawDelta[i] = x[i] - prev[i];

    if (prevDelta) {
      for (let i = 0; i < nodeCount; i++) {
        if (rawDelta[i] * prevDelta[i] < 0 && Math.abs(rawDelta[i]) > options.vntol) {
          oscillated = true;
          if (voltageLimit > TIGHT_LIMIT) voltageLimit = TIGHT_LIMIT;
          break;
        }
      }
    }

    // Apply damping
    for (let i = 0; i < nodeCount; i++) {
      const delta = rawDelta[i];
      if (Math.abs(delta) > voltageLimit) {
        x[i] = prev[i] + Math.sign(delta) * voltageLimit;
      }
    }

    assembler.solution.set(x);

    if (isConvergedTransient(x, prev, nodeCount, options)) {
      return {
        ok: true,
        solution: new Float64Array(x),
        iterations: iter + 1,
        oscillated,
      };
    }
    prevIterSolution = prev;
    prevDelta = rawDelta;
  }

  return {
    ok: false,
    reason: 'nr-divergence',
    iterations: options.maxTransientIterations,
    lastSolution: new Float64Array(assembler.solution),
    prevIterSolution,
    oscillated,
  };
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
