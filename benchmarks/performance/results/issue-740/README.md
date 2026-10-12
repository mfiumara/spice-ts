# Issue #740: fill-reducing column ordering for the complex AC LU

`ComplexSparseSolver` (AC, noise, distortion) factored `G + jωC` in natural
MNA column order. Since #732 it pivots like ngspice-47 Sparse, so a weak node
diagonal next to a voltage-source/VCVS branch forces row swaps, and in a fixed
order their fill cascades. On mesh-like circuits the natural order also fills
like a band matrix whether or not rows swap.

The complex LU now has the real Gilbert-Peierls solver's structure (that file is
untouched):

- `analyzePattern` builds the union pattern of G and C, orders it with
  `amdOrdering` (#444/#693), then puts structural column singletons first
  (`column-singletons.ts`, a copy of `columnSingletonsFirst` from
  `gilbert-peierls.ts`). Both run once per topology.
- `factorize` visits original column `colPerm[k]` at step k and prefers row
  `rowPref[k]` (the permuted diagonal). The ngspice-47 pivot acceptance of
  #732 (|re| + |im| above 1e-13 and above 1e-3 of the column maximum) is
  unchanged.
- `solve` scatters the solution back through the column order.
- The Set-based natural-order symbolic fill prediction is gone. The factor
  buffers start from the structural estimate and grow on demand, as before.
- `factorNonzeros()` and `rowSwaps()` diagnostics; a `{ ordering: 'natural' }`
  option keeps the MNA order for A/B and tests.

Not done here (remaining scope): reusing the first frequency's pivot order like
ngspice `NIacIter` (reorder only on a bad pivot), supernodal updates in the
complex kernel, and deduplicating `columnSingletonsFirst` once
`gilbert-peierls.ts` may be edited.

Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB, Darwin 27.0.0 arm64, Node.js
v22.23.1, ngspice-47 (Homebrew, KLU compiled in). Before = main `fce4c99b`
(`dist` copied before the change), after = this branch. The host was shared
with other agent lanes; the 1-minute load average was 4 to 11 during the runs.

## 1. Correctness: results agree within round-off

`packages/core/src/solver/complex-sparse-solver-equivalence.test.ts`:

- Frozen oracle: the pre-#740 natural-order kernel, copied verbatim. On main it
  reproduces the solver bit-for-bit (max difference 0 on every corpus system),
  so the oracle is faithful.
- 240 random MNA systems (60 seeds x 4 frequencies, 8 to 44 nodes, voltage
  sources, VCVS branches, capacitors from 1 fF to 1 nF, exact cancellation,
  explicit zeros; 228 of 240 force row swaps): the normwise backward error of
  the new solver is at most 3.5e-16 (asserted < 1e-14; the frozen kernel
  reaches 1.7e-15 on the same systems). Forward differences against the
  frozen kernel and against dense complex Gaussian elimination stay within
  64·n·ε·cond∞(A) (computed). The largest is 2.0e-6 relative, on an
  ill-conditioned ω = 0 system; it is a conditioning effect, not a solver one.
- Every AC system that real decks hand to the solver, captured during
  `simulate()`: max relative difference against the frozen kernel and backward
  error per deck:

  | deck | solves | max rel. diff vs natural order | max backward error |
  |---|---:|---:|---:|
  | ngspice tests/filters/lowpass.cir | 31 | 0 | 7.6e-21 |
  | ngspice tests/vbic/CEamp.cir | 501 | 1.7e-14 | 9.0e-16 |
  | ngspice examples/probe/ac-test.cir | 16 | 2.2e-16 | 2.2e-19 |
  | classic spice3f5/rca3040.cir | 101 | 1.6e-14 | 1.7e-17 |
  | corpus-e d_bjt-diffpair-ccs.ckt | 44 | 1.4e-15 | 3.4e-18 |
  | corpus-e d_coil.1.ckt | 9 | 3.2e-16 | 5.8e-17 |
  | generated VCVS ladder (200 stages) | 46 | 3.4e-13 | 4.3e-18 |

- 2-D meshes (30 x 30, edges as resistors in G, or as capacitors in C with G
  only diagonal): L+U non-zeros at most 1.05x the real AMD solver's on the same
  pattern, below half of the natural order, no row swaps, and the same answer
  as the frozen kernel and the natural order within 1e-11.
- RED on main: the random-system and mesh-fill tests failed (no arithmetic
  changed, and `factorNonzeros` did not exist).
- Mutation checks (`scripts/mutants.sh`, output `mutants.txt`): 12/12 mutants
  fail the tests: solve skips the column unpermute; factorize scatters natural
  columns; row permutation starts at identity; default ordering natural; no
  singletons first; union pattern ignores C; union pattern ignores G; singleton
  claims an already-claimed row; preferred rows not symmetric; backward
  substitution uses y for z; relative pivot threshold dropped; row-swap counter
  never increments.
- Existing tests: `ac-pivot-order.test.ts` (#732 card-order test against
  ngspice-47) and `complex-sparse-solver.test.ts` stay green.

### Aggregate corpus

`scripts/corpus-compare.mts` (the #486 corpus-hash digest plus a value
comparison) on all 100 aggregate fixtures, before vs after
(`corpus-compare.json`): 91/100 are bit-identical. The other 9 are the AC,
noise and distortion fixtures. They keep the same status, convergence,
analyses, grids and signal lists; the largest difference relative to the
analysis peak is 1.75e-13:

| fixture | analyses | max diff / analysis peak | worst signal (own peak, diff) |
|---|---|---:|---|
| ngspice/vbic-common-emitter-ac | ac, pz | 1.7e-14 | ac v(q1.xf1) (42.9, 2.7e-11) |
| ngspice/probe-ac | ac | 2.2e-16 | ac v(3) (0.333, 1.7e-16) |
| classic/bjt-noise | noise | 4.9e-16 | inoise_spectrum (4.4e-10, 2.6e-25) |
| classic/diode-distortion | disto | 1.8e-13 | v(1) (3.0e-23, 3.0e-23) |
| classic/rca3040-wideband-amplifier | ac, dc, tran | 1.0e-14 | ac v(2) (4.0e-14, 4.0e-14) |
| corpus-e/cccs-mixed-analysis | op, tran, ac | 3.1e-19 | ac i(v7) (1.1, 2.7e-16) |
| corpus-e/mutual-inductance-ac | ac, tran | 3.1e-16 | ac i(v1) (0.045, 3.8e-17) |
| corpus-e/bjt-diffpair-ac | dc, tran, op, ac | 1.0e-15 | ac v(9) (6.9e-20, 6.9e-20) |
| corpus-e/bjt-diffpair-current-source | op, tran, ac | 1.3e-15 | ac v(9) (4.2e-19, 4.2e-19) |

The "worst signal" column lists signals that are round-off around zero (an AC
supply node at 1e-19 V, a distortion product at 1e-23 V): relative to their
own peak they change completely, relative to the analysis they are
1e-13 or less. The AC digests are therefore not bit-identical, and cannot be
with a different elimination order. `aggregate-report.ts --check` could not
judge this: on main it already stops at stale `SOURCES.md` and fixture-tree
pins (owned by the aggregate lane), before any simulation.

`benchmarks/accuracy.ts --ci` passes in CI (`accuracy` job).

### Against ngspice-47 on identical decks

`scripts/ngspice.mjs` runs the byte-identical deck (hashes in
`benchmarks/SOURCES.md`) in ngspice-47 with `option klu` or `option sparse`
and `set numdgt=15` in a per-run `.spiceinit`, and compares the probe phasor
at every frequency (`ngspice-small.jsonl`, `ngspice-large.jsonl`):

| deck | probe | max diff / sweep peak, KLU (before → after) | Sparse 1.3 (before → after) |
|---|---|---:|---:|
| rc-ladder-ac 1k | v(n10) | 5.8e-14 → 4.7e-14 | 4.6e-14 → 4.1e-14 |
| rc-mesh-ac 1k | v(n31_31) | 4.2e-13 → 5.8e-13 | 4.3e-13 → 1.5e-13 |
| vcvs-ladder-ac 2000 | v(x2000) | 4.5e-12 → 4.1e-12 | 3.5e-12 → 3.6e-12 |
| rc-ladder-ac 10k / 50k | v(n10) | after 3.4e-13 / 3.4e-13 | after 4.1e-13 / 4.1e-13 |
| rc-mesh-ac 10k / 50k | corner | after 6.7e-12 / 1.2e-11 | not run |

Per point, within 120 dB of the peak, the differences are the same order
(largest 2.2e-11, mesh 50k). On the VCVS ladder the probe is more than 120 dB
below its 1.1e12 peak above about 1.1 MHz (149 of 451 points), and at the top
of the sweep spice-ts returns exactly 0 where ngspice prints a round-off-level
value, so the per-point relative difference there is 1, before and after.

## 2. Speed

### Paired A/B, fresh processes (`scripts/ab.mjs`, `ab-summary.md`)

Both samples of a pair start at the same moment; each sample is one warmup plus
one timed `simulate()` (the 10k/50k mesh without warmup). Ratios are
before/after, >1 means this change is faster.

| deck | before median | after median | paired wall ratio (min..max) | paired CPU ratio |
|---|---:|---:|---:|---:|
| rc-ladder-ac 1k (5 pairs) | 58.0 ms | 60.8 ms | **0.93x** (0.86..1.06) | **0.96x** |
| rc-ladder-ac 10k (5) | 450 ms | 397 ms | 1.10x (1.02..1.13) | 1.07x |
| rc-ladder-ac 50k (5) | 2.17 s | 1.95 s | 1.07x (1.00..1.11) | 1.02x |
| rc-mesh-ac 1k (5) | 435 ms | 129 ms | 3.57x (3.11..3.96) | 2.14x |
| rc-mesh-ac 10k (3, no warmup) | 19.73 s | 1.30 s | 14.47x (12.60..15.28) | 12.05x |
| rc-mesh-ac 50k | 528 s (1 sample) | 15.7 s (3 samples) | about 34x, unpaired | - |
| vcvs-ladder-ac 2000 (5) | 429 ms | 307 ms | 1.35x (1.09..1.40) | **0.86x** |

Losses: the 1k RC ladder is 7% slower in the paired fresh-process run. Its
natural order is already fill-free, so AMD only adds ordering time. The
VCVS ladder's fresh-process CPU time is 14% higher while its wall time is 1.35x
lower. In-process steady state (`scripts/steady.mjs`, `steady.txt`; median of
runs 7-12 of 12, run one build after the other, not paired) both are faster:

| deck | before wall / CPU | after wall / CPU |
|---|---:|---:|
| vcvs-ladder-ac 2000 | 254 / 280 ms | 122 / 161 ms |
| rc-ladder-ac 1k | 15 / 24 ms | 12 / 14 ms |
| rc-mesh-ac 1k | 198 / 209 ms | 37 / 40 ms |

So the fresh-process CPU loss comes from the second run of a cold process
(background compilation and GC threads), not from the factorization. It is
still a measured loss and stays published.

The 50k mesh before-sample ran alone once (528 s wall, 527 s CPU, 13 AC
points). Repeating it as a pair would hold a shared heavy slot for about
30 minutes, so it was not paired; read it as "about 34x", not a precise ratio.

### Factorization statistics (`scripts/factor-stats.mts`, `factor-stats.md`)

First frequency point, natural order (MNA order plus singletons first) against
AMD, in one process:

| deck | n | L+U natural | L+U AMD | row swaps natural / AMD | first factorize natural / AMD |
|---|---:|---:|---:|---:|---:|
| vcvs-ladder-ac 2000 | 2202 | 11,761 | 6,523 | 113 / 60 | 6.8 / 0.5 ms |
| rc-ladder-ac 1k | 1001 | 4,940 | 3,000 | 0 / 0 | 0.2 / 0.1 ms |
| rc-ladder-ac 10k | 10001 | 49,920 | 30,000 | 0 / 0 | 2.0 / 1.1 ms |
| rc-mesh-ac 1k | 1025 | 105,472 | 23,088 | 0 / 0 | 29.3 / 3.8 ms |
| rc-mesh-ac 10k | 10001 | 3,756,264 | 396,986 | 0 / 0 | 3533 / 96 ms |

AMD and the singleton pass cost 1.5 to 8.6 ms of `analyzePattern` on these
decks, once per topology. The VCVS ladder here is rebuilt from the issue text
(2202 unknowns; the issue's deck had 2162), so its counts are not the issue's
L = 42,542 / 160 swaps.

### Existing AC benchmark generators (`scripts/gen-ab.mts`, `gen-ab.md`)

In-process, 21 alternating rounds per deck after two warmups each:

| deck | before | after | paired ratio median (min..max) | max rel. difference |
|---|---:|---:|---:|---:|
| rcChainAC(1000) | 32.1 ms | 31.3 ms | 1.02 (0.51..2.04) | 7.9e-15 |
| rcChainAC(5000) | 143 ms | 133 ms | 1.02 (0.73..1.32) | 7.9e-15 |
| bjtCEAmplifier | 1.41 ms | 1.50 ms | 0.96 (0.48..1.84) | 2.8e-10 |
| mosfetCSAmplifier | 0.99 ms | 1.03 ms | 1.04 (0.60..2.00) | 0 |
| cascodeAmplifier | 2.22 ms | 2.05 ms | 0.99 (0.23..1.66) | 1.8e-19 |
| foldedCascodeOpAmp | 5.80 ms | 5.38 ms | 1.07 (0.68..1.45) | 5.9e-16 |

No change beyond noise on these small decks; bjtCEAmplifier reads 4% slower
at a ratio spread of 0.48 to 1.84.

### Against ngspice-47 (wall, fresh `ngspice -b` process)

spice-ts after (A/B median, in-process `simulate()`) against ngspice-47 wall
median (includes process start and printing) and ngspice's own analysis time:

| deck | spice-ts after | ngspice KLU wall / analysis | ngspice Sparse wall / analysis | spice-ts vs KLU wall |
|---|---:|---:|---:|---:|
| rc-ladder-ac 1k | 60.8 ms | 38-40 / 9.5-9.9 ms | 35-39 / 5.9-6.7 ms | 1.6x slower |
| rc-ladder-ac 10k | 397 ms | 172 / 91 ms | 139 / 56 ms | 2.3x slower |
| rc-ladder-ac 50k | 1.95 s | 726 / 432 ms | 620 / 326 ms | 2.7x slower |
| rc-mesh-ac 1k | 129 ms | 44 / 11 ms | 81-83 / 45-47 ms | 2.9x slower |
| rc-mesh-ac 10k | 1.30 s | 307 / 210 ms | not run | 4.2x slower |
| rc-mesh-ac 50k | 15.7 s | 3.40 / 2.94 s | not run | 4.6x slower |
| vcvs-ladder-ac 2000 | 307 ms | 138-144 / 100-107 ms | 110-129 / 70-72 ms | 2.2x slower |

ngspice wins every cell. Before this change the 10k and 50k meshes were 64x and
155x slower than ngspice KLU wall; the remaining gap is the complex kernel
itself (no supernodes, no pivot reuse across frequencies).

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm -C packages/core build
# copy packages/core/dist of main and of this branch to <main>/dist and <branch>/dist
pnpm -C packages/core exec vitest run src/solver/complex-sparse-solver-equivalence.test.ts \
  src/solver/complex-sparse-solver.test.ts src/analysis/ac-pivot-order.test.ts
bash benchmarks/performance/results/issue-740/scripts/mutants.sh
S=benchmarks/performance/results/issue-740/scripts
spice-heavy node $S/ab.mjs <main>/dist <branch>/dist 5 /tmp/ab.jsonl \
  rc-ladder-ac:1000 rc-ladder-ac:10000 rc-ladder-ac:50000 rc-mesh-ac:1000 vcvs-ladder-ac:2000
spice-heavy node $S/ab.mjs <main>/dist <branch>/dist 3 /tmp/ab-10k.jsonl --no-warmup rc-mesh-ac:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
spice-heavy node --max-old-space-size=8192 $S/sample.mjs <dist> rc-mesh-ac 50000 --no-warmup
spice-heavy node $S/steady.mjs <dist> vcvs-ladder-ac 2000 12
spice-heavy npx tsx $S/gen-ab.mts <main>/dist <branch>/dist 21
spice-heavy npx tsx $S/factor-stats.mts vcvs-ladder-ac:2000 rc-ladder-ac:1000 rc-ladder-ac:10000 rc-mesh-ac:1000 rc-mesh-ac:10000
# ngspice-47: a spice-ts sample with probe values, then the comparison
node $S/sample.mjs <branch>/dist rc-mesh-ac 1000 > /tmp/s.json
node $S/ngspice.mjs rc-mesh-ac 1000 klu 5 /tmp/s.json
# corpus: <root>/packages/core/dist is the build under test
spice-heavy npx tsx $S/corpus-compare.mts <main-root> <branch-root> /tmp/corpus-compare.json
```
