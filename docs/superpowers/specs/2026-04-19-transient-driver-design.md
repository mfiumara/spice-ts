# Resumable Transient Driver + Convergence Robustness

**Status:** Design
**Date:** 2026-04-19
**Related:** [#40 — Core simulator performance improvements](https://github.com/mfiumara/spice-ts/issues/40)

## Background

Two problems in the current transient analysis:

1. **Buck-boost fails deterministically at t=562 ns** on its first MOSFET switching edge with `TimestepTooSmallError` (`dt=7.45e-16`, 26 halvings below the initial 50 ns). Buck and boost converters converge; the buck-boost topology (high-side NMOS with source at the switching node, diode to ground, boost-inductor configuration) drives Newton-Raphson into a near-singular Jacobian region that successive dt halvings cannot escape.
2. **There is no way to advance, pause, or reset a transient simulation incrementally.** `solveTransient` runs a closed loop from `t=0` to `stopTime` and returns. `simulateStream` yields per-timestep but the generator's state cannot be paused and resumed — only broken and restarted from scratch. A future Falstad-style continuous-mode UI cannot be built on this surface.

This spec is **subproject 1 of two**. Subproject 2 (live continuous-mode UI in the showcase) will build on the API this spec exposes and is deliberately out of scope here.

## Goals

- Fix the buck-boost NR convergence failure root-cause — no netlist tweaks in the showcase.
- Add measurable convergence robustness for hard-switching circuits in general.
- Introduce a new public API (`createTransientSim`) returning a stateful driver with `advance()` / `reset()` semantics.
- Leave `simulate` and `simulateStream` behavior unchanged — they become thin wrappers over the driver.

## Non-goals

- Continuous-mode showcase UI (subproject 2).
- Alternative integration methods (BDF2/Gear). Trapezoidal stays the default.
- BSIM4 or other advanced device models.
- Real-time / wall-clock pacing. The driver advances sim-time only; pacing is the caller's concern.

## Architecture

```
packages/core/src/
  analysis/
    transient.ts           ← existing: solveTransient (now delegates to driver)
    transient-driver.ts    ← NEW: createTransientSim + TransientSim class
    transient-step.ts      ← NEW: single-step NR loop + convergence aids
  simulate.ts              ← streamTransient rewritten as driver consumer
```

Responsibility split:

- **`transient-step.ts`** — pure function `attemptStep(state, dt) → { ok, solution, nrIterations, oscillated } | { ok: false, reason }`. No time advancement, no dt adaptation. Just: given assembler state, previous solution, prevB, dt, GMIN value, and damping config, run NR to convergence and return the result. This is the unit that GMIN stepping and NR damping hook into.
- **`transient-driver.ts`** — owns time advancement, dt adaptation (LTE + convergence-failure halving), GMIN stepping schedule, LTE history tracking, public `advance()` / `reset()` / `dispose()` surface.
- **`transient.ts` / `simulate.ts`** — thin wrappers. `solveTransient` loops `driver.advance()` until `stopTime`, accumulating into a `TransientResult`. `streamTransient` yields each `driver.advance()` result.

The driver encapsulates every piece of mutable state that's currently scattered across locals in `solveTransient`: `MNAAssembler`, `prevSol`, `secondPrevSol`, `prevDt`, `prevB`, `dt`, `time`, `lteRejectCount`, `solver`, `patternAnalyzed`, plus new GMIN-stepping state.

## Public API

```ts
// In @spice-ts/core public surface

export interface TransientSim {
  readonly simTime: number;
  readonly stopTime: number | undefined;
  readonly isDone: boolean;  // true when simTime >= stopTime (if set)

  advance(): TransientStep;                        // one NR-converged timestep
  advanceUntil(targetTime: number): TransientStep[];
  reset(): void;                                   // re-run DC op, clear history
  dispose(): void;                                 // release solver memory
}

export interface TransientSimOptions extends SimulationOptions {
  stopTime?: number;       // optional — omit for unbounded continuous mode
  timestep?: number;       // initial dt; defaults to stopTime/50 or 1e-6
  maxTimestep?: number;    // cap on dt; defaults to stopTime/10 or timestep*10
}

export function createTransientSim(
  input: string | Circuit,
  options?: TransientSimOptions,
): Promise<TransientSim>;
```

**Semantics:**

- `createTransientSim` is async (parses the input, runs DC op point).
- `advance()` is sync. It may retry internally (dt halving, GMIN stepping) but returns exactly one converged `TransientStep` on success, or throws `ConvergenceError` on total failure. Throws `InvalidCircuitError` if called after `dispose()`.
- `advanceUntil(t)` loops `advance()` until `simTime >= t`. Useful for batch-per-frame in the UI.
- `reset()` rebuilds DC op point and clears all history. Cheap for small circuits, acceptable as a user-triggered action.
- No explicit `pause()` — pause is "stop calling advance". State persists between calls.
- `stopTime` is advisory: `isDone` becomes true when crossed, but the caller can keep calling `advance()` past it if desired.
- `simulate` and `simulateStream` retain their existing signatures; internally they construct a driver, consume it to completion, and dispose.

## Convergence improvements

All changes live inside `transient-step.ts` and the driver's retry loop. No public API impact beyond `ConvergenceError` replacing `TimestepTooSmallError` as the thrown error class.

### P1 — must ship, targets the buck-boost failure

**1. GMIN stepping on NR failure.**

When `attemptStep` fails to converge, the driver enters "GMIN-stepping mode": it retries the same `dt` with `GMIN` bumped through a fallback schedule `[1e-8, 1e-10, 1e-12]` (default baseline GMIN is `1e-12`). The NR loop adds `GMIN` to every node's diagonal in the companion system as artificial shunt conductance — this smooths sharp MOSFET/diode I-V curves and pushes the Jacobian away from singularity. On success at an elevated GMIN, the driver decays GMIN toward the baseline in subsequent timesteps using `gmin_{n+1} = max(baseline, gmin_n × 0.01)` — four steps brings `1e-8` back to `1e-12`. If all GMIN levels fail at the current dt, only then does dt halve.

**Why this is the biggest lever:** the buck-boost failure is not an "insufficient dt" problem — it's a "Jacobian is ill-conditioned at the NR iterate" problem. Halving dt 26 times doesn't change the Jacobian conditioning, which is why we hit the floor. GMIN stepping is the standard ngspice remedy and it directly addresses the failure mode observed in the probe.

**2. Raise `MIN_TIMESTEP` floor from `1e-15` to `1e-12`.**

`1e-15` seconds is below numerical noise on double-precision arithmetic and below the smallest meaningful physical timescale in any circuit spice-ts targets. Failing fast at `1e-12` means GMIN stepping gets invoked sooner and total time to give up is smaller. Matches ngspice's internal `TSTEPFLOOR` order of magnitude.

**3. NR state-aware adaptive voltage limit.**

Current NR damping caps `|Δv_node|` at `NR_VOLTAGE_LIMIT = 3.5 V` per iteration, regardless of NR behavior. New logic:

- Track the sign of `Δv_node` for each node across the last two NR iterations.
- If signs *flip* (oscillation signal) on any node, tighten cap to 0.5 V for the remainder of this step.
- If signs are stable (decay signal), leave at 3.5 V.

Oscillation between two voltage states is the observable failure signature — the tightening reduces the step size in voltage-space and often breaks the oscillation.

### P2 — ship if tractable, file follow-up otherwise

**4. Linearized warm-start for NR initial guess.**

After a converged step, reuse the current Jacobian to extrapolate `x_{n+1}^{(0)} = x_n + dt · J^{-1} · (dynamic RHS contribution)` as the initial guess for the next step, instead of copying `x_n`. For smoothly-varying solutions this halves NR iterations. Skip if dt just halved (likely discontinuity).

**5. Per-device max-delta hints.**

Let `Device` optionally expose `maxNRDelta()` returning a per-terminal cap. MOSFETs return 2 V on gate (anything larger overshoots a region boundary); diodes return 0.5 V on anode-cathode. The NR damping loop applies the most restrictive active cap across devices touching each node.

## Error model

Unified hierarchy — no breaking changes to consumer code catching by class name.

```ts
class ConvergenceError extends Error {
  readonly time: number;
  readonly dt: number;
  readonly gmin: number;
  readonly kind: 'nr-divergence' | 'lte-cascade' | 'dt-floor';
}

class TimestepTooSmallError extends ConvergenceError {
  readonly kind: 'dt-floor';  // narrowed discriminator
}
```

- `TimestepTooSmallError` stays as the thrown class for `kind: 'dt-floor'` (the case where GMIN stepping was tried at every level and dt has been halved to the floor). Existing `catch (e instanceof TimestepTooSmallError)` code still works.
- `ConvergenceError` is thrown directly for other failure kinds (`'nr-divergence'` — hit NR iteration limit without recovery; `'lte-cascade'` — LTE rejected 10+ steps in a row).
- DC operating-point failures throw `ConvergenceError` with `kind: 'nr-divergence'`.

## Backwards compatibility

- `simulate()` signature unchanged. Output unchanged except that simulations that previously threw `TimestepTooSmallError` may now either succeed (thanks to GMIN stepping) or throw `ConvergenceError`.
- `simulateStream()` signature unchanged. Existing callers (including the showcase) don't need modification.
- `simulateStepStream()` unchanged.
- The accuracy test suite stays green — no algorithmic change for circuits that already converge. GMIN stepping is a strictly additive fallback.

## Testing strategy

**Unit level (`transient-step.test.ts`):**
- `attemptStep` converges in expected iterations for linear RC, RLC circuits.
- `attemptStep` with bumped GMIN converges on a hand-crafted ill-conditioned Jacobian (synthetic diode snap-back).
- Oscillation detector flags known oscillating NR sequences; doesn't flag monotone-decay sequences.

**Driver level (`transient-driver.test.ts`):**
- `advance()` + accumulated timepoints match `solveTransient` output for a reference RC step — proves the wrapper is equivalent.
- `advanceUntil(t)` returns correct number of steps for a known linear circuit.
- `reset()` produces identical results to a fresh driver at `t=0`.
- `advance()` throws `ConvergenceError` (not `TimestepTooSmallError`) after giving up.
- `dispose()` then `advance()` throws.

**Integration (`transient-driver-integration.test.ts`):**
- **The buck-boost fixture from the showcase runs to completion at `.tran 50n 50m`** — this is the headline acceptance criterion.
- Buck and boost fixtures don't regress: same `V(out)` at `stopTime` within 0.1% of pre-change value.
- A parameterized "hard-switching converters" fixture set (synchronous buck, SEPIC, flyback) all converge to 10 ms.
- `simulate(buckBoostNetlist)` from the existing top-level test surface produces valid output (integration with the wrapper).

**Benchmarks:**
- `bench:accuracy` stays green. No regression against ngspice references.
- `bench:compare` numbers tracked — GMIN stepping adds work on NR failures but should be invisible on circuits that already converge. Expect ≤5% regression on circuits that converge first-try.

## Migration notes

No consumer-facing migration required. `simulate`, `simulateStream`, `simulateStepStream`, `Circuit`, and all existing error classes keep their signatures and runtime behavior.

## Open questions (resolved during planning)

- Exact GMIN fallback schedule (`[1e-8, 1e-10, 1e-12]` is the proposed starting point; may need tuning against the full convergence test set).
- Whether `advanceUntil` should yield async (returning an `AsyncIterableIterator`) rather than a synchronous array. Current answer: sync array is fine; consumers can chunk on their own if they need to yield to the event loop. Async iterator adds per-step Promise overhead that isn't justified for non-UI consumers.
- Whether `reset()` should allow overriding `stopTime` or `timestep`. Current answer: no — if you want different parameters, dispose and create a new driver. Keeps reset semantically clean.
