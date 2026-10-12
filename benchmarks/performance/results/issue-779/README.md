# Issue #779: M2 scaling decks after #773, next bottleneck

Base: main `e94a7deb` (#773 AC pivot reuse, #776 dctran CKTdelta, #770 merged).
Machine: Apple M5 Pro (18 logical CPUs), 48 GiB, macOS 27.0.1 arm64, Node.js
v22.23.1, ngspice-47 (Homebrew, KLU compiled in). The host was shared with other
agent lanes; 1-minute load averages are given next to each measurement.

## 1. Which deck, which bottleneck

The #426 M2 harness on main (`scaling-m2.ts --sizes=1000,10000,50000
--ngspice-solvers=klu --warmups=1 --runs=3`, `scaling-m2-before.json`, load
average 10-16 during the run) puts the **resistor mesh OP** furthest behind
ngspice-47 KLU in analysis time: 2.54x / 3.22x / 1.79x at 1k / 10k / 50k. The RC
ladder transient reads 1.19x / 1.46x / 0.91x and the MOS1 inverter chain 1.06x
/ 0.90x / 0.71x in the same run (the #769 receipts had the mesh at 2.0-2.9x
as well).

Where one mesh `simulate()` spends its time, in process, on main
(`scripts/breakdown.mts`, which wraps the solver's `analyzePattern` /
`factorize` / `solve`, `MNAAssembler.lockTopology` and `Circuit.compile` with
timers; median of 60 / 15 / 5 runs; `breakdown.txt`, load average about 3):

| mesh | simulate | compile | lockTopology | analyzePattern (AMD) | factorize | solve | other |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1,024 | 3.46 ms | 1.35 | 0.28 | 0.42 | 0.79 | 0.04 | 0.52 |
| 10,000 | 52.5 ms | 14.3 | 4.4 | 5.8 | **21.2** | 0.7 | 6.2 |
| 50,176 | 504 ms | 104 | 26 | 74 | **266** | 4.8 | 36 |

`factorize` is the largest phase at 10k and 50k (40-53% of `simulate`), and in
the CPU profiles (`profiles/resistor-mesh-op-*-before.cpuprofile`) its
supernodal block update `applySupernode` (#727) is the largest JavaScript
self-time frame of the 10k and 50k runs (only the garbage collector is larger
at 10k). A linear mesh needs exactly one numeric factorization
(the second Newton iteration has bit-identical values and reuses the factors),
so this is the cost of the one full LU: 218 M multiply-subtracts at 50k
(`issue-727/factor-stats-after.md`). At 1k, `compile` is the largest phase;
see remaining scope.

Per-line ticks in `applySupernode` on the 50k profile pointed at two things:

- the four-row loop over the rows below the supernode tested
  `v === 0` for all four rows on every member and loaded the member slot
  through `applied[t]`, although after the first member nearly every row is
  already settled, which makes the activation step a no-op;
- the triangular part (the members' own U entries) updated the member rows
  column by column, a strided walk over the row-major block with a load and a
  store of `workspace[row]` per multiply-subtract.

## 2. Change

`packages/core/src/solver/gilbert-peierls.ts`, `applySupernode` only (the
column-at-a-time path, `refactorWithPivots`, the solve, AMD and the pivoting
rules are unchanged):

- **Rows below the supernode.** A four-row group runs the checked loop only
  until all four rows are settled, then applies the remaining members with
  plain multiply-subtracts. A settled row stays settled for the rest of the
  column, and `activateRow` returns immediately for a settled row, so skipping
  the test changes nothing. When no member was skipped (no exact-zero U entry),
  member `t` sits in slot `first - s0 + t` and is read directly. The single-row
  remainder loop does the same.
- **Triangular part.** Each member's U entry is computed row by row:
  `u = workspace[row] - Σ L[row, m'] · u[m']` over the earlier applied members
  in ascending order, accumulated in a register over the contiguous block row,
  and written back before the zero test.

Every workspace entry receives the same subtractions in the same order as
before, and the touched-row list, activation order and pivot choices are
unchanged, so **the factors are bit-identical**.

## 3. Correctness

- `gilbert-peierls-equivalence.test.ts` (frozen pre-#669 kernel, `Object.is`
  on perm, L/U pointers, rows and values) keeps passing, and a new
  `describe('GilbertPeierlsSolver supernodal fast paths (#779)')` adds:
  - 60 cancelling small-integer grids (AMD and natural order), each
    refactorized three times with about half the values scaled by
    `1 + 2^-30` on the same structure arrays (pivot reuse attempted, exact
    cancellations broken);
  - a hand-built supernode whose member U entry cancels to exactly zero while
    its A entry is nonzero: the zero must be recorded, so a perturbed
    refactorization must fall back instead of reusing the pivots;
  - 60 grids with about half of the off-diagonal entries near 1e-170, so
    L·U products underflow to exactly zero inside supernodal updates (a row
    left unsettled by an underflowing first update must still be activated
    by a later one).
  The #727 cancelling-grid test now builds its matrices through the shared
  `cancellingGrid` helper; it draws the same random sequence as before.
- These are guard tests: they also pass on main. Mutation checks
  (`scripts/mutants.sh`, `mutants.txt`): **8/8 mutants of the new code fail
  them** (group check ends at the first settled row; checked phase skipped;
  consecutive slots assumed after a skipped member; consecutive-slot
  off-by-one; reversed member order in the indirect loop; remainder row
  checked only once; member value not written back; reversed member order in
  the triangular part). Before the two new underflow/cancellation cases were
  added, the "checked only once" and "not written back" mutants survived.
- Targeted suites: `pnpm -C packages/core exec vitest run src/solver src/mna
  src/analysis src/simulate.test.ts` → 65 files, 639 tests passed.
  `pnpm -C packages/core build` and `pnpm -C packages/core lint` pass.
- Aggregate corpus (`issue-740/scripts/corpus-compare.mts`, the #486 digest of
  the full `EngineExecution`): **100/100 fixtures bit-identical** to main
  (`corpus-compare.json`).
- Every paired A/B sample below has the same result hash in both builds, and
  the mesh hashes equal the #727 receipts (`cc196ac6…`, `73da6824…`,
  `2cc38025…`).
- Probe values against ngspice-47 KLU are unchanged (bit-identical results):
  mesh 0.18213973387412954 / 0.14407498220042814 / 0.125507584809263 vs
  ngspice 0.1821397 / 0.144075 / 0.1255076 (ngspice prints 7 digits).

## 4. Speed

### Kernel only (`factor-bench.txt`, load average about 3)

`scripts/fresh-factor-bench.mts`: a new `GilbertPeierlsSolver`,
`analyzePattern`, then a full `factorize()` of a side x side grid MNA, as in
every `simulate()`; 9 calls per process, three alternating process pairs;
main's `gilbert-peierls.ts` loaded through `GP_MODULE`.

| grid | main median ms (3 processes) | branch median ms | speedup |
|---|---|---|---:|
| 32 x 32 | 1.0 / 1.1 / 0.9 | 0.9 / 1.0 / 1.0 | none (noise) |
| 100 x 100 | 20.5 / 20.7 / 20.8 | 16.5 / 16.6 / 16.8 | 1.24x |
| 224 x 224 | 218.7 / 221.3 / 218.9 | 154.1 / 155.9 / 159.5 | **1.41x** |

### In process, inside `simulate()` (`breakdown.txt`, two alternating rounds)

| mesh | factorize main → branch | simulate main → branch |
|---|---|---|
| 1,024 | 0.79 / 0.85 → 0.78 / 0.77 ms | 3.46 / 3.89 → 3.49 / 3.45 ms |
| 10,000 | 21.2 / 21.2 → 17.1 / 17.2 ms (1.24x) | 52.5 / 54.2 → 50.5 / 49.1 ms (1.04-1.10x) |
| 50,176 | 266 / 268 → 200 / 201 ms (1.33x) | 504 / 508 → 485 / 474 ms (1.04-1.07x) |

The factorization gain is diluted end to end because `compile`, AMD,
`lockTopology` and parsing are unchanged.

### Paired fresh-process A/B (`ab-concurrent.jsonl`, `ab-summary.md`)

`benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 7 … --concurrent`
under `spice-heavy`: both samples of a pair start together in fresh `node`
processes (one warmup, one timed parse + `simulate()`); ratios before/after,
>1 = this change is faster. Load average 4.7-6.2.

| cell | before median (min) ms | after median (min) ms | paired wall ratio (min..max) | paired CPU ratio | hash identical |
|---|---:|---:|---:|---:|---|
| rc-ladder-tran 1k | 49.7 (42.8) | 50.0 (40.6) | 1.01x (0.99..1.05) | 0.99x | yes |
| rc-ladder-tran 10k | 251 (196) | 256 (200) | **0.98x** (0.96..1.03) | 0.99x | yes |
| rc-ladder-tran 50k | 1320 (1086) | 1336 (1115) | 1.00x (0.97..1.01) | 1.01x | yes |
| resistor-mesh-op 1k | 20.6 (17.7) | 20.3 (17.4) | 1.01x (0.98..1.07) | 1.02x | yes |
| resistor-mesh-op 10k | 158 (139) | 154 (136) | 1.02x (0.96..1.08) | 1.02x | yes |
| resistor-mesh-op 50k | 989 (905) | 848 (770) | **1.14x** (1.10..1.27) | 1.12x | yes |
| cmos-inverter-chain-tran 1k | 259 (248) | 258 (253) | 1.00x (0.97..1.03) | 1.00x | yes |
| cmos-inverter-chain-tran 10k | 2660 (2560) | 2622 (2563) | 1.00x (0.99..1.02) | 1.00x | yes |

Reading it honestly:

- **Mesh 50k:** 1.14x wall / 1.12x CPU, consistent with the kernel and
  in-process numbers.
- **Mesh 10k:** 1.02x, inside the spread of the pairs (0.96..1.08); the
  in-process factorization gain (21 → 17 ms) is about 3% of a fresh-process
  sample.
- **Mesh 1k:** no change. Its supernodes are small and the factorization is
  under 1 ms.
- **RC ladder 10k: 0.98x wall (0.96..1.03), 0.99x CPU.** Its L factor has one
  entry per column and no supernodes, so `applySupernode` never runs; the
  reading is inside the noise of the other RC cells, but it is a measured
  loss and stays published.
- **MOS chain:** its full factorizations have no L entries, so nothing
  changed (1.00x).

### Against ngspice-47 KLU (same decks)

The #426 harness re-run on this branch (`scaling-m2-after.json`,
`m2-table.md`, load average 5-7.5) against the main run
(`scaling-m2-before.json`, load average 10-16). The two runs were not
load-paired: ngspice's own analysis time moved by up to 2.5x between them (RC
ladder 1k 56.3 → 22.7 ms), so the before/after columns are **not** this
change's attribution; the paired A/B above is.

| deck | nodes | spice-ts analysis before / after | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run |
|---|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 67.1 ms / 34.9 ms | 56.3 ms / 22.7 ms | 1.54x |
| rc-ladder-tran | 10,000 | 550 ms / 283 ms | 376 ms / 276 ms | 1.03x |
| rc-ladder-tran | 50,000 | 2.60 s / 1.45 s | 2.86 s / 883 ms | 1.65x |
| resistor-mesh-op | 1,024 | 15.8 ms / 7.9 ms | 6.2 ms / 3.5 ms | 2.28x |
| resistor-mesh-op | 10,000 | 250 ms / 142 ms | 77.7 ms / 61.3 ms | 2.32x |
| resistor-mesh-op | 50,176 | 1.30 s / 1.07 s | 727 ms / 568 ms | 1.89x |
| cmos-inverter-chain-tran | 1,000 | 390 ms / 333 ms | 367 ms / 237 ms | 1.40x |
| cmos-inverter-chain-tran | 10,000 | 4.83 s / 4.01 s | 5.37 s / 5.71 s | 0.70x |
| cmos-inverter-chain-tran | 50,000 | 40.32 s / 42.61 s | 56.72 s / 58.93 s | 0.72x |

**ngspice-47 KLU still wins the resistor mesh (1.9-2.3x), the RC ladder (1.0-1.7x)
and the 1k MOS chain (1.4x) in this run.** The MOS chain 10k/50k cells read
spice-ts faster (0.70x / 0.72x), as in earlier runs, but they are unpaired and
are not claimed as wins.

A quieter ngspice-only run of the mesh decks (`ngspice-klu-acct.txt`, three
`ngspice -b` runs each, load average about 3) splits its analysis time:

| mesh | ngspice total analysis | reorder (AMD + first factor) | factor (2 refactors) | spice-ts AMD + factorize, branch (in process) | spice-ts simulate, branch (in process) |
|---|---:|---:|---:|---:|---:|
| 1,024 | 2.2 ms | 0.5 ms | 0.12 ms | 1.2 ms | 3.5 ms |
| 10,000 | 31.5 ms | 13.3 ms | 4.5 ms | 23 ms | 50 ms |
| 50,176 | 302 ms | 161 ms | 64 ms | 255 ms | 474-485 ms |

So on the 50k mesh spice-ts's sparse LU work (AMD plus one full
factorization) is now within about 1.1x of KLU's (reorder plus two
refactorizations), and the rest of the gap is outside the solver.

## 5. Remaining scope

- **`Circuit.compile`** is the largest phase at 1k and the second largest at
  10k and 50k (1.4 / 15 / 103-117 ms; 39% of `simulate` at 1k). About half of
  its 50k profile is the case-folded name maps from #763
  (`CaseInsensitiveMap.set` for the device map, `CaseFoldedNameSet.canonical`
  plus `toUpperCase` in `resolveNode` for every node reference); the 1k
  profile also shows a `TransientNoiseContext` (Wallace generator) built for
  every compile even
  without transient noise sources. This is in `circuit.ts` / `case-fold.ts`,
  next to the parser/name-folding lane, so it is left for a separate card.
- **AMD ordering** (6 / 54-74 ms at 10k / 50k) has no single hot line.
- **The left-looking heap** of active columns (`heapPush` / `heapPopMin`,
  about 25 ms of the 50k factorization): supernode member keys are pushed and
  then popped one by one.
- An eight-row variant of the block update was measured and gave about 3%
  more on the 50k kernel; it was not kept.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm -C packages/core build
# copy packages/core/dist of main and of this branch to <main>/dist and <branch>/dist
pnpm -C packages/core exec vitest run src/solver/gilbert-peierls-equivalence.test.ts
bash benchmarks/performance/results/issue-779/scripts/mutants.sh
S=benchmarks/performance/results/issue-779/scripts
npx tsx $S/breakdown.mts resistor-mesh-op 10000 15          # src build; swap gilbert-peierls.ts for main
GP_MODULE=<path to main's gilbert-peierls.ts next to this one> npx tsx $S/fresh-factor-bench.mts 224 9
npx tsx $S/fresh-factor-bench.mts 224 9
spice-heavy node benchmarks/results/issue-486/ab.mjs <main>/dist <branch>/dist 7 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:1000 \
  resistor-mesh-op:10000 resistor-mesh-op:50000 cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus: <root>/packages/core/dist is the build under test
spice-heavy npx tsx benchmarks/performance/results/issue-740/scripts/corpus-compare.mts <main-root> <branch-root> /tmp/corpus.json
spice-heavy pnpm exec tsx benchmarks/performance/scaling-m2.ts --sizes=1000,10000,50000 \
  --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=600 --output=/tmp/m2.json
node benchmarks/performance/results/issue-769/scripts/m2-table.mjs <before.json> <after.json>
node --cpu-prof --cpu-prof-dir=/tmp/prof benchmarks/performance/profile-scaling-m2.mjs resistor-mesh-op 50176 3
node benchmarks/performance/profile-summary.mjs /tmp/prof/<file>.cpuprofile
```

`ngspice-klu-acct.txt` was produced by `ngspice -b` (with `option klu` in
`.spiceinit`) on the `m2Netlist('resistor-mesh-op', n)` decks, with one extra
`.options acct` line before `.end` (the deck already sets it).
