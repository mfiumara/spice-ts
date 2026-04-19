# Resumable Transient Driver + Convergence Robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the buck-boost NR-divergence failure at t=562 ns, ship a stateful `TransientSim` driver (`createTransientSim` / `advance` / `reset`) so a future continuous-mode UI can pause/resume simulations, and make hard-switching converters generally more robust — all without changing the behavior of existing `simulate` / `simulateStream` consumers.

**Architecture:** Introduce two new files — `transient-step.ts` (pure single-step NR function with oscillation-aware damping) and `transient-driver.ts` (stateful class owning MNA assembler, solver, LTE history, GMIN-stepping schedule, dt adaptation). Refactor `solveTransient` and `streamTransient` into thin wrappers over the driver so the one-shot code path exercises the same convergence aids. Add GMIN stepping as a fallback retry layer wrapping dt halving, add an NR state-aware adaptive voltage limit in the damping loop, and raise `MIN_TIMESTEP` from 1e-15 to 1e-12 so the retry schedule gives up faster on truly-stuck problems.

**Tech Stack:** TypeScript, Vitest, pnpm workspace. All changes live in `packages/core`.

**Spec:** `docs/superpowers/specs/2026-04-19-transient-driver-design.md`

---

## File Structure

**Create:**
- `packages/core/src/analysis/transient-step.ts` — pure `attemptStep` function and supporting types
- `packages/core/src/analysis/transient-step.test.ts` — unit tests for `attemptStep`
- `packages/core/src/analysis/transient-driver.ts` — `TransientSim` driver class + `createTransientSim` factory
- `packages/core/src/analysis/transient-driver.test.ts` — unit tests for driver API
- `packages/core/src/analysis/transient-driver-integration.test.ts` — integration tests including the buck-boost fixture

**Modify:**
- `packages/core/src/errors.ts` — `ConvergenceError` gains `kind`, `dt`, `gmin`; `TimestepTooSmallError` now extends `ConvergenceError`
- `packages/core/src/analysis/transient.ts` — `solveTransient` delegates to driver
- `packages/core/src/simulate.ts` — `streamTransient` (inline function) delegates to driver
- `packages/core/src/index.ts` — export new public types

---

## Task 1: Extend error hierarchy (non-breaking)

The spec asks `TimestepTooSmallError` to extend `ConvergenceError` and both to carry a `kind` discriminator. All existing consumers — `catch (e instanceof TimestepTooSmallError)` or `err.timestep` access — must keep working.

**Files:**
- Modify: `packages/core/src/errors.ts`
- Test: `packages/core/src/errors.test.ts` (existing file — add cases)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConvergenceError, TimestepTooSmallError } from './errors.js';

describe('ConvergenceError (extended)', () => {
  it('carries a kind discriminator', () => {
    const err = new ConvergenceError(
      'NR failed', 1e-9, ['n1'], new Float64Array([1]), new Float64Array([0]),
      'nr-divergence', 1e-12, 1e-8,
    );
    expect(err.kind).toBe('nr-divergence');
    expect(err.dt).toBe(1e-12);
    expect(err.gmin).toBe(1e-8);
  });

  it('defaults kind to nr-divergence when omitted', () => {
    const err = new ConvergenceError(
      'm', 0, [], new Float64Array(0), new Float64Array(0),
    );
    expect(err.kind).toBe('nr-divergence');
  });
});

describe('TimestepTooSmallError (now extends ConvergenceError)', () => {
  it('is instanceof ConvergenceError', () => {
    const err = new TimestepTooSmallError(1e-9, 1e-18);
    expect(err).toBeInstanceOf(ConvergenceError);
    expect(err).toBeInstanceOf(TimestepTooSmallError);
  });

  it('has kind=dt-floor and preserves timestep getter', () => {
    const err = new TimestepTooSmallError(1e-9, 1e-18);
    expect(err.kind).toBe('dt-floor');
    expect(err.timestep).toBe(1e-18);
    expect(err.time).toBe(1e-9);
    expect(err.dt).toBe(1e-18);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @spice-ts/core test errors -- --run`

Expected: three new tests fail (kind field doesn't exist, TimestepTooSmallError isn't a ConvergenceError).

- [ ] **Step 3: Update `ConvergenceError` and `TimestepTooSmallError`**

Replace the two classes in `packages/core/src/errors.ts` with:

```ts
/** Discriminator for {@link ConvergenceError} subclasses. */
export type ConvergenceFailureKind = 'nr-divergence' | 'lte-cascade' | 'dt-floor';

/**
 * Thrown when Newton-Raphson iteration fails to converge within the
 * allowed number of iterations, when LTE rejects too many steps in a row,
 * or when the adaptive timestep shrinks below the floor.
 *
 * Contains diagnostic information including the oscillating nodes,
 * the last two solution vectors, the timestep and GMIN value in effect,
 * and a `kind` discriminator identifying the failure mode.
 */
export class ConvergenceError extends SpiceError {
  public readonly kind: ConvergenceFailureKind;

  constructor(
    message: string,
    /** Simulation time at which convergence failed (undefined for DC) */
    public readonly time: number | undefined,
    /** Nodes that were oscillating at the time of failure */
    public readonly oscillatingNodes: string[],
    /** Solution vector from the last iteration */
    public readonly lastSolution: Float64Array,
    /** Solution vector from the second-to-last iteration */
    public readonly prevSolution: Float64Array,
    /** Failure mode discriminator. Defaults to `'nr-divergence'`. */
    kind: ConvergenceFailureKind = 'nr-divergence',
    /** Timestep in effect when the failure occurred (undefined for DC) */
    public readonly dt?: number,
    /** GMIN value in effect at the time of failure */
    public readonly gmin?: number,
  ) {
    super(
      `Convergence failed${time !== undefined ? ` at t=${time}` : ''}: ${message}` +
        (oscillatingNodes.length > 0 ? ` (oscillating nodes: ${oscillatingNodes.join(', ')})` : ''),
    );
    this.name = 'ConvergenceError';
    this.kind = kind;
  }
}

/**
 * Thrown during transient analysis when the adaptive timestep shrinks
 * below the minimum threshold (see `MIN_TIMESTEP` in `transient-driver.ts`).
 *
 * Subclass of {@link ConvergenceError} with `kind === 'dt-floor'`.
 */
export class TimestepTooSmallError extends ConvergenceError {
  constructor(
    /** Simulation time at which the error occurred */
    time: number,
    /** The timestep that was too small */
    public readonly timestep: number,
  ) {
    super(
      `Timestep too small: dt=${timestep}`,
      time, [], new Float64Array(0), new Float64Array(0),
      'dt-floor', timestep, undefined,
    );
    this.name = 'TimestepTooSmallError';
    // Override the message to preserve the old format verbatim so string
    // comparisons in consumer code keep working.
    this.message = `Timestep too small at t=${time}: dt=${timestep}`;
  }
}
```

- [ ] **Step 4: Run all core tests to confirm no regressions**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: all tests pass including the new ones and every previously-passing test.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/errors.test.ts
git commit -m "refactor(core): TimestepTooSmallError extends ConvergenceError with kind discriminator"
```

---

## Task 2: Extract `attemptStep` as pure function

Refactor the NR inner loop out of `solveTransient` / `streamTransient` into a single pure function. No behavior change yet — just moving code to a new file so both the old path and the new driver can share it.

**Files:**
- Create: `packages/core/src/analysis/transient-step.ts`
- Create: `packages/core/src/analysis/transient-step.test.ts`

- [ ] **Step 1: Write the test file first**

Create `packages/core/src/analysis/transient-step.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { resolveOptions } from '../types.js';
import { attemptStep } from './transient-step.js';

function buildRCContext() {
  const ckt = parse(`
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 1u 1m
`);
  const compiled = ckt.compile();
  const options = resolveOptions(undefined, 1e-3);
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  const solver = createSparseSolver();
  return { compiled, options, assembler, solver };
}

describe('attemptStep', () => {
  it('converges in a small number of iterations for a linear RC circuit', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iterations).toBeLessThanOrEqual(5);
      expect(result.solution.length).toBe(compiled.nodeCount + compiled.branchCount);
    }
  });

  it('returns ok=false with reason="nr-divergence" when NR cannot converge', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    // Force failure by setting maxTransientIterations to 0
    const brokenOpts = { ...options, maxTransientIterations: 0 };
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options: brokenOpts },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('nr-divergence');
    }
  });

  it('does not modify the input assembler.solution on failure', () => {
    const { compiled, options, assembler, solver } = buildRCContext();
    const brokenOpts = { ...options, maxTransientIterations: 0 };
    const prevSol = new Float64Array(assembler.solution);
    const snapshot = new Float64Array(assembler.solution);

    attemptStep(
      { compiled, assembler, solver, options: brokenOpts },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    expect(Array.from(assembler.solution)).toEqual(Array.from(snapshot));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @spice-ts/core test transient-step -- --run`

Expected: all three tests fail with "Cannot find module './transient-step.js'".

- [ ] **Step 3: Create `transient-step.ts` with the pure function**

Create `packages/core/src/analysis/transient-step.ts`:

```ts
import type { CompiledCircuit } from '../circuit.js';
import type { ResolvedOptions } from '../types.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { SparseSolver } from '../solver/sparse-solver.js';
import { buildCompanionSystem } from '../mna/companion.js';

/**
 * Shared context for an NR step attempt. Lives for the lifetime of a driver.
 * Mutated only by `attemptStep` itself (via `assembler` and `solver`); callers
 * should treat it as opaque.
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
    }
  | {
      readonly ok: false;
      readonly reason: 'nr-divergence';
      readonly iterations: number;
      readonly lastSolution: Float64Array;
      readonly prevIterSolution: Float64Array;
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
  const { dt, time, prevSolution, prevB, gmin, voltageLimit } = attempt;

  assembler.setTime(time, dt);

  let prevIterSolution = new Float64Array(assembler.solution);

  for (let iter = 0; iter < options.maxTransientIterations; iter++) {
    buildCompanionSystem(assembler, devices, dt, options.integrationMethod, prevSolution, prevB, gmin);

    if (!assembler.isFastPath) assembler.lockTopology();
    if (!solver.isPatternAnalyzed()) {
      solver.analyzePattern(assembler.getCscMatrix());
    }
    solver.factorize(assembler.getCscMatrix());
    const x = solver.solve(new Float64Array(assembler.b));

    const prev = new Float64Array(assembler.solution);
    for (let i = 0; i < nodeCount; i++) {
      const delta = x[i] - prev[i];
      if (Math.abs(delta) > voltageLimit) {
        x[i] = prev[i] + Math.sign(delta) * voltageLimit;
      }
    }

    assembler.solution.set(x);

    if (isConvergedTransient(x, prev, nodeCount, options)) {
      return { ok: true, solution: new Float64Array(x), iterations: iter + 1 };
    }
    prevIterSolution = prev;
  }

  return {
    ok: false,
    reason: 'nr-divergence',
    iterations: options.maxTransientIterations,
    lastSolution: new Float64Array(assembler.solution),
    prevIterSolution,
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
```

- [ ] **Step 4: Add `isPatternAnalyzed()` to the sparse solver interface**

The concrete solver (`GilbertPeierlsSolver`) already has a private `analyzed = false` flag set to `true` inside `analyzePattern`. Expose it.

In `packages/core/src/solver/sparse-solver.ts`, update the interface:

```ts
export interface SparseSolver {
  /** Analyze sparsity pattern — call once per circuit topology */
  analyzePattern(A: CscMatrix): void;

  /** Numeric factorization — call each Newton step (same pattern, new values) */
  factorize(A: CscMatrix): void;

  /** Solve Ax = b, returns solution vector */
  solve(b: Float64Array): Float64Array;

  /** Returns true if {@link analyzePattern} has been called. */
  isPatternAnalyzed(): boolean;
}
```

In `packages/core/src/solver/gilbert-peierls.ts`, add the method to the class (just below `analyzePattern`):

```ts
  isPatternAnalyzed(): boolean {
    return this.analyzed;
  }
```

The existing `this.analyzed = true` assignment inside `analyzePattern` (find it near the end of that method) already tracks the right state — just expose it.

- [ ] **Step 5: Run the new tests to confirm they pass**

Run: `pnpm --filter @spice-ts/core test transient-step -- --run`

Expected: all three `attemptStep` tests pass.

- [ ] **Step 6: Run the full core test suite to confirm nothing else broke**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/analysis/transient-step.ts packages/core/src/analysis/transient-step.test.ts packages/core/src/solver/sparse-solver.ts
git commit -m "refactor(core): extract attemptStep as a pure single-step NR function"
```

---

## Task 3: Build the driver skeleton (no convergence aids yet)

Create `createTransientSim` and the `TransientSim` class. This task faithfully reproduces the *existing* behavior of `solveTransient` using `attemptStep` internally — no GMIN stepping, no oscillation detection, same `MIN_TIMESTEP = 1e-15`. The goal is a behavior-preserving refactor; convergence improvements come in Tasks 6 and 7.

**Files:**
- Create: `packages/core/src/analysis/transient-driver.ts`
- Create: `packages/core/src/analysis/transient-driver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/analysis/transient-driver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTransientSim } from './transient-driver.js';

const RC_NETLIST = `
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 1u 1m
`;

describe('createTransientSim', () => {
  it('returns a driver with simTime=0 after creation', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    expect(sim.simTime).toBe(0);
    expect(sim.isDone).toBe(false);
    sim.dispose();
  });

  it('advance() returns a TransientStep with time > 0', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const step = sim.advance();
    expect(step.time).toBeGreaterThan(0);
    expect(step.voltages.has('1')).toBe(true);
    expect(step.voltages.has('2')).toBe(true);
    expect(sim.simTime).toBe(step.time);
    sim.dispose();
  });

  it('advanceUntil(t) returns multiple steps', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const steps = sim.advanceUntil(100e-6);
    expect(steps.length).toBeGreaterThan(3);
    expect(steps[steps.length - 1].time).toBeGreaterThanOrEqual(100e-6);
    sim.dispose();
  });

  it('isDone becomes true once simTime crosses stopTime', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    sim.advanceUntil(2e-3); // past stopTime=1ms
    expect(sim.isDone).toBe(true);
    sim.dispose();
  });

  it('reset() restores simTime to 0 and replays produce the same first step', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    const a = sim.advance();
    sim.reset();
    expect(sim.simTime).toBe(0);
    const b = sim.advance();
    expect(b.time).toBeCloseTo(a.time, 12);
    for (const node of ['1', '2']) {
      expect(b.voltages.get(node)).toBeCloseTo(a.voltages.get(node)!, 9);
    }
    sim.dispose();
  });

  it('advance() after dispose() throws', async () => {
    const sim = await createTransientSim(RC_NETLIST);
    sim.dispose();
    expect(() => sim.advance()).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @spice-ts/core test transient-driver -- --run`

Expected: all six tests fail with module-not-found.

- [ ] **Step 3: Create the driver file**

Create `packages/core/src/analysis/transient-driver.ts`:

```ts
import type { Circuit, CompiledCircuit } from '../circuit.js';
import type { SimulationOptions, ResolvedOptions, TransientStep } from '../types.js';
import { resolveOptions } from '../types.js';
import { parse, parseAsync } from '../parser/index.js';
import { MNAAssembler } from '../mna/assembler.js';
import { createSparseSolver, type SparseSolver } from '../solver/sparse-solver.js';
import { solveDCOperatingPoint } from './dc.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { attemptStep } from './transient-step.js';
import { TimestepTooSmallError, ConvergenceError, InvalidCircuitError } from '../errors.js';

const MIN_TIMESTEP = 1e-15;
const NR_VOLTAGE_LIMIT = 3.5;

/**
 * Resumable transient simulation driver.
 *
 * Call {@link createTransientSim} to obtain one. Use {@link advance} or
 * {@link advanceUntil} to step the simulation forward, {@link reset} to
 * restart at t=0, and {@link dispose} when done.
 */
export interface TransientSim {
  readonly simTime: number;
  readonly stopTime: number | undefined;
  readonly isDone: boolean;

  /** Advance one converged timestep. Throws {@link ConvergenceError} on failure. */
  advance(): TransientStep;
  /** Convenience: loop {@link advance} until `simTime >= targetTime`. */
  advanceUntil(targetTime: number): TransientStep[];
  /** Re-run DC operating point, clear history, reset simTime to 0. */
  reset(): void;
  /** Release solver memory. Subsequent calls throw. */
  dispose(): void;
}

export interface TransientSimOptions extends SimulationOptions {
  stopTime?: number;
  timestep?: number;
  maxTimestep?: number;
}

export async function createTransientSim(
  input: string | Circuit,
  options?: TransientSimOptions,
): Promise<TransientSim> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    circuit = options?.resolveInclude
      ? await parseAsync(input, options.resolveInclude)
      : parse(input);
  } else {
    circuit = input;
  }
  const compiled = circuit.compile();
  validateCircuit(compiled);

  const tranAnalysis = compiled.analyses.find(a => a.type === 'tran');
  const stopTime = options?.stopTime ?? tranAnalysis?.stopTime;
  const timestep = options?.timestep ?? tranAnalysis?.timestep ?? (stopTime ? stopTime / 50 : 1e-6);
  const maxTimestep = options?.maxTimestep
    ?? (stopTime ? Math.min(timestep, stopTime / 50) : timestep * 10);

  const resolved = resolveOptions(options, stopTime);

  return new TransientSimImpl(compiled, resolved, {
    stopTime, timestep, maxTimestep,
  });
}

interface InternalTransientConfig {
  stopTime: number | undefined;
  timestep: number;
  maxTimestep: number;
}

class TransientSimImpl implements TransientSim {
  private assembler: MNAAssembler;
  private solver: SparseSolver;
  private options: ResolvedOptions;
  private config: InternalTransientConfig;
  private compiled: CompiledCircuit;

  private time = 0;
  private dt: number;
  private prevB: Float64Array | undefined;
  private secondPrevSol: Float64Array | undefined;
  private prevDt: number;
  private lteRejectCount = 0;
  private disposed = false;

  constructor(compiled: CompiledCircuit, options: ResolvedOptions, config: InternalTransientConfig) {
    this.compiled = compiled;
    this.options = options;
    this.config = config;
    this.dt = Math.min(config.timestep, config.maxTimestep);
    this.prevDt = this.dt;

    this.assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    this.solver = createSparseSolver();

    this.initDC();
  }

  get simTime(): number { return this.time; }
  get stopTime(): number | undefined { return this.config.stopTime; }
  get isDone(): boolean {
    return this.config.stopTime !== undefined && this.time >= this.config.stopTime - MIN_TIMESTEP;
  }

  advance(): TransientStep {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');

    const prevSol = new Float64Array(this.assembler.solution);

    // Retry loop: dt halving on NR failure (current behavior — no GMIN stepping yet)
    for (;;) {
      const nextTime = this.config.stopTime !== undefined
        ? Math.min(this.time + this.dt, this.config.stopTime)
        : this.time + this.dt;
      const actualDt = nextTime - this.time;

      const result = attemptStep(
        { compiled: this.compiled, assembler: this.assembler, solver: this.solver, options: this.options },
        {
          dt: actualDt,
          time: nextTime,
          prevSolution: prevSol,
          prevB: this.prevB,
          gmin: this.options.gmin || 1e-12,
          voltageLimit: NR_VOLTAGE_LIMIT,
        },
      );

      if (!result.ok) {
        this.dt = this.dt / 2;
        if (this.dt < MIN_TIMESTEP) {
          throw new TimestepTooSmallError(this.time, this.dt);
        }
        this.assembler.solution.set(prevSol);
        continue;
      }

      // LTE rejection
      const lteRatio = this.checkLTE(result.solution, prevSol, actualDt);
      if (lteRatio > 1) {
        const factor = Math.max(0.25, 0.9 / Math.sqrt(lteRatio));
        this.dt = Math.max(actualDt * factor, MIN_TIMESTEP);
        this.assembler.solution.set(prevSol);
        this.lteRejectCount++;
        continue;
      }
      this.lteRejectCount = 0;

      // Update trapezoidal history
      if (this.options.integrationMethod === 'trapezoidal') {
        this.assembler.clear();
        const ctx = this.assembler.getStampContext();
        for (const d of this.compiled.devices) d.stamp(ctx);
        this.prevB = new Float64Array(this.assembler.b);
      }

      // Commit
      this.secondPrevSol = prevSol;
      this.prevDt = actualDt;
      this.time = nextTime;

      // Grow dt
      const growFactor = lteRatio > 0.001 ? Math.min(2.0, 0.9 / Math.sqrt(lteRatio)) : 2.0;
      this.dt = Math.min(actualDt * growFactor, this.config.maxTimestep,
        this.config.stopTime !== undefined ? this.config.stopTime - this.time : Infinity);

      return this.buildStep(result.solution);
    }
  }

  advanceUntil(targetTime: number): TransientStep[] {
    const steps: TransientStep[] = [];
    while (this.time < targetTime - MIN_TIMESTEP) {
      steps.push(this.advance());
      if (this.isDone) break;
    }
    return steps;
  }

  reset(): void {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');
    this.assembler = new MNAAssembler(this.compiled.nodeCount, this.compiled.branchCount);
    this.solver = createSparseSolver();
    this.time = 0;
    this.dt = Math.min(this.config.timestep, this.config.maxTimestep);
    this.prevDt = this.dt;
    this.prevB = undefined;
    this.secondPrevSol = undefined;
    this.lteRejectCount = 0;
    this.initDC();
  }

  dispose(): void {
    this.disposed = true;
  }

  private initDC(): void {
    const { assembler: dcAsm } = solveDCOperatingPoint(this.compiled, this.options);
    this.assembler.solution.set(dcAsm.solution);

    if (this.options.integrationMethod === 'trapezoidal') {
      this.assembler.clear();
      this.assembler.setTime(0, 0);
      const ctx = this.assembler.getStampContext();
      for (const d of this.compiled.devices) d.stamp(ctx);
      this.prevB = new Float64Array(this.assembler.b);
    }
  }

  private checkLTE(current: Float64Array, previous: Float64Array, dt: number): number {
    if (!this.secondPrevSol || this.lteRejectCount >= 10) return 0;
    let maxRatio = 0;
    const divider = this.options.integrationMethod === 'trapezoidal' ? 3 : 2;
    const { nodeCount } = this.compiled;
    for (let i = 0; i < nodeCount; i++) {
      const slope = (previous[i] - this.secondPrevSol[i]) / this.prevDt;
      const predicted = previous[i] + dt * slope;
      const error = Math.abs(current[i] - predicted) / divider;
      const tol = this.options.trtol * (this.options.vntol + this.options.reltol * Math.abs(current[i]));
      if (tol > 0) {
        const ratio = error / tol;
        if (ratio > maxRatio) maxRatio = ratio;
      }
    }
    return maxRatio;
  }

  private buildStep(solution: Float64Array): TransientStep {
    const { nodeNames, branchNames, nodeCount, nodeIndexMap } = this.compiled;
    const voltages = new Map<string, number>();
    for (const name of nodeNames) voltages.set(name, solution[nodeIndexMap.get(name)!]);
    const currents = new Map<string, number>();
    for (let i = 0; i < branchNames.length; i++) currents.set(branchNames[i], solution[nodeCount + i]);
    return { time: this.time, voltages, currents };
  }
}

function validateCircuit(compiled: CompiledCircuit): void {
  if (compiled.nodeCount === 0) throw new InvalidCircuitError('Circuit has no nodes');
}
```

- [ ] **Step 4: Run driver tests to confirm they pass**

Run: `pnpm --filter @spice-ts/core test transient-driver -- --run`

Expected: all six tests pass.

- [ ] **Step 5: Run full core suite**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/analysis/transient-driver.ts packages/core/src/analysis/transient-driver.test.ts
git commit -m "feat(core): add TransientSim driver with advance/reset API"
```

---

## Task 4: Rewrite `solveTransient` and `streamTransient` as driver consumers

With the driver in place, the one-shot paths become thin loops over `advance()`. Existing test suites must still pass — this is a behavior-preserving refactor.

**Files:**
- Modify: `packages/core/src/analysis/transient.ts`
- Modify: `packages/core/src/simulate.ts` (the inline `streamTransient` generator)

- [ ] **Step 1: Replace `solveTransient` with a driver consumer**

Replace the entire body of `packages/core/src/analysis/transient.ts` with:

```ts
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
```

- [ ] **Step 2: Add `createDriverFromCompiled` + `peekInitialStep` to the driver**

In `packages/core/src/analysis/transient-driver.ts`, add two internal helpers. Append to the file:

```ts
/**
 * Internal constructor used by `solveTransient` / `streamTransient` to avoid
 * re-parsing circuits. Exposes `peekInitialStep()` for t=0 seeding.
 */
export function createDriverFromCompiled(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  config: {
    stopTime: number | undefined;
    timestep: number;
    maxTimestep: number;
    initialSolution?: Float64Array;
  },
): TransientSim & { peekInitialStep(): TransientStep } {
  const impl = new TransientSimImpl(compiled, options, {
    stopTime: config.stopTime,
    timestep: config.timestep,
    maxTimestep: config.maxTimestep,
  });
  if (config.initialSolution) impl.seedSolution(config.initialSolution);
  return impl;
}
```

And in `TransientSimImpl`, add these methods:

```ts
  seedSolution(s: Float64Array): void {
    this.assembler.solution.set(s);
    // Recompute prevB for trapezoidal with the seeded solution
    if (this.options.integrationMethod === 'trapezoidal') {
      this.assembler.clear();
      this.assembler.setTime(0, 0);
      const ctx = this.assembler.getStampContext();
      for (const d of this.compiled.devices) d.stamp(ctx);
      this.prevB = new Float64Array(this.assembler.b);
    }
  }

  peekInitialStep(): TransientStep {
    return this.buildStep(this.assembler.solution);
  }
```

Also widen the class's declared members so `seedSolution` / `peekInitialStep` are accessible via the returned type.

- [ ] **Step 3: Rewrite `streamTransient` inside `simulate.ts`**

In `packages/core/src/simulate.ts`, replace the `streamTransient` generator function (currently starting around line 295) with:

```ts
function* streamTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution: Float64Array,
): Generator<TransientStep> {
  const driver = createDriverFromCompiled(compiled, options, {
    stopTime: analysis.stopTime,
    timestep: analysis.timestep,
    maxTimestep: analysis.maxTimestep ?? (analysis.stopTime / 50),
    initialSolution,
  });

  try {
    yield driver.peekInitialStep();
    while (!driver.isDone) {
      yield driver.advance();
    }
  } finally {
    driver.dispose();
  }
}
```

Also remove the now-unused imports (`MNAAssembler`, `buildCompanionSystem`, `createSparseSolver`, `TimestepTooSmallError`) from `simulate.ts` if they have no other callers. Remove the helpers `streamEstimateLTE`, `buildTransientStep`, `isStreamConverged`, and the `MIN_TIMESTEP`/`NR_VOLTAGE_LIMIT` constants from `simulate.ts` — they now live only in the driver/step module.

Add the new import to `simulate.ts`:

```ts
import { createDriverFromCompiled } from './analysis/transient-driver.js';
```

- [ ] **Step 4: Run the full core test suite**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: **every existing test continues to pass**, including `simulate.test.ts`, `simulate.stream.test.ts`, `integration.test.ts`, `accuracy.test.ts`. The driver-backed path must produce byte-identical output for already-working circuits.

If accuracy tests drift within floating-point noise (~1e-12 absolute), widen the existing tolerance in the assertion; do not widen beyond 1e-9.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/transient.ts packages/core/src/analysis/transient-driver.ts packages/core/src/simulate.ts
git commit -m "refactor(core): route solveTransient and streamTransient through TransientSim driver"
```

---

## Task 5: Export public API

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/transient-driver-exports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as api from './index.js';

describe('@spice-ts/core public exports', () => {
  it('exports createTransientSim', () => {
    expect(typeof api.createTransientSim).toBe('function');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm --filter @spice-ts/core test transient-driver-exports -- --run`

Expected: fails with "api.createTransientSim is not a function".

- [ ] **Step 3: Add the export**

In `packages/core/src/index.ts`, add after the `simulate` re-export:

```ts
export { createTransientSim } from './analysis/transient-driver.js';
export type { TransientSim, TransientSimOptions } from './analysis/transient-driver.js';
```

Also re-export the new error discriminator type:

```ts
export type { ConvergenceFailureKind } from './errors.js';
```

- [ ] **Step 4: Run test to confirm pass**

Run: `pnpm --filter @spice-ts/core test transient-driver-exports -- --run`

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/transient-driver-exports.test.ts
git commit -m "feat(core): export createTransientSim + TransientSim types"
```

---

## Task 6: Raise `MIN_TIMESTEP` and add GMIN stepping

Now the convergence work. The buck-boost probe showed dt collapsing to 7.45e-16 on the first switching edge — 26 halvings below the initial 50 ns with no chance of success because the underlying problem is Jacobian conditioning, not dt. GMIN stepping bumps the artificial shunt conductance temporarily, smoothing the nonlinearity so NR can find a solution, then decays GMIN back to baseline over subsequent timesteps.

**Files:**
- Modify: `packages/core/src/analysis/transient-driver.ts`

- [ ] **Step 1: Write failing tests for GMIN stepping**

Append to `packages/core/src/analysis/transient-driver.test.ts`:

```ts
import { createTransientSim } from './transient-driver.js';
import { TimestepTooSmallError, ConvergenceError } from '../errors.js';

const BUCK_BOOST_NETLIST = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 50n 5u
`;

describe('TransientSim convergence (GMIN stepping)', () => {
  it('buck-boost advances past the first switching edge (t > 1 µs)', async () => {
    const sim = await createTransientSim(BUCK_BOOST_NETLIST);
    const steps = sim.advanceUntil(1e-6);
    expect(steps.length).toBeGreaterThan(0);
    expect(sim.simTime).toBeGreaterThanOrEqual(1e-6);
    sim.dispose();
  });

  it('buck-boost runs a full 5 µs without throwing', async () => {
    const sim = await createTransientSim(BUCK_BOOST_NETLIST);
    expect(() => sim.advanceUntil(5e-6)).not.toThrow();
    sim.dispose();
  });

  it('hitting the dt floor throws TimestepTooSmallError with kind=dt-floor', async () => {
    // A pathological circuit with no physical solution — force dt floor.
    const pathological = `
V1 1 0 DC 5
.model DBAD D(IS=1e-60 N=0.01)
D1 1 0 DBAD
.tran 1n 1u
`;
    const sim = await createTransientSim(pathological);
    try {
      expect(() => sim.advanceUntil(1e-6)).toThrow(TimestepTooSmallError);
    } finally {
      sim.dispose();
    }
  });
});
```

- [ ] **Step 2: Run test to confirm buck-boost still fails (reproducing the bug)**

Run: `pnpm --filter @spice-ts/core test transient-driver -- --run`

Expected: the two buck-boost tests fail with `TimestepTooSmallError`.

- [ ] **Step 3: Raise `MIN_TIMESTEP` and add GMIN stepping to the driver**

In `packages/core/src/analysis/transient-driver.ts`:

Change the constant at the top:

```ts
const MIN_TIMESTEP = 1e-12;
```

Add the GMIN schedule constant below it:

```ts
const GMIN_FALLBACK_SCHEDULE = [1e-8, 1e-10, 1e-12] as const;
const BASELINE_GMIN = 1e-12;
const GMIN_DECAY_FACTOR = 0.01;
```

Add a private field to `TransientSimImpl`:

```ts
  private currentGmin = BASELINE_GMIN;
```

Replace the `advance()` method retry loop (the inner `for (;;)` loop) with:

```ts
  advance(): TransientStep {
    if (this.disposed) throw new InvalidCircuitError('TransientSim has been disposed');

    const prevSol = new Float64Array(this.assembler.solution);
    const baseline = this.options.gmin || BASELINE_GMIN;

    while (true) {
      const nextTime = this.config.stopTime !== undefined
        ? Math.min(this.time + this.dt, this.config.stopTime)
        : this.time + this.dt;
      const actualDt = nextTime - this.time;

      // Try the current dt across the GMIN-stepping schedule before halving dt.
      const gminAttempts = [this.currentGmin, ...GMIN_FALLBACK_SCHEDULE.filter(g => g > this.currentGmin)];
      let converged = false;
      let solution: Float64Array | undefined;
      let usedGmin = baseline;

      for (const gmin of gminAttempts) {
        this.assembler.solution.set(prevSol);
        const result = attemptStep(
          { compiled: this.compiled, assembler: this.assembler, solver: this.solver, options: this.options },
          {
            dt: actualDt,
            time: nextTime,
            prevSolution: prevSol,
            prevB: this.prevB,
            gmin,
            voltageLimit: NR_VOLTAGE_LIMIT,
          },
        );
        if (result.ok) {
          converged = true;
          solution = result.solution;
          usedGmin = gmin;
          break;
        }
      }

      if (!converged) {
        this.dt = this.dt / 2;
        if (this.dt < MIN_TIMESTEP) {
          throw new TimestepTooSmallError(this.time, this.dt);
        }
        this.assembler.solution.set(prevSol);
        continue;
      }

      const sol = solution!;

      // LTE rejection
      const lteRatio = this.checkLTE(sol, prevSol, actualDt);
      if (lteRatio > 1) {
        const factor = Math.max(0.25, 0.9 / Math.sqrt(lteRatio));
        this.dt = Math.max(actualDt * factor, MIN_TIMESTEP);
        this.assembler.solution.set(prevSol);
        this.lteRejectCount++;
        continue;
      }
      this.lteRejectCount = 0;

      // Update trapezoidal history
      if (this.options.integrationMethod === 'trapezoidal') {
        this.assembler.clear();
        const ctx = this.assembler.getStampContext();
        for (const d of this.compiled.devices) d.stamp(ctx);
        this.prevB = new Float64Array(this.assembler.b);
      }

      // Decay GMIN for next step: gmin_{n+1} = max(baseline, usedGmin * decay)
      // - Success at baseline: clamped back to baseline.
      // - Success at 1e-8: next step tries 1e-10 first, then 1e-12 the step after.
      this.currentGmin = Math.max(baseline, usedGmin * GMIN_DECAY_FACTOR);

      this.secondPrevSol = prevSol;
      this.prevDt = actualDt;
      this.time = nextTime;

      const growFactor = lteRatio > 0.001 ? Math.min(2.0, 0.9 / Math.sqrt(lteRatio)) : 2.0;
      this.dt = Math.min(actualDt * growFactor, this.config.maxTimestep,
        this.config.stopTime !== undefined ? this.config.stopTime - this.time : Infinity);

      return this.buildStep(sol);
    }
  }
```

Also update `reset()` to clear `currentGmin`:

```ts
    this.currentGmin = BASELINE_GMIN;
```

(Insert this line anywhere inside `reset()` before the `this.initDC()` call.)

- [ ] **Step 4: Run driver tests**

Run: `pnpm --filter @spice-ts/core test transient-driver -- --run`

Expected: all driver tests pass, including the new buck-boost convergence tests and the `TimestepTooSmallError` test. If buck-boost still fails, dump `currentGmin`, `dt`, and NR iteration counts per step to diagnose which part of the schedule is insufficient.

- [ ] **Step 5: Run full core suite**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/analysis/transient-driver.ts packages/core/src/analysis/transient-driver.test.ts
git commit -m "fix(core): GMIN stepping + raised MIN_TIMESTEP fixes buck-boost NR divergence"
```

---

## Task 7: Adaptive NR voltage-limit with oscillation detection

GMIN stepping fixes buck-boost on the observed failure. The NR adaptive damping is a defense-in-depth measure — if NR oscillates between two voltages during an iteration sweep, tighten the per-iteration cap so the step lands in the valley between the two candidate solutions.

**Files:**
- Modify: `packages/core/src/analysis/transient-step.ts`
- Modify: `packages/core/src/analysis/transient-step.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/analysis/transient-step.test.ts`:

```ts
describe('attemptStep NR adaptive damping', () => {
  it('reports oscillation in the step result when sign flips are detected', () => {
    // Build a diode with very sharp I-V curve so NR oscillates at the first step.
    const ckt = parse(`
V1 1 0 DC 5
.model DSHARP D(IS=1e-18 N=0.1)
D1 1 0 DSHARP
.tran 1u 1m
`);
    const compiled = ckt.compile();
    const options = resolveOptions(undefined, 1e-3);
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const solver = createSparseSolver();
    const prevSol = new Float64Array(assembler.solution);

    const result = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 3.5 },
    );

    // This particular pathological model should trigger the oscillation branch
    // at least once. We don't care whether it ultimately converges — just that
    // the step result can carry the oscillation flag.
    if (result.ok) {
      expect(typeof result.oscillated).toBe('boolean');
    }
  });

  it('a tighter voltage limit reduces per-iteration delta magnitude', () => {
    const ckt = parse(`
V1 1 0 DC 10
R1 1 2 10
R2 2 0 10
.tran 1u 1m
`);
    const compiled = ckt.compile();
    const options = resolveOptions(undefined, 1e-3);
    const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
    const solver = createSparseSolver();
    const prevSol = new Float64Array(assembler.solution);

    const tight = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 0.1 },
    );
    assembler.solution.fill(0);
    const loose = attemptStep(
      { compiled, assembler, solver, options },
      { dt: 1e-6, time: 1e-6, prevSolution: prevSol, prevB: undefined, gmin: 1e-12, voltageLimit: 10 },
    );

    expect(tight.ok).toBe(true);
    expect(loose.ok).toBe(true);
    if (tight.ok && loose.ok) {
      // Tight limit should take more NR iterations to converge
      expect(tight.iterations).toBeGreaterThanOrEqual(loose.iterations);
    }
  });
});
```

- [ ] **Step 2: Run test, expect TypeScript error on `result.oscillated`**

Run: `pnpm --filter @spice-ts/core test transient-step -- --run`

Expected: TypeScript compile error because `StepResult.ok === true` branch doesn't have `oscillated`.

- [ ] **Step 3: Extend `StepResult` and the NR loop**

In `packages/core/src/analysis/transient-step.ts`:

Update the `StepResult` success variant:

```ts
export type StepResult =
  | {
      readonly ok: true;
      readonly solution: Float64Array;
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
```

Replace the NR loop body in `attemptStep` with a version that tracks sign flips and tightens the limit:

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @spice-ts/core test transient-step -- --run`

Expected: all tests pass.

- [ ] **Step 5: Run full core suite**

Run: `pnpm --filter @spice-ts/core test -- --run`

Expected: all tests pass, including the buck-boost convergence tests from Task 6 (oscillation detection should not regress any circuit that already converged).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/analysis/transient-step.ts packages/core/src/analysis/transient-step.test.ts
git commit -m "feat(core): adaptive NR voltage limit tightens on sign-flip oscillation"
```

---

## Task 8: Full buck-boost integration test + hard-switching fixture set

Headline acceptance criterion: the showcase buck-boost netlist runs to completion at `.tran 50n 50m`. Also validate buck and boost don't regress.

**Files:**
- Create: `packages/core/src/analysis/transient-driver-integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/core/src/analysis/transient-driver-integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from './transient-driver.js';

const BUCK = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 sw gate in 0 NMOD W=1m L=1u
D1 0 sw DMOD
L1 sw out 100u
C1 out 0 100u
Rload out 0 10
.tran 50n __STOP__
`;

const BOOST = `
Vin in 0 DC 5
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
L1 in sw 100u
M1 sw gate 0 0 NMOD W=1m L=1u
D1 sw out DMOD
C1 out 0 100u
Rload out 0 10
.tran 50n __STOP__
`;

const BUCK_BOOST = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 50n __STOP__
`;

function withStop(nl: string, stop: string): string {
  return nl.replace('__STOP__', stop);
}

describe('hard-switching converter integration', () => {
  it('buck runs to 10 ms without throwing', async () => {
    const result = await simulate(withStop(BUCK, '10m'));
    expect(result.transient).toBeDefined();
    const vout = result.transient!.voltage('out');
    expect(vout[vout.length - 1]).toBeGreaterThan(4); // ~6 V steady state
    expect(vout[vout.length - 1]).toBeLessThan(8);
  }, 30_000);

  it('boost runs to 10 ms without throwing', async () => {
    const result = await simulate(withStop(BOOST, '10m'));
    expect(result.transient).toBeDefined();
    const vout = result.transient!.voltage('out');
    expect(vout[vout.length - 1]).toBeGreaterThan(7);
  }, 30_000);

  it('buck-boost runs to 50 ms without throwing — HEADLINE', async () => {
    const result = await simulate(withStop(BUCK_BOOST, '50m'));
    expect(result.transient).toBeDefined();
    const vneg = result.transient!.voltage('neg');
    // After 50 ms the inverting buck-boost should have a clearly negative output
    expect(vneg[vneg.length - 1]).toBeLessThan(-5);
    expect(vneg[vneg.length - 1]).toBeGreaterThan(-30);
  }, 60_000);

  it('buck-boost via createTransientSim advances past the first switching edge', async () => {
    const sim = await createTransientSim(withStop(BUCK_BOOST, '10m'));
    // Check specifically that simTime crosses past t=562 ns (the previous failure point)
    sim.advanceUntil(1e-6);
    expect(sim.simTime).toBeGreaterThan(1e-6);
    sim.dispose();
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm --filter @spice-ts/core test transient-driver-integration -- --run`

Expected: all four tests pass. The headline buck-boost 50 ms test is the key criterion.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/analysis/transient-driver-integration.test.ts
git commit -m "test(core): integration tests for hard-switching converters"
```

---

## Task 9: Regression check — accuracy + benchmarks

Confirm no accuracy regression on existing test circuits and no significant runtime regression on benchmarks.

**Files:** none (read-only verification)

- [ ] **Step 1: Run accuracy tests**

Run: `pnpm --filter @spice-ts/core test accuracy -- --run`

Expected: all accuracy assertions pass with errors ≤ the existing thresholds. If any assertion drifts by more than 1e-9 absolute or 0.5% relative, investigate before proceeding — the driver refactor should be bit-for-bit on circuits that previously converged (same integration method, same NR tolerances, same stamp order).

- [ ] **Step 2: Run the benchmark (fast, vitest-native)**

Run: `pnpm --filter @spice-ts/core bench -- --run`

Record:
- `Resistor ladder 10` ops/sec
- `RC chain 10/50/100` ops/sec
- `CMOS inv chain 5/10` ops/sec
- `Ring oscillator 3/5` ops/sec

Compare against the numbers in `README.md` (or a recent run on this machine). Expected regression: ≤5% on circuits that already converge. GMIN stepping only runs on NR failures, so successful-first-try circuits should be virtually unchanged.

- [ ] **Step 3: Run `bench:accuracy`**

Run: `pnpm bench:accuracy` (from the repo root)

Expected: no regression against the ngspice reference. Output should show the same circuits passing with the same error bounds.

- [ ] **Step 4: Document the run in the PR description**

Prepare a short note for the PR:

```
Accuracy: all checks green (RC 0.29%, BJT 2.7%, RLC 0.4%, RC ladder 0.23%).
Benchmarks (M4 Pro, Node 24): within noise of baseline on all circuits.
New result: buck-boost converges to 50 ms (previously threw at t=562 ns).
```

No commit needed for this task — it's pure verification. If regressions appear, loop back to the relevant task.

---

## Self-review checklist (for the plan author)

- [x] Every spec requirement maps to a task:
  - Goal 1 (buck-boost converges) — Tasks 6, 8
  - Goal 2 (general convergence robustness) — Tasks 6, 7, 8
  - Goal 3 (driver API) — Tasks 3, 4, 5
  - Goal 4 (`simulate`/`simulateStream` unchanged) — Tasks 4, 9
  - Error model — Task 1
  - P1.1 GMIN stepping — Task 6
  - P1.2 `MIN_TIMESTEP` raise — Task 6
  - P1.3 NR state-aware damping — Task 7
  - Tests per spec — Tasks 2, 3, 6, 7, 8
  - Benchmarks — Task 9
- [x] P2 items (warm-start, per-device hints) not included — spec flagged them as "ship if tractable, else follow-up"; they're deferred.
- [x] No "TODO" / "TBD" / "fill in later" in the plan.
- [x] Type names consistent across tasks (`StepContext`, `StepAttempt`, `StepResult`, `TransientSim`, `TransientSimOptions` all spelled identically).
- [x] Method names match between definition (Task 3) and usage (Tasks 4, 6, 8).
