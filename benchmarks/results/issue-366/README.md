# Issue #366 — transient `simulate()` never terminated on xyce/inductor-transient

Fixture: `benchmarks/corpus/xyce/fixtures/INDUCTOR/inductor.cir`, unchanged
(sha256 `a0a869d9fe3b04d3bbdc8abf9e8a89a9302a54ac5be9c97f446f06834a248b35`).
Base commit `7bc2d64`. ngspice-47 (Homebrew, KLU), Node v22.23.1, macOS arm64.
Runtimes below are single wall-clock runs on a heavily loaded host
(load average 20–60 from parallel agents); descriptive only, no speed claim.

## Root cause

1. `I1 1 0 PULSE(0 5 0 1MS ...)` drives `L1` through 1 mOhm, so V(2) = -L di/dt
   is algebraic. The first trapezoidal step used history from the DC operating
   point (v_L = 0) across the PULSE corner at t=0, giving -100 V instead of
   -50 V. Trapezoidal then alternates -100 / 0 forever (undamped ringing whose
   amplitude does not shrink with dt).
2. Node-voltage LTE rejected every step on that ringing; dt fell under the
   1e-13 s LTE floor, the step was accepted unchecked, grew x2, was rejected,
   and so on. Measured on the base commit: 200 000 accepted steps advanced
   simulated time by 1.4e-11 s (min accepted dt 4.66e-14 s) — no end.

## Fix (general, no fixture or name special-casing)

- PULSE/PWL breakpoint lists now keep a corner at t=0. When any device kinks
  at t=0 the driver takes the first step at order 1 with
  dt = min(dt, 0.1 x first breakpoint gap) / 10 — the ngspice `dctran.c`
  first-breakpoint rule. Circuits without a t=0 kink keep the trapezoidal start.
- `TransientProgressMonitor` (new): after an LTE rejection, 16 consecutive
  accepted steps without a passing LTE check restart integration at order 1
  from the accepted point (recovers ringing behind slope kinks no source
  reports, e.g. a SIN with TD). Steps that are unchecked only because the
  user TSTEP is at or below the 1e-13 s LTE floor never count, so lossless LC
  tanks with a sub-0.1 ps TSTEP stay trapezoidal (review fix: L=1n/C=0.25p
  `.tran 5e-14 2n UIC` had decayed to a 0.9886 peak, L=1p/C=1f
  `.tran 1e-14 4e-11 UIC` to 2.2e-5; both now match `origin/main` and
  ngspice-47, see `transient-lc-tank-floor.test.ts`). If a 10 000-step window advances less than 10 000 x min(1e-12 s,
  1e-3 x maxStep), it throws `ConvergenceError` with `kind: 'lte-cascade'`
  and telemetry `failure: 'lte-cascade'` instead of looping.

## Before / after (identical bytes to both engines)

`report.json` (`verify.ts`, spice-ts in a bounded child process, 30 s limit):

| | before (base) | after |
|---|---|---|
| spice-ts status | failed: exceeded 30 000 ms (from `../issue-322/report.json`) | success, 276 points |
| ngspice-47 | success, 233 points | success, 233 points |
| in-process `simulate()` | did not return in 300 s (issue repro) | 22–28 ms (3 runs) |
| `ngspice -b` | — | 0.02–0.04 s real (3 runs) |

Errors vs ngspice-47 (linear interpolation, both grids published):

| signal | grid | abs max | abs RMS | rel max | rel RMS |
|---|---|---|---|---|---|
| i(l1) | spice-ts | ~0 (<1e-13) | ~0 | ~0 | ~0 |
| v(1) | spice-ts | 31.65 V | 8.27 V | 0.9998 | 0.345 |
| v(2) | spice-ts | 31.65 V | 8.27 V | 6.0 | 0.963 |
| v(1) | ngspice | 49.26 V | 12.60 V | 9.0 | 0.880 |
| v(2) | ngspice | 49.26 V | 12.60 V | 9.0 | 1.575 |

These V(1)/V(2) numbers are a published loss of the interpolated metric, but
they come from interpolation, not from either engine: V = -L di/dt jumps by
50 V at every PULSE corner (1, 11, 12 ms) and the two engines place their
post-corner points at different times, so interpolating one across the jump
lands mid-step. Interpolation-free check (`coincidentTimepoints`, the 5
timepoints both engines share, 0/1/11/12/20 ms): v(1), v(2) max abs error
8.1e-10 V; i(l1) 8.9e-15 A. Both engines produce -50 V / 0 / +50 V / 0
plateaus (spot-checked) matching the analytic L di/dt.

## Side effects on other ngspice comparisons (before -> after)

`parity-delta.json` (comparison-harness.ts, 10 fixtures; classic corpus report, 20 fixtures):

- No fixture changed status.
- `rc-chain-tran` v(2): abs max 6.05e-5 -> 3.59e-5 V, abs RMS 1.90e-5 -> 1.11e-5 V
  (win). Loss: rel max 7.3e-4 -> 0.086, rel RMS 5.4e-5 -> 0.0064, from new
  sub-ns samples (|V| < 1e-7 V) where linear interpolation of ngspice's convex
  t^2 rise dominates.
- `mos6-inverter-chain` (pre-existing multi-volt mismatch): 44 signals moved,
  33 with slightly higher abs max or RMS (largest: v(xndinv1.22) RMS
  0.726 -> 0.735 V; v(xndinv4.14) max 4.643 -> 4.648 V), the rest lower.
  All values listed in `parity-delta.json`.

`xyce-transient-{before,after}.json` (every Xyce transient fixture):

- `rlc-transient`: 1002 -> 1004 points; v(1) abs RMS 0.316 -> 0.488 V,
  v(2) 2.75 -> 2.78 V, v(3) 3.04 -> 3.08 V (losses); i(l1) 0.912 -> 0.911 A.
  The abs max (10 V, 2.5 A) is the same before and after; it comes from a
  separate gap, zero-TR PULSE semantics (ngspice uses TSTEP), filed as #375.
  The extra early sample lands inside ngspice's 10 ms ramp.
- Other Xyce transient fixtures are unsupported by ngspice (`.tran 0 ...`)
  or spice-ts (`newlte`) on both commits — unchanged.

`pnpm bench:accuracy`: identical table before and after (8 circuits).

## Reproduce

```
pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-366/verify.ts --output benchmarks/results/issue-366/report.json
pnpm exec tsx benchmarks/results/issue-366/xyce-transient.ts --output benchmarks/results/issue-366/xyce-transient-after.json
# base commit (inductor-transient skipped because it does not terminate there):
pnpm exec tsx benchmarks/results/issue-366/xyce-transient.ts --skip inductor-transient --output benchmarks/results/issue-366/xyce-transient-before.json
```

`parity-delta.json` records its exact before/after commands.

## Follow-ups (out of scope, filed)

- #375 PULSE zero TR/TF should default to TSTEP (rlc-transient gap above).
- #376 Newton clamps linear node voltages to 3.5 V/iteration: a delayed
  `SIN(0 5 1k 0.5m)` current into 10 mH fails with `TimestepTooSmallError`
  (structured, terminates) where ngspice completes.
