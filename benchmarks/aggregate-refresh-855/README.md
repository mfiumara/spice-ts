# Nightly aggregate refresh #855

This lane refreshes the existing five-corpus aggregate, not all collected corpora.
The frozen current-main base is d3901ec1355519e582dc068b4dec5cc033e22de8.
The fixtures and both engines' input bytes remain unchanged. No tolerance or
reference value is adjusted by hand.

The old committed report was last updated in #603. Its own ledger says that
measurement used #584's main tree e58322e, not the eventual #603 merge tree.
The #623 LTRAaccept and #616 numparam merges landed in between. A replay of the
#603 merge tree differs from the stored report on two LTRA fixtures. Therefore
the attribution replay starts at #613, includes those concurrent merges, and
checks the measured #584 baseline separately. Historical ledger text is retained;
new status transitions are relative to the last committed #603 artifact.

## Reproduce

Build the workspace first. The adapter loads packages/core/dist/index.js.

    pnpm install --frozen-lockfile
    pnpm build
    spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts
    spice-heavy python3 benchmarks/aggregate-refresh-855/replay.py
    python3 benchmarks/aggregate-refresh-855/summarize.py
    python3 benchmarks/aggregate-refresh-855/verify.py
    spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
    pnpm exec tsx --test benchmarks/aggregate-report.test.ts benchmarks/fine-reference.test.ts

The replay extracts git archives inside this worktree's ignored node_modules
cache. It does not change branches, touch other worktrees or rebuild the primary
checkout. Production-source-identical commits, such as test-only pins, are
coalesced. The endpoint is replayed explicitly. esbuild bundles each historical
core without minification. The current adapter and identical ngspice references
are fixed across the replay, so adjacent comparisons isolate core commits.
The endpoint must reproduce every generated status, convergence, analysis
receipt and primary/linear comparison metric exactly before summarization passes.

The replay is resumable by commit. It appends each full 100-fixture receipt to
node_modules/.cache/aggregate-refresh-855/replay.jsonl. The schedule records all
replayed source revisions. summarize.py requires every scheduled revision and
attributes each changed scalar field to the adjacent merged PR, preserving
rounding-only changes and losses as well as wins. No inference-only causal claim
is used for a measured transition.

The #592 fine-reference column is diagnostic and changes no status/envelope.
It is computed only by full report generation, not by historical core replay.
The report's fixed diagnostic step budget excludes jimi-fuzz because its finer
reference would require 2,400,004 steps, above the 1,000,000-step limit.

Runtime sums are single loaded-host samples. They support no speed claim.
The aggregate has engine success/failed/unsupported statuses, not a matched or
mismatch classification. Added comparable rows are not automatically parity wins.

## Measured result

The replay completed 133 scheduled revisions of 100 fixtures. The explicit final
endpoint repeats the final production tree as a cross-check against the real
generated report. It reproduces every engine/status/convergence/analysis receipt
and comparison metric exactly. The measured #584 baseline also reproduces the
stored #603 artifact exactly. No unexplained harness drift remains.

The ledger contains 272 adjacent-revision fixture transitions attributed to
26 merged PRs. The final report differs on 57 fixtures. ledger.json.gz retains
every changed scalar field with before/after values; replay.jsonl.gz retains
all full comparison receipts. summary.json indexes the schedule and final
fixture-to-PR attribution. verify.py passes three completeness/tamper tests.

| Headline | Previous artifact | Fresh main |
|---|---:|---:|
| Fixtures | 100 | 100 |
| ngspice success/failed/unsupported | 52/9/39 | 52/9/39 |
| spice-ts success/failed/unsupported | 61/1/38 | 68/1/31 |
| Comparable fixtures | 48 | 52 |
| Comparable analyses | 67 | 71 |
| Worst absolute max envelope | 7853.15771484375 | 7018.333251953125 |
| Worst relative max envelope | 975815.5539797375 | 436128.09132992564 |
| Worst relative RMS envelope (loss) | 203361.3440880642 | 243438.5559477603 |

Fine reference is present on 26 rows: 25 compared, one unavailable under the
fixed step budget, and 74 rows without a compared transient. The seven engine
status gains are attributed to #658 (two MOS2 amplifier rows), #667 (BSIM1/2
sweeps), #724 (NEWLTE and zener Xyce decks), and #745 (mutual-inductance ordering).
Only four of those rows gain an ngspice comparison; success does not establish
parity. All 31 unsupported spice-ts rows and the failed row remain published.
