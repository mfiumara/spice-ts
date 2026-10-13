# RC1k transient residual attribution (#969)

## Result

Attribution only. No newly measured residual path reaches 20% of simulate in any of the 15 observations. No production optimisation, tolerance change, or per-circuit tuning was made. The largest named residual bucket is newtonAttemptSelf, 6.184 ms median (9.378% of simulate, maximum 10.294%). The remaining unattributed bucket is 7.237 ms (10.898%, maximum 11.383%). Do not combine unrelated buckets to manufacture a qualifying hot path.

spice-ts still loses. Uninstrumented cold-process wall including all-vector hash is 139.587 ms median / 2.711 ms IQR. ngspice-47 native wall plus parsing/hashing every raw vector is 44.492 / 0.980 ms. The ratio is 3.137x. These boundaries follow #960; the JS wrapper around ngspice is not native runtime. No before/after optimisation claim is made. The #958 RC1k/10k/50k rerun was conditional on optimising and was not needed.

## Attribution

All rows n=15. IQR uses interpolated quartiles. Percentages are computed within each observation, not by dividing independent medians. Zero observations were removed or retried. All 45 top-level workloads and 15 native grandchildren are retained and certified. No failures, timeout, epoch correction or outlier trimming occurred.

| Exclusive bucket | ms median / IQR | median share of simulate | maximum share | >=20% observations |
|---|---:|---:|---:|---:|
| driverSetup | 1.499 / 0.052 | 2.217% | 2.291% | 0/15 |
| driverAdvanceSelf | 1.293 / 0.076 | 1.940% | 2.169% | 0/15 |
| timestepSelection | 0.187 / 0.021 | 0.283% | 0.317% | 0/15 |
| eventControl | 0.014 / 0.001 | 0.020% | 0.027% | 0/15 |
| nodeLTE | 0.196 / 0.006 | 0.294% | 0.495% | 0/15 |
| chargeTruncation | 3.119 / 0.187 | 4.660% | 5.164% | 0/15 |
| orderControl | 0.043 / 0.010 | 0.064% | 0.153% | 0/15 |
| acceptHistory | 2.797 / 0.090 | 4.141% | 4.347% | 0/15 |
| staticHistorySelf | 3.790 / 0.138 | 5.724% | 5.898% | 0/15 |
| newtonAttemptSelf | 6.184 / 0.267 | 9.378% | 10.294% | 0/15 |
| linearSolveSelf | 0.729 / 0.029 | 1.099% | 1.239% | 0/15 |
| convergenceCheck | 0.065 / 0.012 | 0.099% | 0.159% | 0/15 |
| remaining simulateResidual | 7.237 / 0.199 | 10.898% | 11.383% | 0/15 |

`table.md` contains the full control/instrumented/native boundary table. Instrumented simulate is 66.265 / 1.469 ms, control is 63.278 / 1.025 ms. Existing load/stamp is 20.901 / 0.469 ms, factor 3.770 / 0.173 ms, solve 2.129 / 0.061 ms. Load/stamp is already attributed by #960, not a newly discovered residual hot path.

The same-run reconstruction of the old #960 residual (remaining residual plus the added disjoint spans) has median 27.058 ms. The previous #960 run's 29.0 ms and this run's smaller total timings are different observations on a shared machine, not an optimisation or measured speedup. Medians of components do not generally sum to the median of their total.

## What is actually measured

The optional --residual mode wraps function bodies in benchmark-only copies of built JavaScript. It never modifies core sources or dist. Each span records elapsed time minus nested span elapsed, even for early returns or throws. The old default target set remains unchanged. Preparation fails unless every selected function exists exactly once; the prepared target map and bundle hashes are archived.

- driverSetup measures constructor work excluding nested stamps and accept/history spans.
- driverAdvanceSelf measures advanceSolution work excluding Newton, step selection, events, LTE, truncation, history and order spans. It includes its solution copy and bookkeeping, not a separately measured allocation bucket.
- newtonAttemptSelf measures attemptStep work excluding companion construction, linear solve and convergence checks. Cache lookups, predictor setup, copies, raw delta and damping work remain together. It is not labelled as allocation or convergence alone.
- linearSolveSelf measures solveLinearized work outside factor/solve, including RHS copy and finite checks.
- staticHistorySelf measures stampPrevB outside stampStaticDevices, including assembler clearing and the static residual matrix-vector product.
- nodeLTE, chargeTruncation and convergenceCheck measure their complete functions. Charge truncation includes reactive charge evaluation and charge-state LTE. acceptHistory includes reactive charge history updates.
- The remaining residual includes work outside selected functions, DC work outside existing spans, orchestration and instrumentation bookkeeping. GC and allocation pressure are not independently measured. GC pauses can fall within any elapsed span. No causal GC claim is supported.

Instrumentation changes execution/JIT behaviour. Instrumented minus control wall medians is 3.459 ms. Paired difference median is 3.297 ms, range -1.906..8.729 ms; every signed observation is in summary.json. This is overhead evidence, not a correction applied to bucket times.

## Provenance, load and hashes

Fresh origin/main d3901ec1 was fast-forwarded to the still-open #966 harness branch head 405e9dc6f054931bf90f1a21b9272a32228c7370. This PR depends on #966. Core code measured is unchanged from that head. The working-tree harness edits are the optional instrumentation above. Frozen control/instrumented bundles are in this directory as deterministic gzip snapshots and each decompressed hash is in prepared.json.

Apple M5 Pro, 18 logical CPUs, 48 GiB RAM, Darwin arm64. Node v22.23.1, pnpm 10.28.1, ngspice-47 with KLU. host-00.json retains versions, uname and clock provenance. One-minute host load (90 before/after observations) is 5.469 median / 0.128 IQR, range 5.469..5.597. Process count range is 1231..1234. Host diagnostics run outside timing.

Same byte-identical synthetic RC1k deck as #958/#960, generated by scaling-m2-fixture.mjs. Source/licence provenance is already recorded in benchmarks/SOURCES.md. No third-party circuit was added.

Deck SHA256: 0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7.
All 30 spice-ts control/instrumented outputs share SHA256 6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7, identical to #960. All 15 native outputs share 437fcf743eca12eaf2486bf14b29940aa79b59bc3f490e420bb1aa186e9d0055. These engines' hashes are not equal to each other. Each covers 1002 vectors / 120240 values, including time and all branch currents. Each spice-ts run retains 238 Newton iterations. Native raw files and probe/grid evidence are retained; native hashes are rechecked offline.

## Reproduce

Run from the repo root after pnpm install --frozen-lockfile and pnpm build. Choose a new output directory (archives are immutable):

    spice-heavy python3 benchmarks/performance/rc1k-attribution.py YOUR_OUTPUT --residual
    node benchmarks/performance/rc1k-attribution-report.mjs YOUR_OUTPUT

The rotating order interleaves control/instrumented/ngspice for 15 rounds, bounds each process group to 60 seconds and total workload count to 60. Continuous/realtime/monotonic certification is unchanged from #960. The macOS continuous epoch is explicitly selected.

Offline verification launches no simulator:

    pnpm -C packages/core exec vitest run --root "$PWD" --config "$PWD/benchmarks/performance/rc1k-attribution.vitest.mjs"

12 tests passed, including all archived SHA256s, all bundle snapshots, counts, hash equality, nested span returns/throws, partition closure, percentile distributions and the 20% gate. red-actual.log shows the real regression failing without configurable targets (1 failed / 10 passed); green-correct-root.log shows the initial 11-test GREEN, offline-final.log the 12-test archive check. Earlier red.log/green.log and red-behavior.log/green-behavior.log are failed test-discovery attempts, not behaviour RED/GREEN. They remain archived honestly.

Build and lint passed (exit 0). The guarded full suite passed (exit 0), 310 files, 3987 tests passed and 2 skipped; core contributed 278 files and 3590 passed / 2 skipped. Four targeted transient files passed all 49 tests. Exact-head CI receipts are handed off with the card. This archive is not a parity aggregate regeneration.
