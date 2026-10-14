## What / why

Fixes #969.

Extends the #960 cold-process harness with optional benchmark-copy AST spans for transient driver/Newton self-time, timestep selection, LTE, charge truncation, accepted history and convergence checks. Default instrumentation is unchanged. No production source or tolerance changes.

Based on fresh origin/main d3901ec1 plus still-open #966 head 405e9dc6f054931bf90f1a21b9272a32228c7370, as the card requested. Merge #966 first. The incremental change begins after that exact head.

## Evidence / decision

15 interleaved rounds, all 60 workloads retained, all 45 controller receipts certified. No residual path qualifies for the issue's >=20% gate in any observation. Largest named bucket is Newton attempt self-time 6.184 ms median / 0.267 ms IQR, median share 9.378%, maximum 10.294%. Remaining residual is 7.237 / 0.199 ms, maximum share 11.383%. Attribution only; no optimisation or conditional RC1k/10k/50k rerun.

Loss remains published. spice-ts control cold wall+hash 139.587 / 2.711 ms vs native ngspice-47 wall+hash 44.492 / 0.980 ms, 3.137x slower. Control vs instrumented simulate 63.278 vs 66.265 ms is instrumentation overhead, not before/after optimisation evidence.

All 30 JS outputs hash to 6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7 across all 1002 vectors / 120240 values, matching #960. Native hashes retained independently (not claimed equal to JS). Host load, per-process clocks, all raw outputs, bundle snapshots and SHA256SUMS archived under benchmarks/performance/results/rc1k-residual-969. README and table.md contain the full median/IQR table and limitations. GC/allocation are not separately measured or labelled as causal hot paths.

## How to test

- pnpm install --frozen-lockfile
- pnpm build
- pnpm lint
- pnpm -C packages/core exec vitest run --root "$PWD" --config "$PWD/benchmarks/performance/rc1k-attribution.vitest.mjs" (12 offline tests)
- pnpm -C packages/core exec vitest run src/analysis/transient-step.test.ts src/analysis/transient-reactive-truncation-equivalence.test.ts src/analysis/transient-record.test.ts src/analysis/transient-columns.test.ts (49 tests)
- spice-heavy pnpm test
- New measurement only: spice-heavy python3 benchmarks/performance/rc1k-attribution.py NEW_OUTPUT --residual; node benchmarks/performance/rc1k-attribution-report.mjs NEW_OUTPUT

RED receipt is red-actual.log (1 failing regression / 10 passing tests with old target selection). GREEN and archived partition/hash/threshold checks passed. Build/lint exit 0. Guarded full suite exit 0, 310 files and 3987 tests passed / 2 skipped. Exact-head required CI receipts are in the Kanban handoff. Do not merge without independent spice-ts-review of that exact head.
