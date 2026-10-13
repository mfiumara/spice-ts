# Issue #919: isolate warm supernode CPU cost

Investigation only. Production solver, public API, parser, devices, fixtures,
thresholds, SOURCES, aggregate, ROADMAP and CI are unchanged. No simulator bug
was found and no RED/GREEN bug-fix claim is made. No optimization was proven;
there is no implementation speedup claim or "after optimization" column.

## What this adds

Capture the first actual mesh CSC matrix and RHS from the identical published
MIT scaling deck. Replay numeric full factorization and solve in a fresh process,
with analyzePattern outside the timed/profiled interval. A fresh solver is used
for both cold and warm passes, preserving initial factor capacity and forcing
one full factorization, zero pivot-reuse factorizations, and no identical-input
skip. The warm pass follows one cold factor/solve on the same matrix in-process.
This is a warm-JIT experiment, not a warm-capacity or retained-factor benchmark.
All complete solution vectors are checked by SHA256 over IEEE-754 bytes against
the captured production solve. Captures use V8 serialization, lossless gzip.

End-to-end controls use the normal built core, not the investigation bundle.
Each fresh child runs one cold simulate and then one warm simulate. Circuit/size
order is reversed every other round. Three repeats cover RC TRAN, mesh OP and
CMOS TRAN at requested 1k/10k/50k. Mesh actual sizes are 1024/10000/50176.
No tolerance, device setting, deck byte or arithmetic order is changed.

The investigation bundle exposes the same internal class simulate uses without
editing its production exports. Build it with the command below. It is ignored,
not a shipped artifact. Profiles sample numeric factor plus solve only. CPU
inspector start/stop self-time is visible in profiles but excluded from the
performance.now factor/solve intervals. GC, JIT and profiling overhead are not
subtracted. Small 1k profiles have too few samples to resolve kernel self-time;
zero samples do not mean zero work. There is no object-type/boxing proof.

## JIT and U growth

Three extra phase-tagged bytecode traces distinguish measurement from a separate
U-growth diagnostic. At 10k/50k the cold applySupernode deopt is
`Insufficient type feedback for generic named access` at bytecode offset 367.
The printed bytecode maps offsets 357/363 to this.uValues/length, offset 367 to
the capacity equality test, and offsets 372/385 to growUFactors lookup/call.
This locates the guard/cold branch region, not an allocating expression.
No applySupernode deopt occurs in the phase-tagged warm interval.

The growth diagnostic monkey-patches growUFactors on a separate solver after
both measurements. Its extra own property changes receiver shape and call
identity. The later `wrong map` at offset 0 and `wrong call target` at offset 380
are diagnostic artifacts, NOT evidence of a production warm-path defect.
Original untagged traces contain those events too; never count them as warm
simulation deopts. The tagged follow-up exists to expose this boundary.

Each fresh mesh factor needs real U growth. Capacities, actual used entries,
growth counts, numeric factor counts, supernode updates and full-vector hashes
are in summary.json and the journal. Initial buffers reflect structural estimates,
not predicted numeric fill. Retaining larger capacity would change this isolated
experiment and cannot explain away the substantial measured warm kernel cost.

## Measured final isolation

Final epoch, three samples each. Units ms except process peak RSS in MiB.
Medians [min,max] include every measured sample, not a best run.

| Requested mesh | Phase | Full factor | Solve | applySupernode CPU self | Peak RSS |
|---:|---|---:|---:|---:|---:|
| 1k | cold | 12.925 [11.947,14.718] | 1.144 [0.958,1.167] | 6.792 [1.041,7.750] | 77.250 [77.016,77.609] |
| 1k | warm | 2.360 [2.316,2.652] | 0.890 [0.859,1.103] | 0 [0,2.000], under-resolved | 77.812 [77.656,78.438] |
| 10k | cold | 73.623 [70.212,79.350] | 4.439 [4.316,4.495] | 16.542 [16.124,20.251] | 101.453 [101.406,101.891] |
| 10k | warm | 29.778 [29.750,29.925] | 0.944 [0.887,1.170] | 16.792 [15.249,17.125] | 117.391 [117.219,117.766] |
| 50k | cold | 338.406 [336.014,350.181] | 8.539 [8.326,8.787] | 201.039 [158.291,201.125] | 243.344 [242.844,244.500] |
| 50k | warm | 288.124 [281.448,312.561] | 7.610 [7.460,10.308] | 156.500 [150.749,186.708] | 265.016 [264.844,265.562] |

Preliminary mesh50k medians were factor309.813 cold/252.874 warm and supernode
self146.417 cold/155.583 warm. Final factor times are higher, not an improvement.
The two epochs differ in instrumentation markers, process wrapper and shared
load, but not the production kernel. Both retain a substantial warm CPU hotspot.
Profiler self estimates and factor wall intervals have different boundaries;
do not subtract one from another or add self-time across profiles.

U diagnostic initial -> final capacity / used / growth calls are
3010 -> 24080 /12057 /3 for 1k,
29802 -> 238416 /203494 /3 for 10k, and
150082 -> 2401312 /1519509 /4 for 50k.
L+U stored nonzeros are 23088/396986/2988840 and supernode updates
1231/16101/89122. Cold/warm counts agree, as do complete solution hashes.

## Measured final end-to-end controls

Three completed samples per phase except CMOS50k warm, which completes 2/3.
Simulate-only ms median [min,max]. Peak RSS columns are process-peak medians;
full RSS ranges and phase memory snapshots remain in summary.json/samples.jsonl.

| Deck | Requested | Cold simulate ms | Warm simulate ms | Cold/warm peak RSS MiB |
|---|---:|---:|---:|---:|
| RC TRAN | 1k | 81.358 [78.494,93.659] | 57.789 [54.586,62.854] | 87.297/105.328 |
| RC TRAN | 10k | 400.849 [391.513,403.925] | 305.422 [282.307,318.291] | 176.094/251.062 |
| RC TRAN | 50k | 1458.359 [1349.343,1572.149] | 1380.679 [1240.759,1431.651] | 410.078/613.891 |
| Mesh OP | 1k | 56.639 [50.302,57.233] | 25.936 [24.013,26.367] | 84.156/87.125 |
| Mesh OP | 10k | 275.707 [260.586,279.648] | 179.472 [178.065,181.570] | 146.578/194.812 |
| Mesh OP | 50k | 1004.773 [989.845,1166.665] | 924.485 [907.803,1068.073] | 360.078/568.500 |
| CMOS TRAN | 1k | 311.063 [296.041,378.339] | 228.891 [203.894,253.300] | 122.234/143.484 |
| CMOS TRAN | 10k | 2728.081 [2233.122,2761.089] | 2208.178 [1900.132,2467.236] | 340.578/449.156 |
| CMOS TRAN | 50k | 24491.786 [22139.415,34274.025] | 20761.593 [19911.071,21612.115], 2/3 only | 1078.062/1732.625, 2/3 warm only |

The final 39-child epoch has 38 successes and one combined cold+warm deadline
timeout. The preliminary epoch had 37 successes and two timeouts. The timeout
does not erase the completed cold phase, and partial warm work is not timed as
a successful simulate. All completed grids/probes exactly equal #907 doubles.
Final+preliminary+tagged traces consumed 360.222 seconds of child wall across
81 child processes, within the declared 900-second experiment budget.

## Decision and exact next step

Do not rewrite pools or change arithmetic based on these receipts. Warm mesh CPU
cost survives removal of parse/compile/AMD from the measured interval and is
mostly in applySupernode, not solve. Cold U-growth type feedback is a separate
startup effect; eliminating its one observed deopt is not proven to reduce the
warm arithmetic cost.

Next scoped experiment: compare a local U-row/value alias in applySupernode's
triangular section, refreshed immediately after growUFactors, against this
unchanged baseline. First check growth-forcing and cancellation/pivot/singular
regressions, complete L/U patterns and bit-identical solution vectors; then run
bounded interleaved identical-deck cold/warm A/B, including all RC/CMOS controls.
Reject it if improvement is not reproducible or only shifts JIT/GC/RSS cost.
Do not pre-size by circuit or change summation order. This is a candidate,
not a recommendation to ship unmeasured code.

## Sources, references and losses

Generator: ../../scaling-m2-fixture.mjs. Original project-authored MIT material,
source URL/licence and nine pinned hashes already recorded in
../../../SOURCES.md under "M2 generated scaling decks, issue #426".
No new source/netlist is added. All deck hashes are checked again here.

Full-precision ngspice references are reused unchanged from ../issue-907/references
and completed TS probe/grid vectors from ../issue-907/profiles. They were measured
at 8873bdb142b64817ededb580ffd839f10ebaa5c8, published in merged PR #913
(6d07f22d). These are precision controls, NOT contemporaneous ngspice timings.
The validator checks every completed current grid/vector exactly against those
TS doubles and recomputes errors against all eight binary-precision references.
CMOS50k has no reference: all three inherited ngspice children timed out at 45s.
No new ngspice batch was run, and no CMOS50k speedup/parity ratio is asserted.

The inherited #906 cold-process comparisons remain losses for RC1k/10k,
mesh all sizes and CMOS1k; RC50k is unresolved under noise and CMOS10k ranges
overlap. Its mesh50k three initial ENOBUFS harness failures and retries remain
in ../issue-907/reused/samples.jsonl; its three CMOS50k ngspice timeouts remain
visible there. ../issue-907/README.md contains the complete inherited median,
range and RSS comparison table. Do not compare those process-wall numbers to
this card's simulate-only or isolated numeric timings.

RC max/RMS absolute probe error remains 7.7716e-16/3.6796e-16 V. Mesh OP max
absolute errors remain 5.9647e-14, 4.6874e-13 and 1.8839e-12 V. CMOS1k/10k
max/RMS errors remain 3.9369e-4/4.2181e-5 V (peak-relative max 1.1247e-3).
The CMOS discrepancy is still above printing noise, not fixed by this work.
Only the published probe is compared at every matched timepoint in controls;
only isolated mesh first-OP replay checks the entire solved vector.

## Budget and reproducibility

The preliminary epoch used 39 child processes (27 controls, 3 captures, 9
isolated profiles). Its complete host/journal/log/profile/capture set is preserved
in preliminary-39.tar.gz. It used /usr/bin/time -l around Node. Two CMOS50k
children retained cold results but exhausted the combined cold+warm 45s deadline.
Those warm samples are censored, not zero or a success. No child from this card
remained running when that epoch finished.

The final runner kills Node directly, not an outer time wrapper, at 45s.
The final validation epoch repeats the same 39-child matrix. The three tagged
trace children use direct Node too. Combined experiment budget is 81 processes
and 900s of child-wall scheduling, not a new corpus run. The preliminary epoch
and final epoch are harness validation controls on identical production code,
not an optimization A/B. Preliminary measurement results remain accessible even
if host load or the timeout outcomes change in the final epoch.

Memory samples include RSS/heap/external/arrayBuffers and process maxRSS.
Warm process peaks include both calls and retained allocations, so higher warm
RSS is a real disclosed cost, not an independent fresh-process memory measure.
Partial timeout children preserve completed samples; their recorded RSS is a
lower bound after the last completed phase. Do not report a censored warm median
as a three-repeat statistic. host.json records exact source revision, Node,
ngspice version, Apple CPU, RAM, OS, date and shared-host load. Source differs
from #907 and machine load varied; differences are not causal speedups.

Run from repository root. Experiment commands overwrite only this card's current
receipts, never its preliminary archive or inherited references.

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
pnpm -C packages/core exec esbuild ../../benchmarks/performance/results/issue-919/entry.mjs --bundle --platform=node --format=esm --target=es2022 --external:eecircuit-engine --sourcemap --outfile=../../benchmarks/performance/results/issue-919/bundle.mjs
spice-heavy node benchmarks/performance/results/issue-919/run.mjs
spice-heavy node benchmarks/performance/results/issue-919/trace.mjs
node benchmarks/performance/results/issue-919/summarize.mjs
node --test benchmarks/performance/results/issue-919/check.test.mjs
pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
spice-heavy pnpm test
spice-heavy pnpm bench:accuracy
```

Executed install/build/lint exit0; four metric tests, 31 existing solver tests,
six existing fixture tests pass. Guarded monorepo test exit0 with core3477 pass,
2 skipped; final benchmark TAP144 pass,4 skipped. Full package counts are retained
in full-test.log. Guarded accuracy exit0; accuracy.log retains the actual output.
Exact PR/full head SHA, required test(20),test(22),build,accuracy checks and independent
review are merge gates recorded in Kanban. The engineer does not merge.
