# Issue #486: M2 scaling decks after #475, next bottleneck

Base: main `6ce5b1b` (includes #475/PR #485, #468, #469/PR #483, #472/PR #512).
Machine: Apple M5 Pro (18 cores), Node v22.23.1, ngspice-47. The machine was
shared with other agents' test/ngspice runs the whole time (load average 15-60
on 18 cores), so wall times are 2-5x the unloaded numbers in PR #485. The
paired A/B therefore runs both builds **at the same moment** (`--concurrent`),
reports process CPU time next to wall time, and publishes the two earlier
sequential A/B runs as well, including their losses.

## 1. Profile: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> 10000 1`
(one warmup + one measured `simulate()`), summarised with
`benchmarks/performance/profile-summary.mjs`. Full summaries and the raw
`.cpuprofile` files are in `profiles/`. The before/after profile of each deck
ran concurrently, so both saw the same load.

Top self time on main `6ce5b1b` (before):

| deck (10k) | sampled | #1 | #2 | #3 | factorize |
|---|---:|---|---|---|---:|
| RC ladder `.tran 1n 100n` | 7216 ms | buildStep 16.3% | **factorize 15.3%** | GC 13.4% | 1102 ms, 15.3% |
| resistor mesh OP | 1459 ms | **factorize 39.8%** | GC 10.4% | amdOrdering 9.2% | 581 ms, 39.8% |
| MOS1 inverter chain `.tran 10p 2n` | 102709 ms | batchStamp 27.4% | stampDynamic 10.9% | stamp 9.0% | 8039 ms, 7.8% |

An earlier unloaded profile on main `1e8d9f8` (before #483 merged) had the same
shape: factorize was #1 on the RC ladder (19.6%) and the mesh (50.1%) and #4 on
the MOS chain (9.2%), behind `batchStamp` (24.2%).

Chosen hot spot: **Gilbert-Peierls `factorize`**. It is the top or second
self-time frame on two of the three decks, appears in all three, and sits in
the solver code this lane owns. `MOSFET.batchStamp` is the largest single
frame on the MOS deck, but it is device-model arithmetic in `mosfet.ts`, which
#469/PR #483 was changing at the time, and making it faster without changing
result bits is a separate job (see "Remaining scope").

### Why factorize was hot: repeated identical factorizations

`count-factorizations.mts` wraps `factorize()` and counts how often a numeric
factorization actually runs. This count is deterministic and does not depend
on machine load:

| cell | factorize() calls | numeric factorizations after this change | skipped (A bit-identical to the factored A) |
|---|---:|---:|---:|
| rc-ladder-tran 1k / 10k / 50k | 475 | 176 | 299 (62.9%) |
| resistor-mesh-op 1k / 10k / 50k | 2 | 1 | 1 (50.0%) |
| cmos-inverter-chain-tran 1k | 2724 | 2713 | 11 (0.4%) |
| cmos-inverter-chain-tran 10k | 2812 | 2801 | 11 (0.4%) |

A linear circuit restamps the same `G + 2C/dt` at a repeated timestep, and the
last Newton iteration of a converged linear solve gets the same matrix again.
Before this change each of those calls ran a full left-looking LU with pivot
search. Factorization is a deterministic function of `A`, so if `A` is
bit-identical to the input of the current factors, the change keeps the
factors. The comparison is bitwise, signed zeros included. It applies only to
the same `colPtr`/`rowIdx` arrays, and never after a failed factorization or a
new `analyzePattern`.

Profile after the change (same concurrent runs as the table above):

| deck (10k) | factorize self before | after | share before → after |
|---|---:|---:|---|
| RC ladder | 1102 ms | 301 ms | 15.3% → 4.6% |
| resistor mesh OP | 581 ms | 364 ms | 39.8% → 31.8% |
| MOS1 chain | 8039 ms | 7964 ms | 7.8% → 7.7% (unchanged, as expected) |

The new check costs `recordFactoredInput` 134 ms of 103512 ms sampled (0.1%)
on the MOS 10k deck, where it almost never hits. `matchesFactoredInput` has
no frame of its own (V8 inlines it into `factorize`), and factorize's MOS self
time is unchanged.

## 2. Results are bit-identical

- `sample.mjs` hashes (SHA-256) the time axis and every node voltage and branch
  current as Float64 bytes. The hash was identical for both builds in every
  sample of every cell, across all three A/B runs (see the hash column below).
- `corpus-hash.mts` hashes the full `EngineExecution` that the aggregate's
  spice-ts adapter (`runNativeSpiceTs`) produces for all 100 aggregate corpus
  fixtures. All 100 digests are identical between main `6ce5b1b` and this
  change (`corpus-digests-before.json` and `corpus-digests-after.json`; no
  child failures). `aggregate-report.ts --check` cannot run on main right now
  (see the PR), so this is the evidence that the parity outcome is unchanged:
  the spice-ts side is bit-identical, and the ngspice side does not depend on
  this change.
- `benchmarks/accuracy.ts --ci`: the new history entry is identical (date
  excluded) for main and this change, and "All circuits within acceptable
  error bounds".

## 3. Paired A/B

Each sample is a fresh `node` process running `sample.mjs`: one in-process
warmup, then one timed `simulate()` on the byte-identical #426 deck. The ratio
is before/after, so >1 means this change is faster.

### Primary: concurrent pairs, 9 rounds (`ab-concurrent.jsonl`)

before = main `6ce5b1b`, after = this change rebased onto it.

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 646 (416) | 609 (430) | 1.06x | 1.06x (0.97..1.15) | yes 1b2381a4bc677c0f, 235 pts |
| rc-ladder-tran:10000 | 9 | 6421 (4024) | 5943 (3803) | 1.08x | 1.08x (1.03..1.16) | yes 2ddc0c5dd0e60cfa, 235 pts |
| rc-ladder-tran:50000 | 9 | 30628 (16056) | 30251 (15772) | 1.01x | 1.06x (0.89..1.23) | yes 062a200f824d7b24, 235 pts |
| resistor-mesh-op:1000 | 9 | 92.4 (28.4) | 81.7 (26.0) | 1.13x | 1.09x (0.53..2.71) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 9 | 1051 (428) | 719 (314) | 1.46x | 1.36x (0.98..1.73) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 9 | 8535 (5961) | 5548 (3349) | 1.54x | 1.50x (1.16..1.92) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 4726 (2826) | 4686 (2757) | 1.01x | 1.02x (0.94..1.11) | yes 08c22350bc51ed62, 671 pts |
| cmos-inverter-chain-tran:10000 | 9 | 97270 (58574) | 92429 (58012) | 1.05x | 0.99x (0.90..1.05) | yes 775afceba7baa25f, 671 pts |

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) |
|---|---:|---:|---:|---:|---:|
| rc-ladder-tran:1000 | 9 | 338 (305) | 337 (284) | 1.00x | 1.01x (0.91..1.08) |
| rc-ladder-tran:10000 | 9 | 2334 (2211) | 2094 (2025) | 1.11x | 1.10x (1.04..1.16) |
| rc-ladder-tran:50000 | 9 | 12182 (11442) | 11069 (10637) | 1.10x | 1.08x (1.06..1.14) |
| resistor-mesh-op:1000 | 9 | 77.4 (52.3) | 71.3 (62.6) | 1.09x | 1.07x (0.73..1.38) |
| resistor-mesh-op:10000 | 9 | 465 (439) | 381 (357) | 1.22x | 1.21x (1.15..1.32) |
| resistor-mesh-op:50000 | 9 | 4380 (4250) | 2870 (2722) | 1.53x | 1.56x (1.42..1.61) |
| cmos-inverter-chain-tran:1000 | 9 | 2214 (2018) | 2114 (2006) | 1.05x | 1.00x (0.97..1.05) |
| cmos-inverter-chain-tran:10000 | 9 | 31098 (29533) | 31119 (30267) | 1.00x | 0.98x (0.93..1.05) |

No cell is slower in median, by wall or CPU time. The targeted cells gain:
resistor mesh OP 1.2-1.5x at 10k/50k, and RC ladder about 1.1x by CPU time
at 10k/50k. The MOS chain is neutral (the paired CPU median of 0.98x is
within its 0.93..1.05 spread). The RC ladder 1k and mesh 1k cells are mostly
startup and parse, so they barely move.

### Earlier sequential runs, published including losses

These ran on main `1e8d9f8` vs this change before the rebase. The hashes are
the same as above. Before and after ran one after the other, with the order
alternating per round, so load spikes landed on one side of a pair.
`ab-sequential-1.jsonl` has wall time only; `ab-sequential-2.jsonl` also
records CPU time.

| cell | run 1 wall median speedup (paired) | run 2 wall median speedup (paired) | run 2 CPU median speedup (paired) |
|---|---|---|---|
| rc-ladder-tran:1000 | 1.10x (1.09x) | 1.06x (1.06x) | 0.99x (1.00x) |
| rc-ladder-tran:10000 | 1.07x (1.14x) | 1.06x (0.96x) | 1.03x (1.03x) |
| rc-ladder-tran:50000 | 1.22x (1.28x) | 1.20x (1.09x) | 1.14x (1.11x) |
| resistor-mesh-op:1000 | **0.89x (0.69x)** | **0.68x (0.68x)** | **0.91x (0.97x)** |
| resistor-mesh-op:10000 | 1.26x (1.36x) | 1.32x (1.42x) | 1.24x (1.24x) |
| resistor-mesh-op:50000 | 1.73x (1.73x) | 1.37x (1.64x) | 1.55x (1.56x) |
| cmos-inverter-chain-tran:1000 | 1.10x (1.16x) | **0.91x (0.99x)** | 1.01x (1.00x) |
| cmos-inverter-chain-tran:10000 | **0.74x (0.79x)** | **0.66x (0.71x)** | **0.99x (0.90x)** |

Losses: the sequential runs measured the MOS 10k cell and the mesh 1k cell
slower in median. I attribute them to load, not to the change, for three
reasons. The MOS 10k CPU-time median in run 2 is 0.99x while its wall median
is 0.66x. The profile shows the new code at 0.1% of MOS self time, and
factorize's MOS share is unchanged. The concurrent run, where both builds see
the same load, shows neither loss. Mesh 1k runs about 20 ms, dominated by
module load and parse, and it skips one factorization of a 1k-node matrix,
roughly 1 ms of work.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks

`pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5`
on this branch, under the same shared load. The output is `scaling-m2-after.json`.

| workload | nodes | spice-ts median (min) ms | ngspice-47 KLU median (min) ms | ngspice "Total analysis time" median ms | spice-ts / ngspice (median wall) | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1000 | 179 (161) | 57 (55) | 22 | 3.12x slower | 235 / 120 |
| rc-ladder-tran | 10000 | 2119 (1979) | 554 (450) | 421 | 3.82x slower | 235 / 120 |
| resistor-mesh-op | 1000 | 18 (13) | 56 (42) | 5 | 0.32x (faster wall; slower than ngspice's 5 ms analysis) | - |
| resistor-mesh-op | 10000 | 451 (379) | 318 (279) | 78 | 1.42x slower | - |
| cmos-inverter-chain-tran | 1000 | 3230 (2929) | 629 (492) | 569 | 5.13x slower | 671 / 214 |
| cmos-inverter-chain-tran | 10000 | 46998 (38954) | 25825 (22897) | 25250 | 1.82x slower (load artifact, see below) | 671 / 214 |

spice-ts is still slower than ngspice in every cell except the mesh 1k wall
time. That cell is dominated by ngspice's process startup: ngspice's own
analysis time (5 ms) beats spice-ts's 18 ms, which also includes parse.
The harness runs each engine cell at a different moment, so load is not paired
across engines. The MOS 10k ngspice cell ran at about 8x its unloaded time
(PR #485 measured 2984 ms), so its 1.82x ratio understates the real gap. The
unloaded figures in PR #485 (RC 10k 6.9x, MOS 10k 5.3x slower) are the better
reference until an unloaded rerun.

## 5. Remaining scope (not in this PR)

- MOS chain: `MOSFET.batchStamp` (27% self) and the trapezoidal history
  restamp `MOSFET.stamp` (9-10%) dominate. Both are device-model code in
  `mosfet.ts`.
- MOS chain factorize (7.7%): every Newton iteration has a different matrix,
  so this change cannot help. A KLU-style refactor (replay the previous pivot
  sequence and pattern, falling back to a full factorization on any pivot or
  pattern deviation) could. It must be checked for bit-identity, because
  dropping exact zeros changes the pattern.
- RC ladder: `buildStep` (16-22%) builds two `Map`s per accepted step, in
  `transient-driver.ts`.
- Step count: spice-ts takes 235 / 671 timepoints where ngspice takes about
  120 / 214 (PR #485). This is a step-control question.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (one deck, one build)
node --cpu-prof --cpu-prof-dir=/tmp/prof --cpu-prof-name=rc.cpuprofile \
  benchmarks/performance/profile-scaling-m2.mjs rc-ladder-tran 10000 1
node benchmarks/performance/profile-summary.mjs /tmp/prof/rc.cpuprofile 20
# factorization counts (deterministic)
npx tsx benchmarks/results/issue-486/count-factorizations.mts
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
```
