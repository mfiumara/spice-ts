# Issue #693: M2 scaling decks after #660, next bottleneck

Base: main `be4c3c01` (#660 SoA MOSFET batch stamping merged).
Machine: Apple M5 Pro (18 cores), 48 GiB, macOS 27.0.1 arm64, Node v22.23.1,
ngspice-47 (Homebrew, KLU compiled in). The machine was shared with other
agent lanes the whole time (1-minute load average 5-9 on 18 cores). The A/B
in section 3 starts both builds at the same moment and reports process CPU
time next to wall time. The ngspice table in section 4 is **not** load-paired.

## 1. Profile on main `be4c3c01`: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), run by
`benchmarks/results/issue-570/scripts/prof.sh`, summarised with
`benchmarks/performance/profile-summary.mjs`. Raw `.cpuprofile` files and
summaries are in `profiles/` (`-before` = main `be4c3c01`, `-after` = this
branch).

Top self-time frames before (main):

| deck | sampled ms | #1 | #2 | #3 | #4 | #5 |
|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | 176 | (garbage collector) 19.5% | flush 13.1% | buildCompanionSystem 10.9% | attemptStep 9.8% | compileSourceTextModule 8.5% |
| rc-ladder-tran-10000 | 840 | attemptStep 14.0% | buildCompanionSystem 10.3% | stampStaticDevices 7.1% | (garbage collector) 6.1% | flush 5.7% |
| rc-ladder-tran-50000 | 3,396 | attemptStep 15.1% | (garbage collector) 12.3% | buildCompanionSystem 10.7% | stampStaticDevices 9.6% | refactorWithPivots 6.8% |
| resistor-mesh-op-10000 | 376 | **factorize 25.2%** | **amdOrdering 13.5%** | (garbage collector) 8.7% | compile 4.1% | compileSourceTextModule 4.0% |
| resistor-mesh-op-50176 | 2,214 | **factorize 50.4%** | (garbage collector) 10.9% | **amdOrdering 9.8%** | resolveResistor 2.4% | compile 2.4% |
| cmos-inverter-chain-tran-1000 | 794 | batchStamp 32.3% | attemptStep 8.7% | buildCompanionSystem 6.6% | refactorWithPivots 6.6% | flush 6.3% |
| cmos-inverter-chain-tran-10000 | 7,539 | batchStamp 39.6% | mos1BulkJunctions 8.9% | (garbage collector) 8.6% | refactorWithPivots 6.4% | attemptStep 5.9% |

(The 50k mesh deck has 50,176 nodes: the generator rounds up to a square grid.)

**Which bottleneck, and why this one.** The deck furthest behind ngspice-47
KLU is the resistor-mesh OP. A one-sample spot check on main (warmups 0,
unpaired, not used for any claim) gave analysis-time ratios of 4.76x at 10k
and 3.40x at 50k for the mesh, against 3.25x / 2.12x for the RC ladder and
1.20x for the 10k MOS chain. On that deck the sparse LU *is* the cost:
inclusive, `factorize` is 1,115 ms and `amdOrdering` 218 ms of a 1,825 ms
`simulate()` at 50k (`issue-625/scripts/incl.mjs`), and they are the top two
solver frames at 10k.

The other candidates were left alone on purpose:

- `MOSFET.batchStamp` (MOS chain) lives in `devices/mosfet.ts`, which open
  PR #689 (#621 CKTtrunc step control) also edits. The card forbids colliding
  with it.
- The RC ladder's `attemptStep` self time is the inlined triangular solve
  plus per-step bookkeeping, spread over many lines. Its largest factor
  against ngspice is the step count (228 vs 120 accepted points), which
  belongs to the truncation/step-control lane (#621/#689).

Inside `factorize` (`issue-653/scripts/lines.mjs`, 50k mesh), 80% of the
self ticks sit in the left-looking update loop `workspace[origI] -= lValues[p]
* ukj`. 12.1% of them are the load of the per-row state, `nonzeroFlag[origI]`,
which the loop read on every update (218 M multiply-subtract updates on this
matrix by the #669 kernel counters) to detect fill.
Inside `amdOrdering`, the hot lines were allocations: a new typed-array view
per updated variable (`varAdj[i] = adj.subarray(0, adjLen)`, 21%), shrinking
and re-growing the JS element list of every variable (`elems.length =
elemLen; elems.push(p)`, 26%), and `Int32Array.from(lp).sort()` per pivot.

Fill is not the problem. With the existing ordering the 50k mesh factor has
2.81 M stored nonzeros, and the symbolic Cholesky count of A + Aᵀ under the
AMD order is 1.38 M below the diagonal (Σ colcount², 1.79e8). A geometric
nested-dissection order of the same grid gives 1.66 M and 1.92e8, so it is
worse (`fill.mts`, output in `fill.txt`). The kernel's speed per update is the gap, not the ordering.

### The change

`packages/core/src/solver/gilbert-peierls.ts` (the numeric kernel):

- The update loop now tests the value it has just loaded. It reads the row
  state only when that value was exactly zero before the update. Untouched
  rows hold zero, because the workspace is cleared between columns, and a
  dormant row is by definition a touched row that holds zero. So any nonzero
  value belongs to a settled row, and the state check could not have done
  anything. Rows that were zero keep the old code path unchanged, so fill
  detection, dormant-row activation, the heap order and the stored L/U
  entries are the same.

`packages/core/src/solver/amd-ordering.ts` (the fill-reducing order):

- Same algorithm, same decisions, flat storage. Variable adjacency stays in
  place in one `Int32Array` and shrinks by a length counter only. Each
  variable's element list is an `Int32Array` buffer that grows by doubling.
  Each new element's member list goes, sorted ascending, into one arena. Lₚ
  is a reused scratch `Int32Array`. The loops visit elements and variables in
  exactly the old order, so the returned order is identical.

No solver decision, model equation, tolerance, option or step-control code
changed.

Tests:

- `packages/core/src/solver/amd-ordering-equivalence.test.ts` holds a frozen
  copy of the pre-#693 `amdOrdering` (main `be4c3c01`, renamed only). It
  requires the identical order on grids from 1x1 to 60x60, including
  rectangular grids (many degree ties and arena growth), 120 random
  symmetric and nonsymmetric patterns with dense rails, and disconnected
  chains, stars and isolated variables. This is a characterisation test: the
  frozen copy is main's implementation, so it passes on main by
  construction. Mutation check: walking Lₚ forward instead of backward in the
  degree update, or an off-by-one in `w[e]`, fails all three cases.
- The kernel change is covered by the existing #669 oracle,
  `gilbert-peierls-equivalence.test.ts`. It checks L, U, the row permutation
  and the solution bit for bit against the frozen pre-#669 kernel on uniform
  and graded grids and on 240 random systems with ties, exact cancellation
  and explicit stored zeros. Mutation check: skipping the zero path for a
  subset of updates (`before !== 0 || lValues[p] < 0`) fails 7 of 37 tests in
  that file and `gilbert-peierls.test.ts`.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. All 114 A/B samples give the
  same hash per cell for both builds: rc 1k `c52bb1560beea44a`, rc 10k
  `e103ee018dad67cb`, rc 50k `31fec1c771144ba4`, mesh 1k `cc196ac698927bd3`,
  mesh 10k `73da68241f2c6ad6`, mesh 50k `2cc3802569b2f6af`, MOS 1k
  `f38c6b8e7ac1b199`, MOS 10k `ea6e2b1bd7eca4d5`, MOS 50k `fb77d83860002e39`.
  The rc and MOS hashes differ from the #653 evidence because main changed
  those waveforms between the two cards (e.g. #608 breakpoint step sizing).
  Before and after match here.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `be4c3c01` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`).
  100/100 identical, no child failed.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.
- `amd-ab.mts` compares the order returned by both trees on the 10k and 50k
  mesh matrices in every sample: identical (`46c398b679e6c36f`,
  `b049be91c9a68a51`).

## 3. Paired A/B: concurrent pairs (`ab-concurrent.jsonl`, `ab-concurrent-50k.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> <rounds> ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. 7 rounds for the
1k/10k cells, 5 rounds for the 50k cells.

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 62.2 (55.4) | 62.3 (55.3) | 1.00x | 1.00x (0.98..1.01) | yes c52bb1560beea44a, 228 pts |
| rc-ladder-tran:10000 | 7 | 395 (364) | 385 (361) | 1.02x | 1.02x (1.00..1.03) | yes e103ee018dad67cb, 228 pts |
| rc-ladder-tran:50000 | 5 | 2359 (1804) | 2377 (1795) | 0.99x | 1.00x (0.99..1.01) | yes 31fec1c771144ba4, 228 pts |
| resistor-mesh-op:1000 | 7 | 18.1 (17.1) | 17.4 (16.0) | 1.04x | 1.07x (1.00..1.09) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 7 | 156 (146) | 141 (133) | 1.11x | 1.10x (1.08..1.11) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 5 | 1457 (1121) | 1245 (985) | 1.17x | 1.17x (1.14..1.19) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 7 | 374 (362) | 367 (359) | 1.02x | 1.00x (0.91..1.07) | yes f38c6b8e7ac1b199, 648 pts |
| cmos-inverter-chain-tran:10000 | 7 | 3998 (3851) | 3979 (3874) | 1.00x | 1.00x (0.99..1.01) | yes ea6e2b1bd7eca4d5, 648 pts |
| cmos-inverter-chain-tran:50000 | 5 | 55199 (47878) | 55695 (47985) | 0.99x | 0.99x (0.99..1.00) | yes fb77d83860002e39, 648 pts |

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 166 (148) | 167 (150) | 0.99x | 1.01x (0.97..1.01) | yes |
| rc-ladder-tran:10000 | 7 | 620 (574) | 620 (572) | 1.00x | 1.01x (0.99..1.05) | yes |
| rc-ladder-tran:50000 | 5 | 3011 (2375) | 3025 (2467) | 1.00x | 0.99x (0.96..1.08) | yes |
| resistor-mesh-op:1000 | 7 | 47.7 (46.7) | 47.5 (44.3) | 1.00x | 1.02x (0.99..1.06) | yes |
| resistor-mesh-op:10000 | 7 | 255 (236) | 239 (229) | 1.07x | 1.04x (1.03..1.11) | yes |
| resistor-mesh-op:50000 | 5 | 1851 (1475) | 1640 (1321) | 1.13x | 1.12x (1.12..1.13) | yes |
| cmos-inverter-chain-tran:1000 | 7 | 540 (523) | 531 (520) | 1.02x | 1.00x (0.94..1.04) | yes |
| cmos-inverter-chain-tran:10000 | 7 | 4366 (4206) | 4370 (4249) | 1.00x | 1.00x (0.99..1.01) | yes |
| cmos-inverter-chain-tran:50000 | 5 | 67613 (60718) | 69111 (60185) | 0.98x | 0.98x (0.97..1.01) | yes |

**Reading it honestly:** a real but modest win on the deck it targets. The
mesh OP is 1.17x faster in paired wall time at 50k (every pair at least
1.14x), 1.12x in CPU time, and 1.10x wall / 1.04x CPU at 10k. At 1k the gain
(1.07x wall, 1.02x CPU) is near the noise. The transient decks factorize from
scratch only a handful of times per run (they reuse pivots), so they do not
move: their paired medians are 0.98-1.02x. The 50k MOS chain reads 0.98x
CPU / 0.99x wall with a 0.97..1.01 spread over 5 pairs. Neither code path
that chain spends its time in was changed, but a 1-2% loss there cannot be
ruled out from 5 pairs, so it is reported as measured.

Component A/Bs on the mesh matrices, fresh child processes, rotating order,
7 rounds:

| measurement | base `be4c3c01` median | head median | paired speedup |
|---|---:|---:|---:|
| `factorize`, 50,177 x 50,177 mesh matrix, one full factorization (`issue-669/solver-ab.mts`) | 630 ms | 502 ms | 1.27x |
| `factorize`, RC-ladder refactorization with pivot reuse (control) | 1.147 ms | 1.153 ms | 0.99x |
| `amdOrdering`, 10k mesh, warm (`amd-ab.mts`) | 24.3 ms | 14.5 ms | 1.67x |
| `amdOrdering`, 10k mesh, first call in the process | 36.9 ms | 36.7 ms | 1.01x |
| `amdOrdering`, 50k mesh, warm | 160 ms | 58.1 ms | 2.75x |
| `amdOrdering`, 50k mesh, first call in the process | 192 ms | 111 ms | 1.74x |

The first-call rows matter because `simulate()` orders a topology once. At
10k, the first call is dominated by JIT tier-up, and flat storage does not
help it. That is why the 10k mesh gains less than the 50k mesh.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness with this branch's build in
`packages/core/dist`, under `spice-heavy`:
`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900`
(`scaling-m2-after.json`; table by `issue-570/scripts/scaling-table.mjs`).
Medians of 5 samples per cell. Each engine cell ran at a different moment, so
load is **not** paired across engines. The paired before/after for spice-ts
is section 3.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 58.6 (56.0) | 43.2 (40.9) | 54.8 | 19.3 | 1.35x slower | 2.84x slower | 228 / 120 |
| rc-ladder-tran | 10,000 | 546 (482) | 255 (239) | 499 | 184 | 2.14x slower | 2.71x slower | 228 / 120 |
| rc-ladder-tran | 50,000 | 2908 (2727) | 1618 (1478) | 2725 | 1332 | 1.80x slower | 2.05x slower | 228 / 120 |
| resistor-mesh-op | 1,024 | 15.1 (11.9) | 30.4 (27.2) | 11.3 | 3.4 | 0.50x (faster) | 3.32x slower | op / op |
| resistor-mesh-op | 10,000 | 173 (154) | 163 (155) | 132 | 55.9 | 1.06x slower | 2.37x slower | op / op |
| resistor-mesh-op | 50,176 | 1498 (1434) | 918 (824) | 1334 | 476 | 1.63x slower | 2.80x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 459 (451) | 224 (222) | 454 | 196 | 2.05x slower | 2.32x slower | 648 / 214 |
| cmos-inverter-chain-tran | 10,000 | 4967 (4936) | 3888 (3544) | 4905 | 3708 | 1.28x slower | 1.32x slower | 648 / 214 |
| cmos-inverter-chain-tran | 50,000 | 51322 (50592) | 59431 (58065) | 50980 | 58726 | 0.86x (faster) | 0.87x (faster) | 648 / 214 |

- spice-ts is still **slower than ngspice-47 KLU in analysis time on 8 of 9
  cells**: 2.05-2.84x on the RC ladder, 2.37-3.32x on the mesh OP, and
  1.32-2.32x on the MOS chain at 1k/10k. The 1k mesh wall-time "win" is
  ngspice process startup only. ngspice's analysis there is 3.3x faster.
- The 50k MOS chain cell reads 0.87x, i.e. spice-ts faster. Do **not** quote
  it as a win. That cell is unpaired. ngspice's own time on it has moved
  between 55.4 s and 66.0 s across the #653 runs. spice-ts's has moved
  between 50 s and 82 s across cards, and this change did not speed it up
  (section 3: 0.99x wall). It needs a load-paired engine comparison before it
  can be called anything.
- The mesh OP is still the slowest deck at 10k and 50k (2.4x / 2.8x analysis
  time). Absolute ngspice times in this run are higher than in the #653 run
  (mesh 50k 476 ms vs 424 ms, RC 50k 1,332 ms vs 929 ms) because of machine
  load. Compare the ratios with that in mind, not with the #653 table.
- Timepoints: 228 / 648 spice-ts vs 120 / 214 for ngspice. They differ from
  #653's 235 / 654 because of main's step-control changes since then, not
  because of this change.

## 5. Remaining scope (not in this PR)

- **Mesh OP:** `factorize` is still about half of the 50k profile. Its update
  loop is now the indirect-indexed multiply-subtract itself: in the after
  profile, the `lRows` load, the workspace load and the store are 63% of
  factorize ticks. Going further needs a different kernel layout, such as
  supernodal or dense-block updates over shared row sets. Those would have
  to keep the per-entry summation order and the touch order, which decides
  pivot ties, to stay bit-identical. That is its own issue.
- `amdOrdering`'s first call at 10k nodes is JIT tier-up bound, about 37 ms
  against 15 ms warm.
- Parse and compile (`parseAsync` 10-17%, `compile` 8-9% of the mesh
  profiles) and GC (9-11%) are now a large share of the mesh OP.
- MOS chain: `batchStamp` remains the top frame (32-40% self). It is blocked
  on PR #689, which edits `devices/mosfet.ts`.
- RC ladder and MOS chain: the step count (228 vs 120, 648 vs 214) is still
  the largest single factor against ngspice. It belongs to the #621/#689
  truncation lane.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof rc-ladder-tran:1000 rc-ladder-tran:10000 \
  rc-ladder-tran:50000 resistor-mesh-op:10000 resistor-mesh-op:50000 cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> simulate factorize amdOrdering analyzePattern
node benchmarks/performance/results/issue-653/scripts/lines.mjs <x.cpuprofile> factorize packages/core/dist/<chunk>.js
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 7 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 resistor-mesh-op:1000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 5 /tmp/ab-50k.jsonl --concurrent \
  rc-ladder-tran:50000 resistor-mesh-op:50000 cmos-inverter-chain-tran:50000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# component A/Bs (<root> = a checkout with packages/core/src)
pnpm exec tsx benchmarks/performance/results/issue-669/solver-ab.mts --base=<main root> --head=<branch root> --rounds=7
pnpm exec tsx benchmarks/performance/results/issue-693/amd-ab.mts --base=<main root> --head=<branch root> --rounds=7
# corpus digests: <root>/packages/core/dist must be the build under test
spice-heavy npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
spice-heavy npx tsx benchmarks/accuracy.ts --ci
# ngspice comparison (branch build in packages/core/dist)
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900 \
  --output=benchmarks/performance/results/issue-693/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/performance/results/issue-693/scaling-m2-after.json
```
