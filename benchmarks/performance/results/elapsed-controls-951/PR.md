## What and why

Fixes #951

Add suspend-inclusive native elapsed accounting and fail-closed deadline/budget controls entirely under `benchmarks/performance/results/elapsed-controls-951/`. macOS uses `mach_continuous_time`; Linux uses `CLOCK_BOOTTIME`, with no unsafe fallback. Cross-check Python monotonic/realtime and complete Node performance/realtime lifetimes, charge controller gaps, kill/reap only owned process groups, and censor every remaining point after the first disagreement or deadline event.

Archived #938 receipts and all production/shared tooling remain unchanged. This PR ships no optimizer, new netlist, profiler, ngspice comparison or superiority claim.

## Evidence

- Literal current-main baseline `45650391b788c91084b6b472dbe1fdcefbd52a19`; all 472 core source files byte-identical to the control. Full source/bundle/input/receipt hashes retained.
- Exactly one fixed 18-child plan through `spice-heavy`: 17 children started, 16 exit0, CMOS50k baseline killed/reaped at 29.801412750s during warm simulation; final control censored. Run exit2 is the required hard stop, not hidden or retried.
- Native actual elapsed 52.526617958s of 300s; all observed child intervals below 30s; all owned groups absent.
- No observed completed-lifetime clock disagreements. Maximum parent monotonic/realtime disagreement 0.003043/0.039147ms; maximum completed Node performance/realtime disagreement 0.918792ms. Timed-out child lacks a full Node lifetime and is not independently clock-certified.
- Six factor-phase pairs and sixteen full simulation-phase pairs match hashes/counts/convergence/capacities. All signed control differences and censored points published, including 12 losses and 10 negative differences. These are unchanged controls, not speedups.
- Full calibration certification remains false after the deadline stop. This single pair cannot establish statistical reproducibility or clear CMOS50k. No optimizer work is justified by it.
- A sleeping/unscheduled controller cannot signal exactly at a deadline. On resume it charges real elapsed, reports overshoot, invalidates certification and stops. Actual host sleep was not induced; deterministic tests cover this failure.

## How to test

Do not rerun calibration or the old #938 runner. The card allowed one measured matrix and it is exhausted.

```sh
python3 -m unittest discover -s benchmarks/performance/results/elapsed-controls-951 -p 'test_*.py' -v
python3 benchmarks/performance/results/elapsed-controls-951/verify.py
pnpm build
pnpm lint
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
spice-heavy pnpm test
```

Local results: 22 offline tests, six fixture tests, build/lint and full monorepo suite pass. Core has 3574 passed/two skipped; root benchmark harness has 144 passed/four skipped. RED/repair failures, commands/exits, raw receipts and full suite logs are preserved in the scoped artifact.

Required exact-head `test (20)`, `test (22)`, `build`, `accuracy` CI and independent `spice-ts-review` must accept the same head before supervisor-only merge. This is not a release PR and changes no versions.
