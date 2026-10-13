# Issue #932: triangular versus row-update phase diagnosis

Diagnosis only. Production solver and every other production file are unchanged.
Zero optimization candidates were tested or shipped. This does not retry #926's
falsified U aliases and makes no speedup or new ngspice parity claim.

## Decision

On the captured published mesh50k matrix, row updates are the larger metered
region in all three cold and all three warm diagnostic passes. Warm row CPU
median is 167.013 ms [155.969,212.841], versus triangular CPU 97.453 ms
[89.079,130.551]. Warm row wall is 217.229 ms [197.781,273.676], versus
triangular wall 95.118 ms [86.628,122.608].

These are intrusive diagnostic region measurements, NOT native production
self-time. The uninstrumented full-factor median is 240.144 ms warm, whereas
the diagnostic full-factor median is 472.082 ms. Per-call process CPU probes
materially perturb this kernel. Do not subtract timer overhead, apply the
instrumented percentages to native factor time, or add independent medians.
The prior #922 warm applySupernode self ~156.5 ms is historical CPU-profiler
sampling with different boundaries, not a number this experiment reproduces.

The measured next region is row-update work, not triangular U writes. The
existing production region already advances four rows together and uses a
consecutive-slot fast path. These measurements do not separate checked
activation, dense arithmetic, indexing, or register/JIT effects inside that
region. They therefore do not justify another unroll, pointer rewrite, pool
rewrite or speculative allocation change. Stop here rather than ship a guessed
candidate. A next narrowly scoped investigation would distinguish checked and
unchecked row work using low-perturbation attribution before selecting one
arithmetic-order-preserving candidate. This is remaining scope, not an
implemented optimization.

## Actual baseline provenance and shared-ref race

The worktree was clean, fetched origin/main and fast-forward checked at
f807cd8a3368d344a3a21a9ee17ea52a84bfa748, containing merged #929. The local
checkout stayed there. Before the initial preparation resolved origin/main,
another lane advanced that shared remote-tracking ref to parser-only #924 merge
e1597e192c26a231dd576c668524d887b6e63844. The actual independent baseline and
diagnostic archives used e159, as recorded during the run in host.json.
This is a disclosed unintended baseline-anchor difference, not an f807-only
experiment. Both are current-main revisions after #929.

The solver bytes are identical at both revisions. source-identity.json records
all frozen core source hashes and every difference against the local checkout;
baseline-difference.txt lists the complete git change set. There are parser
implementation and test differences, so we do NOT claim identical entire
core sources or identical bundle bytes. The decks contain no .temp directive.
All 18 isolated baseline/diagnostic factor-and-solution phase pairs and all
51 completed end-to-end baseline/local phase pairs match their complete IEEE
output digests, patterns, counts and convergence. This establishes invariance
for these specific controls, not arbitrary parser inputs.

A post-run attempt to pin preparation back to the intended f807 exposed stale
extracted parser files and failed the all-core identity check. Its failure log
is preserved in prepare-failed-reconstruction.log. No timing run was repeated
and no raw sample was overwritten. prepare.py now cleans only its own ignored
source copies and pins the ACTUAL e159 baseline. build.json is the deterministic
post-run reconstructed bundle manifest, not an immutable initial build receipt.
The initial archive revision is independently retained in host.json. Rebuilding
these bundles does not remeasure the experiment.

## Method and data shape

The receipt journal contains one row per direct child, with PID, argv, status,
exit, actual child wall, cumulative wall and completed phase records. Each child
writes cold and warm records independently, so a warm timeout retains a finished
cold measurement. Each phase records memory and complete output digests.

Isolation reads the three immutable V8/gzip captures from issue-919/profiles.
Capture archive hashes, matrix-value hashes, RHS hashes and complete solution
hashes are recorded. A fresh solver is analyzed outside each measured interval.
Each pass performs one full numeric factorization and zero pivot reuse; warm
means warm process/JIT after the cold pass, NOT retained factors or warm
capacity. Full used L/U column pointers, rows and IEEE values, row permutation
and column permutation are digested before solve. Every solution is checked
against the complete captured production vector, not a selected probe.

All passes force real U growth. Initial/final/used capacities are
3010/24080/12057, 29802/238416/203494, and 150082/2401312/1519509.
L+U nonzeros are 23088/396986/2988840; supernode calls are 1231/16101/89122.
No circuit-specific capacities or tolerances are changed.

The ignored diagnostic copy inserts four process.cpuUsage and performance.now
boundary probes per applySupernode call. It meters first touches, triangular
member updates/U writes, and below-supernode row updates separately, without
moving arithmetic. CPU values sum process user+system microseconds and are
converted to ms offline. They include process-wide JIT/GC/other threads during
the interval, syscall and bookkeeping effects, not pure arithmetic self-time.
Wall values include scheduling delays. Startup type feedback and the additional
receiver property are diagnostic perturbations. Neither probes nor the altered
class are shipped. Production exports are not modified.

Three interleaved repeats use baseline/diagnostic then reversed order then
baseline/diagnostic, across 1k/10k/50k mesh captures. Separately, uninstrumented
baseline/local controls use the identical published RC ladder TRAN, resistor
mesh OP and CMOS-chain TRAN at requested 1k/10k/50k. Mesh actual nodes are
1024/10000/50176. Every child runs cold then warm simulate; simulate timing
excludes import, digest creation and journal output. Warm memory includes the
previous simulation and its output processing. The complete DC voltages/currents,
transient time, all voltage/current vectors and vector counts are hashed, not
just the probe. Three repeats alternate baseline/local child order.

## Isolated measurements

Three completed samples each. Values are ms median [min,max]. Full wall/CPU,
solve, RSS ranges and every raw sample are retained in summary.txt/summary.json.
The CPU columns below are diagnostic process CPU; factor is uninstrumented wall.

| Mesh | Phase | Baseline factor wall | Diagnostic triangular CPU | Diagnostic row CPU |
|---:|---|---|---|---|
| 1k | cold | 10.601 [9.772,11.321] | 5.722 [5.457,7.979] | 11.705 [10.036,14.867] |
| 1k | warm | 1.534 [1.373,1.637] | 4.804 [3.186,5.244] | 12.387 [9.544,12.550] |
| 10k | cold | 61.579 [51.867,62.211] | 18.663 [18.302,22.621] | 37.582 [36.033,43.209] |
| 10k | warm | 22.126 [20.055,22.130] | 14.360 [12.365,18.808] | 19.471 [19.253,21.125] |
| 50k | cold | 281.092 [265.701,283.897] | 107.384 [94.603,116.101] | 190.351 [176.657,204.962] |
| 50k | warm | 240.144 [233.381,242.875] | 97.453 [89.079,130.551] | 167.013 [155.969,212.841] |

At 10k warm the CPU ranges are close. At 1k the native full factor is much
smaller than diagnostic region totals: probe/startup costs dominate, so no
native hotspot magnitude is inferred there. At 50k the native cold/warm peak
RSS medians are 201.266/228.266 MiB and diagnostic 202.328/230.313 MiB.
No improvement is claimed from comparisons to #922 or #929 on a shared host.

## End-to-end uninstrumented controls, including losses

These columns are baseline versus unchanged local CONTROL, not before/after an
optimization. Full median/min/max/RSS for every circuit, size and phase are in
summary.txt and summary.json. No result is filtered for favorable runtime.

| Deck | Size | Baseline cold ms | Local cold ms | Baseline warm ms | Local warm ms |
|---|---:|---|---|---|---|
| RC | 1k | 114.482 [94.862,123.314] | 113.721 [98.953,124.030] | 76.319 [65.328,79.940] | 77.643 [66.105,92.663] |
| RC | 10k | 486.127 [458.344,573.930] | 494.032 [489.906,589.823] | 380.833 [352.241,433.985] | 449.929 [344.813,524.800] |
| RC | 50k | 2631.200 [1597.084,2674.853] | 2444.934 [1599.681,2861.490] | 2669.479 [1471.895,3139.631] | 2481.789 [1484.131,2770.401] |
| Mesh | 1k | 72.672 [64.777,78.363] | 70.351 [63.373,81.340] | 34.924 [29.238,37.440] | 33.837 [29.040,36.977] |
| Mesh | 10k | 522.086 [303.208,612.768] | 366.010 [308.409,525.726] | 303.901 [235.123,448.535] | 299.196 [228.262,413.781] |
| Mesh | 50k | 5758.514 [1096.616,6084.388] | 6360.614 [1136.473,7368.406] | 3143.325 [1047.119,5867.835] | 6049.297 [1123.600,8606.658] |
| CMOS | 1k | 431.208 [380.373,584.663] | 418.302 [397.373,489.814] | 289.586 [267.123,366.696] | 289.689 [286.793,406.861] |
| CMOS | 10k | 3284.994 [2879.234,4058.552] | 3916.588 [3200.858,5473.802] | 3431.149 [2612.739,4237.110] | 3117.248 [2634.488,3261.622] |
| CMOS | 50k | 27196.965 [24409.430,34675.202] | 33633.475 [28508.732,37693.790] | no completion, 0/3 | no completion, 0/3 |

All non-CMOS50k-warm cells have three completed samples, including CMOS50k cold
records from timeout children. There are six CMOS50k combined cold+warm process
timeouts, all preserved. No warm median, RSS estimate or full warm output digest
exists for those children. Cold peak RSS medians at CMOS50k are
1122.531/1132.500 MiB baseline/local. The local warm mesh50k control is slower
and highly variable; it is not a speedup. Host load increased during the run.

## Bounds and cleanup

One fixed experiment, 72 direct Node child process groups: 18 isolation and
54 control children. 66 exit0 completions, six deadline timeouts, zero failed
and zero budget-skipped children. Actual cumulative child wall including
startup, warmup, output and cleanup is 427.8722589179961 seconds, under the
single 900-second experiment budget. Each communicate deadline is 45 seconds;
timeout receipt wall includes observed scheduling/kill/reap overhead. Owned
process groups are killed directly with SIGKILL on timeout, reaped and checked
absent. No wrapper-only kill, survivor tail, global process kill or retry occurs.
All PIDs, statuses, stdout/stderr, phase files and budget receipts are retained.
Full build/tests/accuracy verification commands are separate from the fixed
performance experiment and machine-load guarded where required.

## Sources and historical references

The unchanged project-authored MIT generator is ../../scaling-m2-fixture.mjs.
Its source/licence and deck hashes are already recorded under M2 generated
scaling decks in benchmarks/SOURCES.md. No new netlist/source was introduced
and SOURCES.md is untouched. Deck hashes are stored in every completed control.
The unchanged captured matrices come from merged #922 / issue-919, which used
those published decks. No fresh ngspice timing/reference corpus is run for this
experiment. Existing issue-907/issue-919 ngspice references and losses remain
explicitly HISTORICAL, not contemporaneous timing or a new parity proof. The
historical CMOS discrepancy remains unresolved, and historical CMOS50k ngspice
timeouts remain unresolved. This work fixes neither.

## Reproduction and checks

From repo root with Python 3.12+ (tar extraction data filter), Node and pnpm:

```sh
pnpm install --frozen-lockfile
python3 benchmarks/performance/results/issue-932/prepare.py
# Only in a fresh copy without samples.jsonl. Existing receipts are never erased.
spice-heavy python3 benchmarks/performance/results/issue-932/run.py
node benchmarks/performance/results/issue-932/summarize.mjs
node --test benchmarks/performance/results/issue-932/check.test.mjs
pnpm build && pnpm lint
pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts src/solver/gilbert-peierls-u-alias-926.test.ts src/solver/gilbert-peierls-equivalence.test.ts src/solver/gilbert-peierls-reuse.test.ts
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
spice-heavy pnpm test
spice-heavy pnpm bench:accuracy
```

Offline tests initially fail with missing metrics module (offline-red.log),
then pass six tests (offline-green.log). The checks independently reconcile
phase files to the journal, complete 72-child plan, cumulative actual budget,
paired full L/U/solution/output digests, phase boundaries and CPU units.
They inject corrupt factor/output digests, CPU overflow, wrong call count,
negative duration and a synthetic partial timeout, asserting rejection or
correct censoring. This is test-first offline tooling, NOT candidate mutation
RED: no optimization candidate exists. Existing growth/cancellation/pivot/
singular solver coverage passes all 52 focused tests; six fixture tests pass.
Install/build/lint exit0. Full-suite and accuracy receipts, exact PR head,
required CI and independent review are recorded in the handoff. The engineer
does not merge.
