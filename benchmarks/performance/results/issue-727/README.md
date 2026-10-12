# Issue #727: M2 scaling decks after #710, next bottleneck

Base: main `9048f8cf` (#723/#710, #724 and #725 merged). Head: branch `perf/m2-profile-after-710`.
Machine: Apple M5 Pro (18 cores), 48 GiB, macOS 27.0.1 arm64, Node v22.23.1,
ngspice-47 (Homebrew, KLU compiled in). Other agent lanes shared the machine the
whole time (1-minute load average 3 to 12 on 18 cores). Section 3 starts both
builds of a pair at the same moment and reports process CPU time next to wall
time. The ngspice tables in section 4 are **not** load-paired.

## 1. Profile on main `9048f8cf`: which hot spot

Same tooling as #702/#710: `benchmarks/results/issue-570/scripts/prof.sh`
(`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`),
`profile-summary.mjs`, `issue-625/scripts/incl.mjs` and
`issue-710/scripts/lines.mjs`. Raw profiles and summaries are in `profiles/`
(`-before` is main, `-after` is this branch).

Top self-time frames on main:

| deck | sampled ms | #1 | #2 | #3 |
|---|---:|---|---|---|
| rc-ladder-tran-10000 | 626 | stampDynamicDevices 6.0% | compile 5.9% | buildCompanionSystem 5.8% |
| rc-ladder-tran-50000 | 2520 | (gc) 11.1% | evaluate 7.9% | stampStaticDevices 7.8% |
| resistor-mesh-op-10000 | 380 | **factorize 22.9%** | (gc) 11.6% | amdOrdering 7.8% |
| resistor-mesh-op-50000 | 2002 | **factorize 50.3%** | (gc) 13.4% | amdOrdering 6.0% |
| cmos-inverter-chain-tran-1000 | 592 | MOSFET.batchStamp 25.7% | (gc) 11.8% | bulkJunction 8.9% |
| cmos-inverter-chain-tran-10000 | 5172 | MOSFET.batchStamp 27.5% | (gc) 10.4% | mos1BulkJunctions 6.4% |

**Which bottleneck, and why this one.** After #710 the RC ladder has no single
dominant frame left (the largest is 6-8% self). The largest single frame on any
deck is the sparse LU `factorize` on the resistor mesh: half of the 50k profile,
for one full factorization. The mesh OP is also the deck furthest behind
ngspice-47 KLU (2.2-2.5x slower in analysis time in the #710 run).
`MOSFET.batchStamp` is next (25-28% on the MOS chain), but it is already
struct-of-arrays (#653) and what is left there is the MOS1 equations.

Per-line self time inside `factorize` on the 50k mesh: 626 ms of 1006 ms is the
four lines of the left-looking column update (`workspace[i] -= L[i,k] * U[k,j]`
plus its zero-activation test). `scripts/factor-stats.mts` counts the work of
the one full factorization (deterministic):

| cell | n | nnz(L) | nnz(U) | fill (L+U)/A | update multiply-subtracts |
|---|---:|---:|---:|---:|---:|
| resistor-mesh-op:10000 | 10,001 | 193,492 | 203,494 | 8.0 | 12.2 M |
| resistor-mesh-op:50000 | 50,177 | 1,469,331 | 1,519,509 | 12.0 | 218.4 M |

That is 2.9 ns per multiply-subtract: each one reloads the row index and the
workspace entry and stores it back. `scripts/supernode-stats.mts` shows that
96% of those operations come from runs of consecutive L columns with nested
patterns (supernodes: `L[:,k] = {pivot row of k+1} ∪ L[:,k+1]`): 12,419 such
links at 50k. Their stored row *order* differs between the two columns in 89% of
the links (only 1,313 keep it), so the existing CSC columns cannot simply be
walked together.

Changing the ordering (to reduce fill) would change round-off, so it is out of
scope: results must stay bit-identical.

### The change

`packages/core/src/solver/gilbert-peierls.ts`, full factorization only (the
pivot-reuse `refactorWithPivots` path, the solve, AMD and the singleton
pre-ordering are untouched):

- After column j is stored, it is linked to column j-1 when `L[:,j-1]` holds
  exactly the new pivot row plus the rows of `L[:,j]`. A linked run is packed as
  it grows into a row-major block (one row per row of `L[:,s0]`, one slot per
  member column; rows below the supernode first, member pivot rows last). The
  block is widened by doubling, so packing costs O(nnz(L)) per factorization.
- When the left-looking loop pops a column k that has packed later members
  (`applySupernode`), it applies them as one block instead of one column at a
  time:
  1. rows are appended to the touched-row list in `L[:,k]` order before any
     arithmetic, exactly as applying column k alone would append them;
  2. the triangular part, in ascending member order: a member is applied iff
     its pivot-row value is nonzero after the earlier members, and that value
     is its U entry;
  3. every row below the supernode gets the same subtractions in the same
     ascending member order, accumulated in a register, four rows at a time so
     the dependent chains overlap. The zero-activation step runs whenever a
     subtraction starts from zero, as before. Member keys are removed from the
     active-column heap; only the order of heap insertions changes, which does
     not change the pop order (keys are unique).

So every workspace entry sees the same operations in the same order, the
touched-row list (which drives pivot ties and the L row order) is identical,
and the factors are bit-identical. A new diagnostic getter,
`supernodalUpdates`, counts block applications.

### Tests

`packages/core/src/solver/gilbert-peierls-equivalence.test.ts`, new
`describe('GilbertPeierlsSolver supernodal updates (#727)')`, against the
frozen pre-#669 kernel already in that file (factors compared with `Object.is`:
perm, L/U pointers, rows and values):

- uniform and graded resistor grids of side 24 and 41 with a voltage-source
  branch row (pivot ties): bit-identical, and more than `side` supernodal
  updates each;
- 60 random grid-shaped matrices with small-integer values (exact
  cancellation), explicit stored zeros, sparse random cross terms and a weak
  diagonal on every other seed (off-preference pivots), with AMD and natural
  ordering, plus three re-factorizations each with values zeroed or replaced:
  bit-identical, more than 1000 supernodal updates in total.

RED: before the kernel change the counter assertions fail (`expected 0 to be
greater than ...`); the bit-identity checks pass on main by construction.

Mutation checks (`scripts/mutants.sh`), each mutant fails the test file
(9/9 killed): first touches appended in reverse order; members with a zero U
entry applied anyway; member keys left in the heap; zero-activation skipped in
the four-row loop; members applied in reverse order in the four-row loop; a
perturbed triangular update; the member-row swap skipped while packing; slot 0
dropped when widening a block; zero-activation skipped in the remainder rows.

Targeted suites run locally: `src/solver`, `src/mna`, `src/analysis`,
`simulate.test.ts`, `mos1-inverter-chain-op.test.ts`, `integration.test.ts`:
62 files, 606 passed, 2 skipped.

## 2. Results are bit-identical

- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `9048f8cf` and this
  branch (`corpus-digests-before.json`, `corpus-digests-after.json`): 100/100
  identical, no child failed. After rebasing onto main `544bfffc`, again 100/100
  identical between that main and the rebased branch
  (`corpus-digests-before-544bfffc.json`, `corpus-digests-after-rebased.json`).
- Waveform SHA-256 hashes (`issue-486/sample.mjs`: time axis, every node voltage
  and branch current as Float64 bytes) are identical in every A/B pair below,
  and equal to the #710 hashes for the RC ladder, mesh and MOS chain cells.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.

## 3. Paired A/B: concurrent pairs

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> <rounds> <out.jsonl> --concurrent <cells>`
under `spice-heavy`; each sample is a fresh `node` process (one warmup, one timed
`simulate()`), before and after of a pair start together. Ratios are
before/after (>1 = this change is faster).

Run A (`ab-concurrent.jsonl`, 7 rounds; `ab-concurrent-50k.jsonl`, 5 rounds; load
average 8-12), wall time:

| cell | n | before median (min) ms | after median (min) ms | paired ratio median (min..max) | CPU paired ratio | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 54.8 (44.9) | 55.4 (45.3) | 0.99x (0.97..1.01) | 0.99x (0.97..1.02) | yes 43832feb6c3df0e3 |
| rc-ladder-tran:10000 | 7 | 311 (268) | 312 (260) | 1.00x (0.98..1.03) | 0.99x (0.94..1.04) | yes e9595100f7de3b38 |
| rc-ladder-tran:50000 | 5 | 1891 (1559) | 1900 (1580) | 0.98x (0.94..1.00) | 0.95x (0.93..1.01) | yes 55a45c77cca1a8fd |
| resistor-mesh-op:1000 | 7 | 23.5 (20.6) | 23.7 (21.0) | 0.99x (0.94..1.01) | 0.94x (0.90..0.99) | yes cc196ac698927bd3 |
| resistor-mesh-op:10000 | 7 | 186 (169) | 176 (158) | 1.06x (1.03..1.09) | 1.03x (0.98..1.09) | yes 73da68241f2c6ad6 |
| resistor-mesh-op:50000 | 5 | 1660 (1475) | 1402 (1319) | 1.13x (1.10..1.18) | 1.12x (1.08..1.19) | yes 2cc3802569b2f6af |
| cmos-inverter-chain-tran:1000 | 7 | 315 (292) | 332 (299) | 0.97x (0.92..1.01) | 0.99x (0.96..1.01) | yes db7a45ff9f193198 |
| cmos-inverter-chain-tran:10000 | 7 | 3437 (3009) | 3436 (2985) | 1.00x (0.99..1.01) | 1.00x (0.99..1.00) | yes 8242983813aac963 |
| cmos-inverter-chain-tran:50000 | 5 | 62502 (48544) | 62422 (49019) | 1.00x (0.99..1.01) | 1.00x (0.99..1.00) | yes dbda503ef3935405 |

Run B (`ab-concurrent-50k-rerun.jsonl`, 7 rounds, load average 3-7):

| cell | n | before median (min) ms | after median (min) ms | paired ratio median (min..max) | CPU paired ratio | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:50000 | 7 | 1050 (1005) | 1083 (970) | 1.00x (0.97..1.04) | 0.98x (0.87..1.00) | yes |
| resistor-mesh-op:10000 | 7 | 135 (130) | 126 (123) | 1.07x (1.00..1.11) | 1.01x (0.96..1.13) | yes |
| resistor-mesh-op:50000 | 7 | 936 (894) | 781 (742) | 1.19x (1.18..1.21) | 1.15x (1.11..1.20) | yes |

Kernel only (`factor-bench.txt`, `scripts/factor-bench.mts`: one full
`factorize()` of a side x side grid MNA, 7 calls per process, three alternating
process pairs, main's `gilbert-peierls.ts` loaded with `GP_MODULE`):

| grid | main median ms (3 processes) | branch median ms | speedup of the medians |
|---|---|---|---|
| 100 x 100 (10k) | 47.3 / 65.2 / 52.6 | 42.4 / 45.1 / 38.4 | 1.1-1.4x |
| 224 x 224 (50k) | 595 / 637 / 594 | 388 / 396 / 398 | 1.5-1.6x |

**Reading it honestly:**

- **Mesh OP:** 1.13x / 1.19x faster wall at 50k (two runs; run B is the quieter
  one, 1.18..1.21), 1.06x / 1.07x at 10k. The factorization kernel is about
  1.5x faster; the rest of the mesh OP (AMD ordering, parsing/compile, GC) is
  unchanged, which caps the end-to-end gain.
- **1k cells:** no measurable change. The mesh 1k CPU reading of 0.94x
  (0.90..0.99) is a 23 ms fresh-process sample. In-process steady state (40
  runs, three alternating processes) gives the same median on both builds
  (medians 11.6-22.9 ms main, 11.4-11.6 ms branch), so it is reported as measured but
  not as a regression.
- **RC ladder 50k:** 0.98x in run A (0.94..1.00, heavy load) and 1.00x in run B
  (0.97..1.04); CPU 0.95x / 0.98x. Its two full factorizations have no
  supernodes (`L` is one entry per column), so the only new work is two O(n)
  fills and a length comparison per column. In-process steady state (6 runs, 4
  alternating process pairs) gives main 673-723 ms min and branch 676-729 ms min.
  Reported as measured: no change within noise, not a claimed regression or win.
- **MOS chain:** its last full factorization at 1k has no L entry at all
  (`factor-stats-after.md`), so no supernode forms there: 0.97x / 1.00x / 1.00x, unchanged within noise.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks

`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900`
under `spice-heavy`, this branch's build in `packages/core/dist`; table by
`issue-570/scripts/scaling-table.mjs`. Medians of 5 samples per cell. Each
engine cell ran at a different moment, so load is **not** paired across engines.

Two runs, because ngspice's own times moved a lot with load between and within
them (e.g. ngspice's RC 50k analysis samples range 738-1456 ms in run 2).
`scaling-m2-after-run1.json` ran at load average 8-12, `scaling-m2-after-run2.json`
at 3-9. Analysis-time ratio, spice-ts / ngspice (>1 = spice-ts slower), with the
#710 run (main before #723) for reference:

| workload | nodes | #710 run | run 1 | run 2 |
|---|---:|---|---|---|
| rc-ladder-tran | 1,000 | 1.36x slower | 1.34x slower | 1.72x slower |
| rc-ladder-tran | 10,000 | 1.22x slower | 1.54x slower | 1.61x slower |
| rc-ladder-tran | 50,000 | 1.33x slower | 2.31x slower | 0.66x |
| resistor-mesh-op | 1,024 | 2.49x slower | 2.72x slower | 2.24x slower |
| resistor-mesh-op | 10,000 | 2.18x slower | 2.10x slower | 3.55x slower |
| resistor-mesh-op | 50,176 | 2.42x slower | 1.84x slower | 1.77x slower |
| cmos-inverter-chain-tran | 1,000 | 1.33x slower | 1.23x slower | 1.18x slower |
| cmos-inverter-chain-tran | 10,000 | 1.12x slower | 1.12x slower | 0.69x |
| cmos-inverter-chain-tran | 50,000 | 0.43x | 0.46x | 0.56x |

Run 2 in full:

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 32.8 (27.3) | 36.2 (36.1) | 28.8 | 16.8 | 0.91x (faster) | 1.72x slower | 119 / 120 |
| rc-ladder-tran | 10,000 | 218 (192) | 166 (157) | 188 | 117 | 1.31x slower | 1.61x slower | 119 / 120 |
| rc-ladder-tran | 50,000 | 867 (822) | 1361 (908) | 760 | 1154 | 0.64x (faster) | 0.66x (faster) | 119 / 120 |
| resistor-mesh-op | 1,024 | 14.8 (12.8) | 34.9 (34.3) | 9.8 | 4.4 | 0.42x (faster) | 2.24x slower | op / op |
| resistor-mesh-op | 10,000 | 256 (205) | 179 (157) | 205 | 57.9 | 1.43x slower | 3.55x slower | op / op |
| resistor-mesh-op | 50,176 | 1049 (1048) | 940 (907) | 889 | 503 | 1.12x slower | 1.77x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 275 (264) | 262 (251) | 269 | 229 | 1.05x slower | 1.18x slower | 213 / 214 |
| cmos-inverter-chain-tran | 10,000 | 3863 (3771) | 5710 (4624) | 3798 | 5534 | 0.68x (faster) | 0.69x (faster) | 213 / 214 |
| cmos-inverter-chain-tran | 50,000 | 35473 (26963) | 63697 (59621) | 35224 | 63095 | 0.56x (faster) | 0.56x (faster) | 213 / 214 |

Probe agreement (first sample of each cell, both runs): RC ladder `v(n10)`
0.16837649 V against 0.1683766 V (6.4e-7 relative), mesh corner ≤1.9e-7
relative at every size, MOS chain `v(s20)` 0.34966 V against 0.35005 V
(1.1e-3 relative). The engines compute the same answers.

- **Losses.** spice-ts is still **slower than ngspice-47 KLU in analysis time
  on the mesh OP at every size (1.8-3.6x across the two runs), on the RC ladder
  at 1k and 10k (1.3-1.7x) and on the MOS chain at 1k (1.2x)**. The 1k wall-time
  "wins" are ngspice process startup only.
- **Mesh OP:** the 50k cell reads 1.84x / 1.77x slower, against 2.42x in the
  #710 run; that direction matches the 1.13-1.19x paired gain in section 3, but
  the engines were not load-paired, so section 3 is the attribution. The
  mesh is still the deck furthest behind KLU, and the 10k cell reads 3.55x in
  run 2 (spice-ts samples 164-245 ms under load).
- **Not claimed as wins:** RC ladder 50k (0.66x in run 2 but 2.31x in run 1;
  ngspice's samples there ranged 738-1456 ms), MOS chain 10k (0.69x in run 2,
  1.12x in run 1) and MOS chain 50k (0.46x / 0.56x; spice-ts's own samples
  ranged 26.7-51.6 s in run 2). This PR does not change the RC ladder or the MOS
  chain (section 3), so those cells only show load.

## 5. Remaining scope (not in this PR)

- **Mesh OP:** the factorization is still the largest frame. Further options,
  all keeping bit-identity: the triangular part of a supernode reads its block
  column-wise (strided); single-member and small supernodes still take the
  column path; the pivot-reuse path (`refactorWithPivots`) does not use
  supernodes (it is the path transient decks take). Outside the factorization:
  `amdOrdering` (6-8%) and GC (11-13%).
- **MOS chain:** `MOSFET.batchStamp` and the MOS1 junction/limiting code.
- **RC ladder:** no frame above 8% self; the trapezoidal `stampPrevB` restamp
  and the static/dynamic stamping passes remain.
- **A load-paired spice-ts vs ngspice run**, needed before cross-card engine
  ratios can be compared.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles
bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof resistor-mesh-op:10000 resistor-mesh-op:50000
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> simulate factorize applySupernode amdOrdering
# deterministic factorization statistics
npx tsx benchmarks/performance/results/issue-727/scripts/factor-stats.mts resistor-mesh-op:10000 resistor-mesh-op:50000
npx tsx benchmarks/performance/results/issue-727/scripts/supernode-stats.mts resistor-mesh-op:50000
# kernel micro-benchmark (GP_MODULE=<main's gilbert-peierls.ts placed next to this one> for the baseline)
npx tsx benchmarks/performance/results/issue-727/scripts/factor-bench.mts 224 7
# tests and mutation checks
pnpm -C packages/core exec vitest run src/solver
bash benchmarks/performance/results/issue-727/scripts/mutants.sh
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 7 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 resistor-mesh-op:1000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 5 /tmp/ab-50k.jsonl --concurrent \
  rc-ladder-tran:50000 resistor-mesh-op:50000 cmos-inverter-chain-tran:50000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
spice-heavy npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
spice-heavy npx tsx benchmarks/accuracy.ts --ci
# ngspice comparison
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900 --output=/tmp/scaling.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs /tmp/scaling.json
# deterministic: full factorizations per simulate() (only those can use supernodes)
npx tsx benchmarks/performance/results/issue-727/scripts/full-factor-count.mts rc-ladder-tran:50000 cmos-inverter-chain-tran:1000 resistor-mesh-op:50000
```
