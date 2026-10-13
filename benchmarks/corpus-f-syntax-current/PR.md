## What and why

Fixes #923.

Reconcile all 59 fixtures mechanically selected from the frozen corpus-f historical `parse: other unsupported syntax` bucket. All changes are confined to `benchmarks/corpus-f-syntax-current/`. No core/parser/device code, fixture, tolerance, shared manifest/outcomes/SOURCES, aggregate, ROADMAP or CI changes.

Frozen simulator/main SHA: `f0446a68f317b9fd558d1a14b540a0e4f1063e18`. Historical receipt and manifest loaded via `git show` at that SHA; every fixture byte hash and source licence hash verified. Per-fixture identities, BSD licences, historical reference evidence and current native errors are retained.

## Evidence

- Historical native unsupported: 59/59; historical ngspice success: 54/59. Historical reference status is NOT fresh parity evidence.
- Current parse: 15 success, 44 unsupported. Native simulation after successful parse: 1 success, 14 unsupported, 44 not-run. All 59 fixtures accounted for; zero timeouts/incomplete budget rows.
- Current native outcomes: 58 losses, 1 not-compared. `examples/probe/cntrl-sources.cir` now runs 2514 transient points / 12 signals.
- Fresh ngspice reference runs: zero. No fresh match/mismatch claim; every comparison metric is null.
- One child at a time; 8 s parse / 12 s simulation caps, 512 MiB heap, 2 MiB output, fixed 600 s total budget. Measured final probe time: 25.045125 s, not a speed comparison.
- Ranked first blockers: XSPICE coverage 38 fixtures (36 historical reference successes), control execution 4/4, VBIC 4/4. All-state issues and merged PR inventories checked before recommendations; existing #553/#526/#5/#559 coverage and closed slices linked rather than reopened.

README, receipt.json, summary.json and verification.json contain complete evidence. Independent existing analytic accuracy-control results are explicitly not corpus-f reference comparisons.

## How to test

```
pnpm install --frozen-lockfile
pnpm build && pnpm lint
node --test benchmarks/corpus-f-syntax-current/reconcile.test.mjs
node benchmarks/corpus-f-syntax-current/reconcile.mjs --check
spice-heavy node benchmarks/corpus-f-syntax-current/reconcile.mjs
node benchmarks/corpus-f-syntax-current/summarize.mjs
spice-heavy pnpm test
```

Executed locally: install/build/lint/diagnosis/check/targeted tests/full tests/accuracy all exit 0. RED initially exit 1 for the absent runner. GREEN has 10/10 targeted tests. Full root suite via spice-heavy: 4036 tests, 6 skipped, 0 failed. Local `spice-heavy pnpm bench:accuracy` exit 0; generated shared output restored, control output retained only in owned directory.

Tests enforce selection completeness, duplicates/hash identity, historical-only provenance, null metrics, no invented matches/mismatches, missing/reordered rows, hidden failures, real child kill timeout, bounded total-budget caps and malformed child transport. Root test discovery remains unchanged.

Exact-head required test (20), test (22), build and accuracy CI will be checked before implementation completion. A separate spice-ts-review child will review the exact final SHA. Supervisor alone merges; no release PR, npm, tag or deploy action.
