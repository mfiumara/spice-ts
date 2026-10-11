# Issue #653: M2 scaling decks after #648, next bottleneck

Base: main `58641e6` (#648 BSIM3 charge-truncation sizing and #644 merged).
Machine: Apple M5 Pro (18 cores), 48 GiB, Darwin 27.0.0 arm64, Node v22.23.1,
ngspice-47 (Homebrew, KLU compiled in). The machine was shared with other
agent lanes (1-minute load average about 3-7 on 18 cores during these runs).
The A/B in section 3 therefore starts both builds at the same moment and
reports process CPU time next to wall time. Engine-vs-engine numbers in
section 4 are **not** load-paired.

## 1. Profile on main `58641e6`: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), run by
`benchmarks/results/issue-570/scripts/prof.sh`, summarised with
`benchmarks/performance/profile-summary.mjs`. Raw `.cpuprofile` files and
summaries are in `profiles/` (`-before` = main `58641e6`, `-after` = this
branch).

Top self-time frames before (main):

| deck | sampled s | #1 | #2 | #3 | #4 | #5 |
|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | 0.32 | attemptStep 20.4% | buildCompanionSystem 12.3% | factorize 7.1% | compileSourceTextModule 5.9% | solveLinearized 5.0% |
| rc-ladder-tran-10000 | 1.46 | factorize 19.1% | attemptStep 14.7% | buildCompanionSystem 8.6% | stampStaticDevices 7.5% | (garbage collector) 5.1% |
| rc-ladder-tran-50000 | 6.68 | factorize 18.9% | attemptStep 13.4% | buildCompanionSystem 11.1% | stampStaticDevices 9.8% | (garbage collector) 7.9% |
| resistor-mesh-op-10000 | 0.60 | factorize 28.3% | amdOrdering 12.0% | (garbage collector) 8.4% | resolveResistor 3.3% | compileSourceTextModule 3.2% |
| cmos-inverter-chain-tran-1000 | 1.52 | batchStamp 24.4% | evaluateBulkJunctions 17.6% | factorize 15.6% | buildCompanionSystem 5.2% | solveLinearized 4.3% |
| cmos-inverter-chain-tran-10000 | 14.38 | **batchStamp 50.9%** | factorize 12.0% | (garbage collector) 4.5% | limitNewtonStep 4.4% | attemptStep 3.6% |

`MOSFET.batchStamp` is the largest single self-time frame on any M2 deck:
half of all sampled time on the 10k MOS1 inverter chain (at 1k, V8 had not
inlined `evaluateBulkJunctions` into it; together they are 42%). Inclusive,
it is 54.8% of the 10k profile, called from the transient Newton build
(`buildCompanionSystem`, 4.06 s), the trapezoidal history restamp
(`stampPrevB`, 1.88 s) and the DC operating point (1.36 s)
(`issue-625/scripts/callers.mjs`).

Per-line self ticks inside it (`scripts/lines.mjs`) are flat: the hottest
lines are the first touch of each instance (`const [jD, nG, jS] =
mosfet.nodes` 6.0%), the `this.lastVbs` read in `pnjlim` (8.4%) and its
write-back (3.6%), and the scattered `gValues`/`b` additions (4-5% each). The
equations themselves (two `Math.exp`, one `Math.sqrt`) are a small share. Per
device evaluation the loop cost about 65 ns at 1k and 72 ns at 10k (about
2,440 and 2,530 batch passes per run x 2,000 and 20,000 devices; telemetry from
`simulate().convergence`). ngspice-47's whole matrix load on the 1k deck is
about 48 ns per device load (`.options acct`: 87 ms for 901 iterations of
2,000 MOSFETs plus capacitors).

That is memory latency, not arithmetic. Per device the loop chased the
instance, its `nodes` array, its `params` object, its `batchSlots` array and
about a dozen double fields, which V8 stores as separately boxed heap numbers,
and it wrote three of them (`lastVbs`, `lastVbd`, `lastVon`) back per
device.

The slowest **ratio** against ngspice is a different deck: the 50k mesh OP
(4.38x KLU analysis time, section 4). Its profile
(`profiles/resistor-mesh-op-50176-after.txt`; mesh code is not touched by this
change) is `factorize` 56.2%, `amdOrdering` 9.3% and GC 8.0%, i.e. the
Gilbert-Peierls LU itself. That needs LU algorithm work (see section 5), not a
targeted fix, so this card takes the largest measured frame instead.

### The change

`packages/core/src/devices/mosfet.ts`:

- The level-1 equations are two pure functions, `mos1BulkJunctions`
  (mos1load.c bulk junctions with DEVpnjlim) and `mos1Channel` (drain current
  and derivatives). `MOSFET.stamp`, `evaluateChannel` and `batchStamp` all
  call them with the same arguments, so the per-device and batched paths
  cannot diverge.
- Each device list passed to `batchStamp` gets a cached `MosfetBatch`
  (WeakMap keyed by the list, like the companion device plans and stamp
  programs): terminal nodes, the eleven value slots and the twelve
  temperature-derived constants of every device, contiguous in typed arrays.
  It is rebuilt when the locked topology (`stampIndex`), the list length or
  any MOSFET's constants (`setTemperature`, via an epoch counter) change.
- The Newton state (`lastVbs`, `lastVbd`, `lastVon`) moved from instance
  fields into a `MosfetStateStore`: one `Float64Array` shared by instances
  batched together. The instance reads it through private accessors, so
  `MOSFET.stamp` and `limitNewtonStep` see exactly the state `batchStamp`
  wrote. Every instance starts in its own store; building a batch merges the
  stores of its devices into one that holds all their members (values copied
  unchanged), so stores only grow and an instance is in exactly one store.
  Batches re-resolve their state offsets when any merge happened.
- The hot loop no longer touches the MOSFET instances.

Why bit-identical: every value the loop reads is an exact copy (Int32 nodes
and slots, Float64 constants and state), the equations are the same
functions with the same arguments in the same order, and every
`gValues`/`b` slot receives the same additions in the same order as before.
No solver, model equation, tolerance, option or step-control code changed.

Test: `packages/core/src/devices/mosfet-batch-state.test.ts`. Two
independent compiles of a deck with NMOS/PMOS, bulk on source, rail and its
own node, and resistors between the devices; one side stamps with
`MOSFET.stamp`, the other with `batchStamp` over overlapping sub-lists
(forcing two store merges and a stale cached batch), fresh array copies,
interleaved per-device `stamp()` calls and a mid-run `setTemperature(85)` on
two devices. `gValues` and `b` are compared with `Object.is` on every entry
for 24 passes, and `limitNewtonStep` (which reads the stored `von`) must
agree on all seven devices. A second case relocks the topology mid-run. This
is a characterisation test: it passes on main too (written first and run
against main's `mosfet.ts`). Mutation check: removing the constants-epoch
bump, the store-merge epoch bump, the `von` store write or the state
re-basing on merge each makes it fail.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. All 108 samples of the A/B
  give the same hash per cell for both builds: rc 1k `ac5d6929fc25a221`,
  rc 10k `e59b4235d4c157c7`, rc 50k `d706c8a5619a8049`, mesh 10k
  `73da68241f2c6ad6`, MOS 1k `04a9fa4f0f067778`, MOS 10k `a3f30d5252ca3690`.
  These are the same hashes as in the #570, #609 and #625 evidence. The 50k
  MOS A/B (section 3) also matches: `26cc08c6b6f58150` in every sample.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `58641e6` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`). No
  child failed. 100/100 identical.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.
- The `scaling-m2.ts` probe values are identical before and after for every
  deck and size, including the 50k MOS chain (`v(s20)` = 0.35922588967769387).

## 3. Paired A/B: concurrent pairs (`ab-concurrent.jsonl`, `ab-concurrent-50k.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> <rounds> ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. The RC ladders
and the mesh OP contain no MOSFETs and act as controls.

Process CPU time (user + system, includes GC helper threads), 9 rounds:

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 (control) | 9 | 197 (179) | 191 (178) | 1.03x | 1.00x (0.94..1.09) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 (control) | 9 | 839 (787) | 826 (775) | 1.02x | 1.00x (0.95..1.03) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 (control) | 9 | 3709 (3415) | 3747 (3419) | 0.99x | 1.00x (0.99..1.07) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 390 (347) | 376 (344) | 1.04x | 1.00x (0.93..1.04) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 975 (831) | 939 (800) | 1.04x | 1.04x (1.00..1.09) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 9472 (8532) | 7212 (6705) | 1.31x | 1.27x (1.24..1.36) | yes a3f30d5252ca3690, 654 pts |

Wall time, 9 rounds:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 (control) | 9 | 80.4 (76.7) | 79.3 (76.6) | 1.01x | 1.00x (0.97..1.03) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 (control) | 9 | 572 (546) | 578 (543) | 0.99x | 1.00x (0.97..1.03) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 (control) | 9 | 2921 (2643) | 2927 (2649) | 1.00x | 1.00x (0.99..1.02) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 246 (213) | 236 (212) | 1.04x | 1.03x (0.97..1.05) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 750 (650) | 713 (615) | 1.05x | 1.06x (1.02..1.10) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 8945 (8098) | 6766 (6240) | 1.32x | 1.30x (1.25..1.39) | yes a3f30d5252ca3690, 654 pts |

MOS1 chain at 50k nodes, 3 rounds (one pair costs about 2.5 min of two cores):

| measure | n | before median (min) | after median (min) | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| CPU ms | 3 | 73597 (68637) | 68694 (49476) | 1.07x | 1.07x (1.02..1.39) | yes 26cc08c6b6f58150, 654 pts |
| wall ms | 3 | 70226 (64725) | 58371 (43806) | 1.20x | 1.20x (1.15..1.48) | yes 26cc08c6b6f58150, 654 pts |

**Reading it honestly:** a clear win on the 10k MOS1 chain, 1.27x CPU and
1.30x wall (paired medians; every pair at least 1.24x). At 1k the win is
small, 1.04x CPU / 1.06x wall: there the whole working set fits in cache, so
the pointer chasing this removes was cheap. The controls move by
1.00x (paired medians, CPU); decks without level-1 MOSFETs gain nothing.
At 50k nodes the paired wall time improves 1.20x (every pair at least
1.15x) but process CPU time only 1.07x (1.02x in one pair). In the after
samples CPU time exceeds wall time by about 10 s (helper threads, mostly GC
on a heap of several hundred MiB), so part of the main-thread saving is not a
CPU saving. With 3 rounds and a 1.02-1.39x spread, quote the 50k result as
"faster in every pair, about 1.1-1.2x", not tighter. A counter in a scratch
copy of the build confirmed the batches are built only 4 times per run (1k
chain, 2,450 batch calls), so batch construction is not a source of extra
garbage.

Inclusive time in the profiles (`issue-625/scripts/incl.mjs`; different
moments and load, so compare shares, not ms):

| deck | phase | before ms (share) | after ms (share) |
|---|---|---:|---:|
| MOS 10k | `batchStamp` | 7883.6 (54.8%) | 4596.9 (40.2%) |
| MOS 10k | `buildCompanionSystem` | 5138.7 (35.7%) | 3475.6 (30.4%) |
| MOS 10k | `stampPrevB` | 2145.9 (14.9%) | 1406.7 (12.3%) |
| MOS 10k | total sampled | 14382.4 | 11444.6 |
| MOS 1k | `batchStamp` | 648.5 (42.8%) | 495.7 (38.3%) |
| MOS 1k | total sampled | 1517.0 | 1294.2 |

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness, run as
`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900`
under `spice-heavy`, once with main's build in `packages/core/dist`
(`scaling-m2-before.json`) and once with this branch's
(`scaling-m2-after.json`); tables by `issue-570/scripts/scaling-table.mjs`.
Each engine cell ran at a different moment, so load is **not** paired, either
across engines or between the two runs. Only 3 samples per cell were taken,
to bound machine load. ngspice is the same binary in both runs. Its own
variation between the tables (rc 10k analysis 105 ms vs 169 ms, MOS 50k 66.0
s vs 55.4 s) is machine load, which is why section 3 is the measurement of
this change.

Before (main `58641e6`):

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 38.2 (36.7) | 24.7 (24.4) | 35.8 | 10.4 | 1.55x slower | 3.46x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 349 (347) | 149 (148) | 329 | 105 | 2.34x slower | 3.15x slower | 235 / 120 |
| rc-ladder-tran | 50,000 | 1920 (1897) | 873 (791) | 1801 | 701 | 2.20x slower | 2.57x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 10.9 (10.1) | 22.1 (21.8) | 8.4 | 2.7 | 0.49x (faster) | 3.15x slower | op / op |
| resistor-mesh-op | 10,000 | 157 (145) | 112 (111) | 137 | 38.3 | 1.40x slower | 3.57x slower | op / op |
| resistor-mesh-op | 50,176 | 1496 (1394) | 598 (590) | 1377 | 315 | 2.50x slower | 4.38x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 443 (441) | 169 (167) | 440 | 146 | 2.63x slower | 3.01x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 6256 (6037) | 2965 (2923) | 6215 | 2850 | 2.11x slower | 2.18x slower | 654 / 214 |
| cmos-inverter-chain-tran | 50,000 | 82089 (73397) | 66763 (63542) | 81832 | 66034 | 1.23x slower | 1.24x slower | 654 / 214 |

After (this branch):

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 71.4 (54.2) | 39.9 (38.5) | 67.0 | 17.3 | 1.79x slower | 3.87x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 573 (511) | 237 (226) | 541 | 169 | 2.41x slower | 3.20x slower | 235 / 120 |
| rc-ladder-tran | 50,000 | 2729 (2617) | 1162 (1136) | 2585 | 929 | 2.35x slower | 2.78x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 12.7 (12.3) | 24.1 (23.9) | 9.7 | 3.0 | 0.53x (faster) | 3.22x slower | op / op |
| resistor-mesh-op | 10,000 | 185 (166) | 129 (126) | 161 | 44.2 | 1.43x slower | 3.64x slower | op / op |
| resistor-mesh-op | 50,176 | 1949 (1849) | 798 (797) | 1770 | 424 | 2.44x slower | 4.17x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 632 (632) | 224 (222) | 628 | 196 | 2.82x slower | 3.20x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 6141 (6065) | 3615 (3495) | 6083 | 3465 | 1.70x slower | 1.76x slower | 654 / 214 |
| cmos-inverter-chain-tran | 50,000 | 80493 (61479) | 56019 (55269) | 80259 | 55351 | 1.44x slower | 1.45x slower | 654 / 214 |

- spice-ts remains **slower than ngspice-47 KLU in analysis time on every deck
  and size**, before and after: 1.24-4.38x before, 1.45-4.17x after. The
  1k mesh wall-time "win" is ngspice process startup only; its analysis is
  3.2x faster there.
- The after run was taken under heavier load than the before run on most
  cells. ngspice itself slowed by 1.2-1.7x on the RC and mesh cells between
  the two runs, and the MOS 50k cell moved the other way (ngspice 66.0 s ->
  55.4 s, spice-ts min 73.4 s -> 61.5 s with a 80.5 s median). The MOS 50k
  ratio therefore reads worse after (1.24x -> 1.45x) even though the paired
  measurement in section 3 shows the change makes that cell faster. Neither
  table isolates this change; section 3 does.
- MOS 10k analysis ratio: 2.18x -> 1.76x. That direction agrees with the
  paired 1.27x CPU speedup, but the size of the unpaired change also includes
  load.
- Timepoints are unchanged: 235 / 654 spice-ts vs 120 / 214 for ngspice.

## 5. Remaining scope (not in this PR)

- **Mesh OP is the slowest ratio against KLU** (4.2-4.4x analysis at 50k).
  Its profile is `factorize` 56% + `amdOrdering` 9%. The Gilbert-Peierls
  factorization does a left-looking sparse triangular solve per column with
  an insertion-sorted active-column list and threshold pivoting; KLU adds
  BTF and its AMD/COLAMD on the BTF blocks. Closing that is LU algorithm
  work (symbolic reach via DFS instead of sort, or a supernodal/multifrontal
  path), sized as its own issue.
- **Step count** on the transient decks (654 vs 214 accepted points on the
  MOS chain, 235 vs 120 on the RC ladder) is still the largest single factor
  against ngspice. Linear capacitors are sized by spice-ts's node-voltage LTE
  instead of ngspice's CAPtrunc charge truncation. #648 moved BSIM3 nodes to
  charge truncation only; doing the same for C/L changes results, so it does
  not belong in a bit-identical perf PR.
- MOS chain after this change: `batchStamp` is still the top frame (33-35%
  self), now dominated by the equations and the scattered `gValues`/`b`
  writes; `factorize` 15-17%. The DC operating point (436 Newton iterations
  with source and gmin stepping at 10k, about 25% of the profile) is a
  convergence-strategy question, not a stamping one.
- `MOSFET.stamp` (the per-device path) now reads its state through the
  store accessors. It is only used before a topology is locked and for
  devices outside a batch list.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
spice-heavy bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof-after \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/performance/results/issue-625/scripts/callers.mjs <x.cpuprofile> batchStamp
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> batchStamp stampPrevB buildCompanionSystem solveLinearized newtonRaphson
node benchmarks/performance/results/issue-653/scripts/lines.mjs <x.cpuprofile> batchStamp packages/core/dist/<chunk>.js
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 3 /tmp/ab-50k.jsonl --concurrent \
  cmos-inverter-chain-tran:50000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
spice-heavy npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
spice-heavy npx tsx benchmarks/accuracy.ts --ci
# ngspice comparison (run once per build in packages/core/dist)
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900 \
  --output=benchmarks/performance/results/issue-653/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/performance/results/issue-653/scaling-m2-after.json
```
