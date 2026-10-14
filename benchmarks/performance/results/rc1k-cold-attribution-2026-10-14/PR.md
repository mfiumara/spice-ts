## What and why

Fixes #960. Measurement/attribution only, based on d3901ec1 after PR #961. Adds a bounded, interleaved cold-process harness, offline vitest checks, and a new SHA256-manifested archive. No simulator optimization or changes under packages/core/src; the #958 scaling matrix and aggregate outputs are untouched. The existing MIT M2 source/deck is reused byte-identically, so SOURCES.md needs no new entry.

## Outcome

The loss remains. Unprofiled spice-ts wall median **159.048 ms** versus native ngspice-47 KLU wall plus full-output materialization/hash **45.598 ms**, a **3.488x** ratio of medians. This is not an optimization before/after result. #958's single 133.709 / 51.680 ms observations used controller polling and did not include identical full hashing on both sides; the present native run emits all vectors to a binary raw file.

Conclusion: **mixed cold-start and benchmark/core-attribution gap**, not an isolated LU bottleneck. Startup/import and parse are substantial, but simulation remains slower than native acct analysis. The instrumented simulation residual is 29.011 ms median versus load/stamp 23.208 ms. Residual exceeds load/stamp in 15/15 children; load/stamp exceeds factor+solve in 15/15. No single identified core hot path dominates reproducibly, so no general optimizer is selected or implemented. Recommend a separate bounded attribution of the simulation residual before an optimizer card. Do not label that residual GC, device load or startup without evidence.

## Boundaries

All observations retained. Times are milliseconds, median / interpolated IQR. Full n, q1/q3, min/max are in summary.json.

| Boundary | Control | Instrumented | ngspice wrapper / native acct |
|---|---:|---:|---:|
| Cold wrapper wall | 159.048 / 15.168 | 158.940 / 14.204 | 145.817 / 18.521 |
| Engine process + full hash | 159.048 / 15.168 | 158.940 / 14.204 | 45.598 / 9.801 |
| Spawn to first user code | 30.334 / 9.718 | 24.590 / 7.916 | 26.617 / 10.122 (wrapper) |
| Import | 26.495 / 10.861 | 29.006 / 12.112 | 3.632 / 2.277 (wrapper) |
| Deck read | 0.437 / 0.221 | 0.582 / 0.228 | 0.310 / 0.196 (wrapper) |
| Parse / native netlist load | 14.635 / 10.830 | 21.303 / 10.263 | 2.286 / 1.425 (acct) |
| Compile | unavailable | 7.631 / 6.254 | unavailable |
| Simulate | 73.921 / 11.681 | 73.367 / 6.454 | unavailable |
| Device load/stamp | unavailable | 23.208 / 6.685 | 3.848 / 1.546 (acct) |
| Factor | unavailable | 4.214 / 0.686 | 3.364 / 1.886 (acct) |
| Solve | unavailable | 2.237 / 0.720 | 2.840 / 1.298 (acct) |
| Reorder | unavailable | unavailable | 0.104 / 0.097 (acct) |
| Simulation residual | unavailable | 29.011 / 2.718 | unavailable |
| Internal output materialization | unavailable | 3.433 / 1.727 | unavailable |
| External output materialization/hash | 6.137 / 2.004 | 5.429 / 2.806 | 11.740 / 5.182 |
| Internal materialization + external hash | unavailable | 9.320 / 3.877 | unavailable |
| Receipt handoff to exit/reap | 4.751 / 1.227 | 3.708 / 1.303 | 2.789 / 1.000 (wrapper) |
| Native process wall | unavailable | unavailable | 37.957 / 13.712 |
| Native analysis | unavailable | unavailable | 17.213 / 8.738 (acct) |

The ngspice wrapper cold wall includes Node startup, import, process-count diagnostics and hashing. It is not the engine comparison. The ngspice engine+hash row is per-sample native process wall + raw read/materialization/hash, excluding wrapper startup/exit and diagnostics. Native all-node raw emission is unsplit inside native wall. Native first-user-code/import/compile/raw-emission splits are unavailable, not invented zeros. Native acct phase timers are not equivalent wall clocks. Nested rows and separate medians must not be added.

Instrumentation overhead, instrumented-minus-control medians, is **-0.109 ms**. Paired median is **+0.885 ms**, min/max **-24.126 / +35.226 ms**. The negative median difference is variation, not evidence of a speedup or free instrumentation. Host loadavg(1) before/after ranges **6.708–8.077**, process count **1235–1238**. All samples and host-load receipts are published, none trimmed.

## Integrity and certification

- Exactly **60 workload processes**: 15 control + 15 instrumented + 15 ngspice/hash wrappers + 15 native ngspice grandchildren. Archive has 45 top-level receipts and 15 native child receipts, plus raw logs/outputs and host-load envelopes. Administrative `ps`, preparation/report/test commands are explicitly outside the engine-workload count.
- 60-second per-child deadline, rotating interleaved order, blocking pipe/reap endpoints, #951 native continuous-clock certification. No 10 ms observation polling and no inspector/V8 profiler.
- Benchmark-only AST body spans on copied built JS. No core source or dist edits. Prepared bundle snapshots/digests are archived; nested spans are exclusive.
- Both engines hash **all 1002 vectors / 120240 doubles**, identically serialized as name+NUL+little-endian Float64 bytes. Every one of the 30 spice-ts outputs matches #958 `6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7`. All 15 ngspice outputs share `437fcf743eca12eaf2486bf14b29940aa79b59bc3f490e420bb1aa186e9d0055`. Cross-engine hashes need not match bitwise.
- Both have 238 transient iterations / 120 saved points. On n10, max grid difference 6.617e-24 s, max absolute voltage difference 7.772e-16 V, RMS 3.680e-16 V. Probe evidence only, not an all-node accuracy claim.
- **One retained controller error, no hidden exclusion.** 01-control assumed Python monotonic and Node hrtime shared an epoch. On this macOS/Node22 host hrtime uses the continuous epoch. The original impossible startup/exit split and invalid status remain archived. We stopped, corrected the controller, then resumed without replacement or extra workloads. The report transparently rederives that row's split from its saved continuous timestamps and includes it in n=15 distributions, without changing its invalid flag. Reported certification is **44 originally certified top-level receipts plus one recovered flagged observation**, not 45 certified receipts. The runner's exit 1 retains that original error; no simulator failed or timed out.

## How to test

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
pnpm -C packages/core exec vitest run --root ../.. --config benchmarks/performance/rc1k-attribution.vitest.mjs
spice-heavy pnpm test
node benchmarks/performance/rc1k-attribution-report.mjs benchmarks/performance/results/rc1k-cold-attribution-2026-10-14
(cd benchmarks/performance/results/rc1k-cold-attribution-2026-10-14 && shasum -a 256 -c SHA256SUMS)
```

For an optional guarded reviewer sanity check, choose a fresh output directory and run `spice-heavy python3 benchmarks/performance/rc1k-attribution.py /absolute/fresh/output --rounds 3`. Do not rerun workload measurements into the frozen archive or regenerate the old scaling matrix.

Local install/build/lint passed. Offline vitest **10/10** passed, including full archive/hash reconciliation and deterministic receipt statistics. Guarded root suite **4143 passed, 6 skipped, exit 0**, archived as full-test.log.gz. Syntax and whitespace checks passed. Required exact-head CI is checked before the Kanban handoff; independent review remains required. Do not merge this PR from the engineer lane.
