# Issue #907: mesh allocation origins

Investigation only, measured on main `8873bdb142b64817ededb580ffd839f10ebaa5c8`.
No core, fixture, tolerance, aggregate, SOURCES or ROADMAP changes. PR #904 was
open and solver ownership was not released. There is no optimization before/after
or speedup claim.

## Result

The mesh CPU hotspot is real, but it is not the dominant allocation origin.
On the 50,176-node cold mesh, `applySupernode` accounts for 197.2 ms sampled
CPU self time (14.93%) and 19.86 MiB sampled allocations (2.10% of 943.89 MiB).
Parse/preprocess accounts for 63.74% of sampled allocation. The largest single
allocation stack is `simulate -> parseAsync -> preprocessDeck -> next ->
preprocessSteps -> braceBareParameters`, 217,952,304 estimated bytes, 6,642 samples.
Other leading leaves are `compile` (49,120,584), `collectStatements` (43,709,464),
`parseResistorElement` (31,348,336), and tokenizer `match` (25,785,888 bytes).
`summary.json` records top 20 complete allocation stacks per run, including frame
URL, line/column (zero-based V8 locations in the built bundle), self-size and count.

One separate warm-JIT control on the identical mesh is informative. It executes
one unprofiled `simulate` first, then profiles a second call. `applySupernode`
allocation falls to 0.125 MiB / 0.0138% of 908.04 MiB, while its CPU self time
remains 160.5 ms / 15.69%. Cold mesh 1k/10k/50k supernode estimates are
10.79/25.67/19.86 MiB, not proportional to circuit size. V8 traces show optimization,
a cold `Insufficient type feedback for generic named access` deopt at bytecode
offset 367, and reoptimization. Read-only inspection of
`packages/core/src/solver/gilbert-peierls.ts:735-881` shows reused typed workspaces
and a conditional `growUFactors`, not a per-update object constructor.

Inference: much of the cold supernode heap estimate is JIT-dependent transient
allocation, potentially boxed numeric values. This is NOT object-type proof,
a precise allocation-expression location, or evidence that a pool rewrite is safe.
The sampling stack identifies the function entry, not the allocating expression.
Typed-array backing stores are mostly external to the sampled JS heap, so these
estimates do not quantify all native allocations or explain RSS by themselves.

Dependency-held recommendation: after #904 merges AND the supervisor explicitly
releases solver ownership, reproduce cold/warm `applySupernode` CPU and allocation
with an isolated factor/solve regression. Investigate type feedback at the guarded
U-growth path before proposing any cold-allocation fix. Preserve arithmetic order,
pivot behavior and bit-identical regression results. The still-substantial warm
CPU self time is a better solver target than treating total GC as supernode
allocation. A separate parser/preprocessor card could investigate the measured
`braceBareParameters` stack, only after parser ownership clearance. Neither change
belongs in this investigation PR.

## Sources, budget and inherited comparison

The original MIT project-authored generator is `../../scaling-m2-fixture.mjs`.
Source URL/licence and all nine published hashes are already in
`../../../SOURCES.md`, "M2 generated scaling decks, issue #426". Both engines
receive identical generated deck bytes. No third-party source or new deck is added.

Reuse #906 at `3b0a8aeddbd8d9271a1f4b85320dcd8f10f5916b`, measured simulator
`604c523ecae247e97705da69c1ba883243188af8`. `reused/` contains its unchanged
63-row journal, summary, hosts, three compressed CPU profiles and failure/timeout
logs. Successful full stdout and original runner remain available at that pinned
GitHub commit. Archived commands contain their original worktree paths; they are
provenance, not runnable paths in this checkout. No full three-repeat matrix is
repeated here. The inherited cold-process wall medians/ranges and RSS are:

| Circuit | Nodes requested | TS wall median [min,max] ms | ngspice KLU wall ms | TS/ng RSS MiB |
|---|---:|---:|---:|---:|
| RC TRAN | 1k | 421.0 [408.2,432.4] | 72.1 [61.9,79.4] | 86.2/12.8 |
| RC TRAN | 10k | 1366.6 [906.8,1760.8] | 886.8 [394.7,927.8] | 178.6/34.5 |
| RC TRAN | 50k | 1575.8 [1557.4,2776.4] | 1601.4 [1321.8,1953.6] | 410.8/127.8 |
| Mesh OP | 1k | 109.0 [107.6,111.4] | 27.4 [26.8,31.3] | 82.6/13.8 |
| Mesh OP | 10k | 341.4 [340.5,344.0] | 146.5 [143.5,148.0] | 147.1/47.0 |
| Mesh OP retry | 50k | 1334.4 [1333.2,1405.4] | 1009.8 [988.7,1042.6] | 361.6/218.7 |
| CMOS TRAN | 1k | 448.4 [317.0,482.2] | 206.5 [199.0,237.5] | 121.8/18.9 |
| CMOS TRAN | 10k | 4311.5 [2833.4,4997.3] | 5461.4 [4639.8,7941.3] | 341.6/103.1 |
| CMOS TRAN | 50k | 22579.4 [22242.6,22785.3] | 3/3 timeout at 45001-45003 | 1045.4/unavailable |

Losses remain RC 1k/10k, mesh all sizes, CMOS1k. RC50k is unresolved under noise;
CMOS10k ranges overlap. CMOS50k timeout is not a speedup ratio. Three initial mesh50k
ENOBUFS harness failures and all three CMOS50k ngspice timeouts remain in the
inherited journal and selected logs, not hidden. The mesh retry changed only the
output-buffer bound, never deck or solver settings.

New budget is 18 processes: nine cold TS allocation/CPU samples, eight ngspice
binary-raw references, one TS warm-JIT mesh control. Every new child succeeded.
The warm process also includes its one unprofiled warmup. CMOS50k ngspice is not
rerun because all three inherited 45 s timeouts already bound that control.
The process limit remains 45 s and captured stdout limit 128 MiB. Heavy runs use
`spice-heavy`; no unrelated worker is terminated. No repeated timing median or
uncertainty interval is asserted for the new single samples.

## New profiled controls and precision checks

These are single samples with instrumentation, NOT optimization A/B timings.
`simulate` includes parse/compile/analysis. Ngspice raw-output timings are retained
in `samples.jsonl`/`references/` but not mixed into the inherited comparable walls.
`-r` changes output mode, not netlist bytes, solver options or convergence settings.
The eight references use little-endian binary IEEE-754 doubles. Full raw files are
not committed: extracted unrounded probe grids/values, complete raw SHA256/byte
counts, argv, stdout and resource receipts are retained. Precision means one
published probe at every matched point, not every internal node or branch.

| Circuit | Requested size | TS simulate ms | TS peak RSS MiB | Sampled allocation MiB | Supernode allocation MiB | Probe max / RMS abs V |
|---|---:|---:|---:|---:|---:|---:|
| Mesh OP | 1k | 73.4 | 89.0 | 42.65 | 10.79 | 5.9647e-14 / same |
| Mesh OP | 10k | 331.3 | 152.4 | 253.80 | 25.67 | 4.6874e-13 / same |
| Mesh OP | 50k | 1310.0 | 353.0 | 943.89 | 19.86 | 1.8839e-12 / same |
| RC TRAN | 1k | 108.7 | 92.2 | 79.20 | 0 sampled | 7.7716e-16 / 3.6796e-16 |
| RC TRAN | 10k | 572.8 | 181.8 | 362.83 | 0 sampled | 7.7716e-16 / 3.6796e-16 |
| RC TRAN | 50k | 1872.1 | 394.1 | 1328.37 | 0 sampled | 7.7716e-16 / 3.6796e-16 |
| CMOS TRAN | 1k | 410.6 | 130.0 | 283.27 | 0 sampled | 3.9369e-4 / 4.2181e-5 |
| CMOS TRAN | 10k | 2913.3 | 359.5 | 1899.73 | 0 sampled | 3.9369e-4 / 4.2181e-5 |
| CMOS TRAN | 50k | 27203.4 | 1344.4 | 19913.30 | 0 sampled | unavailable, inherited timeout |
| Mesh OP warm control | 50k | 961.7 | 556.7 | 908.04 | 0.125 | 1.8839e-12 / same |

All ten TS grids/probe vectors exactly equal the archived #906 JSON double values,
including CMOS50k. Mesh actual node counts are 1024/10000/50176. RC has 120 points,
CMOS 214, mesh 1. RC maximum matched time-grid delta is 6.6174e-24 s; CMOS/mesh
are zero. Peak-relative max/RMS errors are 2.2567e-15/1.0685e-15 for RC,
3.2748e-13/3.2534e-12/1.5011e-11 for the three mesh sizes (OP RMS equals max),
and 1.1247e-3/1.2050e-4 for CMOS1k/10k. CMOS discrepancy persists above printing
noise. No fixture/tolerance adjustment or parity claim for CMOS50k is made.

Control CPU hotspots agree with the prior profiles. RC50k measured self frames
are GC225.5 ms, capacitor `evaluate`136.1,
`buildCompanionSystem`124.4 and `attemptStep`117.4. CMOS50k has `batchStamp`
11275.7 ms, GC2685.2, `refactorWithPivots`1780.9, `mos1BulkJunctions`1302.6,
`convergenceTest`1248.2. RC/CMOS have zero sampled supernode allocations, not a
proof that every execution path is allocation-free.

## Startup, JIT, GC and memory boundaries

Inspector allocation sampling uses a fixed 32768-byte interval with both
`includeObjectsCollectedByMajorGC` and `includeObjectsCollectedByMinorGC` enabled.
`sample.size` is a statistical allocation estimate, not an exact byte census or
retained heap size. Summation uses all samples by nodeId (including collected
objects); tree `selfSize` is retained separately because V8 rounding/accounting
makes it slightly different. The profile begins after core import/deck read, just
before CPU-profiler startup; it ends after simulate and CPU-profiler stop. The
small inspector setup/stop allocation boundary is exposed, not subtracted.

CPU sampling includes Profiler.start/stop callback overhead. For example, the
warm mesh profile totals 1023.0 ms while simulate is 961.7 ms; `post` contributes
61.3 ms. Never add self-time from separate profiles or equate CPU GC samples with
GC pause totals. Files are losslessly gzipped standard inspector CPU and sampling
heap profiles. Decompress before loading into DevTools.

Worker entry, core import, simulate start/end memory/time markers are retained in
`profiles/*.result.json` and `summary.json`. On cold mesh50k worker entry is
27.6 ms process-relative, core import finishes at 54.2 ms (26.7 ms import delta),
simulate spans 67.1-1377.1 ms. RSS rises from 42.1 MiB entry to 66.7 at simulate
start and 352.9 at end. End heapUsed is 121.7 MiB and arrayBuffers102.8 MiB.
Warm mesh starts its measured simulate at 1045.2 ms after a separate unprofiled
warmup, with old allocations still affecting RSS. Its 556.7 MiB peak includes both
calls and profile output, so it cannot be compared as a memory improvement.

V8 stdout retains `--trace-gc --trace-opt --trace-deopt`. GC process-relative
integer timestamps are classified against the phase markers (about 1 ms boundary
resolution). Cold mesh50k has 3 pre-simulate events/2.42 ms pauses, 69 simulate
GC events/166.99 ms pauses and one profile-output event/6.58 ms pause. The warm
summary's `startup` bucket includes the warmup and inspector setup; measured
simulate has 64 events/119.98 ms. Pauses are trace-reported synchronous durations,
not total concurrent GC cost. Optimization/deoptimization counts cover the whole
process (including warmup), not precisely timestamped per-phase JIT intervals;
trace compilation durations are not additive with simulate wall time.

Host is Apple M5 Pro, 48 GiB RAM, Node v22.23.1, ngspice47/KLU, Darwin27 arm64.
`host.json`, `warm-host.json` and inherited hosts expose dates, revisions and shared
load. Load at the new cold run was 8.90/11.34/11.83. Shared-host variability,
profiling overhead, GC schedule and JIT all prevent causal speedup claims between
these runs and #906. The source revision differs; unchanged probes do not prove
identical timing behavior. No "after optimization" column exists.

## Reproduce and verify

Run from repository root. The two `spice-heavy node` commands rerun the bounded experiments;
they overwrite this card's new receipts, never the inherited ones.

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
spice-heavy node benchmarks/performance/results/issue-907/run.mjs
spice-heavy node benchmarks/performance/results/issue-907/run.mjs --warm-mesh
node benchmarks/performance/results/issue-907/summarize.mjs
node --test benchmarks/performance/results/issue-907/check.test.mjs
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
spice-heavy pnpm test
spice-heavy pnpm bench:accuracy
```

Summary validation needs no simulator/decks and verifies 18 new receipts, 63
inherited receipts, ten heap/CPU pairs, hashes, exact unchanged TS probe values,
eight full-precision matched reference grids and errors. `check.test.mjs` has four
parser/metric tests, including truncated/extra payload, nonfinite data and mismatch
rejection. The precision checks do not impose a new waveform tolerance.

Executed receipts: install/build/lint exit0; both heavy experiment commands exit0;
summary exit0; four local metric tests and six existing fixture tests pass.
Guarded full monorepo test exits0 (core3435 pass/2 skipped, final benchmark TAP141
pass/4 skipped; other package counts retained in `full-test.log`). Guarded accuracy
exits0; output is `accuracy.log`. `verification.txt` has per-case measurements.
Required exact-head test(20), test(22), build, accuracy and independent review remain
merge gates, recorded with PR/full head SHA in Kanban rather than guessed here.
