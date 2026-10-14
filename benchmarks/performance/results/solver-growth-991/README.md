# Numeric LU buffer-growth experiment, issue #991

## Decision

Reject the candidate. No production optimization is shipped. Refs #991, which
remains open. This report uses the card's explicit published-rejection outcome.

The previous ten-round attribution from PR #997 identifies different individual
hotspots: RC10k load/stamp is 54.749 ms and Mesh10k numeric factorization is
57.756 ms. To select ONE shared bucket without circuit-specific tuning, sum the
published medians for the two equally weighted 10k decks. Numeric LU is the
largest combined permitted bucket at 79.573 ms, ahead of load/stamp 65.116 ms,
compile 56.677 ms, ordering 54.122 ms, matrix build 28.350 ms, output
materialization 20.967 ms and solve 16.676 ms. These sums are selection evidence,
not a newly measured combined distribution. Parser work is excluded.

The candidate changes only the geometric growth of the L/U factor buffers from
2x to 4x. The hypothesis is that fewer allocations and copies during cold
fill-in reduce numeric LU time. Initial capacity, ordering, pivot decisions,
arithmetic order, model settings and tolerances are unchanged. It is one
unconditional policy for all matrices, not a mesh branch or content cache.
The exact two-line source patch is retained in `candidate.patch`. The experiment
applies the equivalent two replacements only to benchmark copies of built JS,
checks exactly one occurrence of each and instruments both copies identically.

The actual growth cost is too small to justify the change. Mesh10k growth calls
fall from seven to four in every round, and growth self time falls from
0.542 / 0.063 to 0.357 / 0.112 ms (median / IQR), but the full factor bucket
falls only 6.157%. Its quartile intervals overlap. RC10k still makes two growth
calls and factor time worsens 5.352%. The required >=10% reduction with
non-overlapping IQRs on both 10k decks fails. The source patch was exercised
against the solver's frozen bit-identity oracle and reverted before publication.

## Before / candidate / ngspice-47

Ten serial cold samples per engine/deck cell. All times are milliseconds,
median / IQR with linear interpolation. No warmup, trimming, retry or selective
round exclusion. Negative factor cut means the candidate is slower.

| Deck | Before factor | Candidate factor | Factor cut | Before cold wall | Candidate cold wall | Direct native wall | Before/native | Candidate/native |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| RC1k | 3.872 / 0.728 | 3.893 / 0.508 | -0.527% | 185.748 / 52.234 | 160.403 / 32.782 | 37.290 / 3.750 | 4.981x | 4.301x |
| Mesh1k | 11.369 / 1.261 | 11.052 / 1.524 | 2.791% | 143.174 / 14.097 | 163.058 / 49.251 | 24.220 / 3.467 | 5.911x | 6.732x |
| CMOS1k | 23.117 / 2.696 | 23.255 / 2.299 | -0.597% | 418.707 / 61.443 | 401.769 / 52.943 | 220.019 / 28.845 | 1.903x | 1.826x |
| RC10k | 22.926 / 2.932 | 24.153 / 4.171 | -5.352% | 508.286 / 68.699 | 500.577 / 73.888 | 229.737 / 36.250 | 2.212x | 2.179x |
| Mesh10k | 63.671 / 2.304 | 59.751 / 8.101 | 6.157% | 352.503 / 71.686 | 363.407 / 77.730 | 108.387 / 4.753 | 3.252x | 3.353x |
| CMOS10k | 261.541 / 105.451 | 273.102 / 32.648 | -4.420% | 2646.823 / 920.474 | 2782.452 / 231.527 | 4326.838 / 891.523 | 0.612x | 0.643x |
| RC50k | 72.600 / 25.570 | 75.554 / 9.650 | -4.069% | 1649.107 / 585.935 | 1714.832 / 278.589 | 1372.269 / 240.227 | 1.202x | 1.250x |
| Mesh50k | 372.538 / 61.466 | 355.730 / 76.898 | 4.512% | 1184.774 / 130.552 | 1173.058 / 351.248 | 709.646 / 81.877 | 1.670x | 1.653x |
| CMOS50k | 2594.533 / 439.756 | 2794.788 / 391.403 | -7.718% | 22243.778 / 2934.076 | 23019.799 / 2391.800 | 63631.183 / 1169.573 | 0.350x | 0.362x |

Factor Q1..Q3 is 21.127..24.058 before and 21.335..25.506 candidate for
RC10k; 62.411..64.715 before and 54.547..62.648 candidate for Mesh10k.
Both pairs overlap. `matrix/table.md` also publishes every growth distribution
and factor quartile. `matrix/verification.json` contains every phase distribution,
including Q1/Q3, minima and maxima, and the machine-evaluated failed gate.

The apparent cold-wall wins at RC1k, CMOS1k, RC10k and Mesh50k are retained.
The candidate loses cold wall at Mesh1k, Mesh10k, CMOS10k, RC50k and CMOS50k.
These are observed medians on a shared host, not statistically established wall
speedups. RC and mesh still lose to ngspice at every size. CMOS10k/50k have
shorter measured wall than native, but the previously published CMOS accuracy
gap remains unresolved; this report does not claim correctness-backed
superiority over ngspice.

## Measurement boundaries and correctness

Both TypeScript copies are instrumented cold processes. Numeric LU time is the
elapsed `GilbertPeierlsSolver.factorize` bucket including nested growth time.
The timer records exclusive self time, so growth is added back exactly once.
This includes identical-input checks and reused-pivot factorization calls.
Growth time and call counts are diagnostics inside that bucket, not an additional
phase to add to simulate. These timings are NOT uninstrumented production wall
measurements. Identical instrumentation makes the comparison controlled, but no
instrumentation-overhead bound is claimed.

TypeScript cold parent wall includes Node spawn/import, deck read, parse,
compile/simulate, complete-output hashing, receipt emission, exit and reap.
Native wall is direct ngspice execution with `-b -r`, KLU and complete binary
raw output; it excludes its Node wrapper. The native wrapper wall and ngspice
acct fields are separately retained in every receipt. The output paths differ,
so the table is not a pure numerical-kernel comparison. Raw compression and
archive work are outside each child's wall but inside the overall run budget.

All nine byte-hashed decks are identical across engines and match #961/#997's
MIT generators. Every TypeScript DC/transient voltage/current vector, its name
and the time vector is hashed as little-endian IEEE-754 values. Each deck has
one stable hash across all twenty before/candidate samples. RC10k and Mesh10k
also retain the historical full hashes from #997/#1005:

- RC10k `cfed768fddaa3d8f6f44396c0b98d1e1101231083774afcf4f993b888a787ede`
- Mesh10k `7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f`

Every native numeric payload is stable across its ten samples. Native dates
change, so the archive stores each original header plus one gzip payload per
numeric hash. The verifier reconstructs all ninety full raw files, checks their
full SHA256 and checks payload hash/length against the worker receipts. Native
and TypeScript hashes are not cross-engine accuracy equality. Bit-identical
before/candidate output and unchanged tolerances establish no correctness
change from this candidate, not a new all-node parity claim.

Source and licence are already recorded under "M2 generated scaling decks,
issue #426" in `benchmarks/SOURCES.md`. No external source or model is added.
The fixtures are project-authored MIT material; generated deck files remain
ignored and are regenerated for offline verification.

## Bounds, host and provenance

Baseline source `43aefef1a1105696cdce74acbfd3144e5cff3b7d` was fetched and
fast-forwarded before frozen install/build. `matrix/prepared.json` pins original
bundle hashes, both clocked copies, producer source hashes, deck hashes and exact
node counts. A final rebuild matches every original bundle hash. The producer
source hashes also match the published files. Core production files, including
reserved parser files and `packages/core/src/circuit.ts`, are unchanged.

Machine Mac17,8, 51,539,607,552 RAM bytes, macOS 27.0.1 / Darwin arm64,
Node v22.23.1, pnpm 10.28.1, ngspice-47 with KLU. `matrix/host.json` retains
version strings and uname. Observed load-average components ranged from
4.1708984375 to 13.29150390625. This is shared-host load, not measured CPU
utilization or isolated-machine certification. Resource diagnostics retain
per-child peak RSS in KiB in the journal; `matrix/resources.json` derives
median/IQR RSS and raw growth-call counts from those fields.

The fixed matrix completed 270/270 Node children and 90/90 native children in
1366.226876 seconds, including journal fsync, raw compression and gaps.
Longest child 79.118667 seconds. All owned process groups were gone after reap.
`matrix/ownership.jsonl` records PID/argv before waiting; `matrix/budget.json`
certifies the complete plan. No overshoot was clipped or repaired.

The run uses #951's unmodified suspend-inclusive clock, cross-checks, budget and
Node-lifetime checks. Limits are explicitly expanded uniformly to 120 seconds
per child and 1800 seconds overall for the 270-cell nonlinear matrix. The prior
#958 matrix already measured CMOS50k native at 58 seconds, so the old linear
30-second limit cannot produce the requested nonlinear timings. Every circuit
and engine gets the same limits. There is no circuit-specific timeout. The
parent reserves 250 ms for kill/reap, refuses a launch without full headroom,
fsyncs an immutable journal and censors remaining cells after any failure.
Suspension was not induced. Both preparation and execution run under
`spice-heavy`; time waiting for a heavy slot is not benchmark time.

## Reproduce and verify

From this PR's repository root (production source is unchanged from the pinned
baseline):

```sh
pnpm install --frozen-lockfile
pnpm build
spice-heavy python3 benchmarks/performance/solver-growth-991.py <fresh-output-path>
node benchmarks/performance/solver-growth-991-verify.mjs <fresh-output-path>
```

Do not apply `candidate.patch` for that command: the preparer derives both
copies from the unchanged baseline build and applies the candidate in its
benchmark copy. An existing preparation/journal is immutable and refuses reuse.
The public compressed bundles can also be verified without rerunning simulations:

```sh
node benchmarks/performance/solver-growth-991-verify.mjs benchmarks/performance/results/solver-growth-991/matrix
node --test benchmarks/performance/solver-growth-991.test.mjs benchmarks/performance/linear-10k.test.mjs benchmarks/performance/parse-1000.test.mjs
python3 benchmarks/performance/solver-growth-991-test.py
pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts src/solver/gilbert-peierls-equivalence.test.ts src/solver/gilbert-peierls-reuse.test.ts
pnpm build
pnpm lint
```

The source patch was separately applied temporarily for the targeted Vitest run,
which passed all 47 solver tests, including bit-identical factors/solutions,
exact cancellation, moving pivots and pivot reuse against the frozen kernel.
The unchanged final production source passes the same 47 tests. Offline control
checks pass all three tests. Receipt checks first failed RED with the missing
verifier module, then passed GREEN, and fail closed on missing cells, duplicate
or non-interleaved rounds, output/deck drift, failed native execution, missing or
negative phases, clock corruption and unreaped groups. They also check the real
published matrix and require the failed rejection gate.

All 36 Node receipt checks pass. `validation.json` records scalar local-command
receipts instead of publishing command logs. `SHA256SUMS` covers the published
report and structured/binary evidence (check from the repository root with
`shasum -a 256 -c benchmarks/performance/results/solver-growth-991/SHA256SUMS`).

Frozen install, build and lint exit 0. Local testing is targeted only, as this
card requires. The root full test suite was intentionally not run. Required
exact-head GitHub `test (20)`, `test (22)`, `build` and `accuracy` checks are the
full gate and are recorded in the PR/card handoff after publication. No merge,
npm publication, release/tag operation or release-PR change is performed here.
