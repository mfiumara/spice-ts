# Issue #769: pivot reuse across frequencies in the complex AC LU

After #762 (#740, AMD ordering for the complex AC LU) and #758 (#742, dctran
first step), the published spice-ts vs ngspice-47 scaling comparison was re-run
on identical decks: the #426 M2 decks (RC ladder transient, resistor mesh OP,
MOS1 CMOS inverter chain transient) and the #740 AC decks (RC ladder AC, RC
mesh AC, VCVS ladder AC), at 1k / 10k / 50k nodes.

## Measured bottleneck

The deck furthest behind ngspice-47 KLU was the RC mesh AC sweep: 4.2x (10k)
and 4.6x (50k) slower wall in the #740 receipts. Every other deck was at most
about 3x behind in analysis time, and the transient decks were near parity
(table below). In the 10k mesh AC profile on main `7f6e92fc`
(`profiles/rc-mesh-ac-10000-before.cpuprofile`, 2 `simulate()` calls) the
complex `factorize` was 75.4% of self time, 2.15 s of 2.85 s. Its line ticks
are the left-looking update loop plus the bookkeeping of a full factorization
at every frequency: the row-activation check (`pinv` lookup, 14% of
`factorize` ticks), the fill marker (6%), the insertion-sorted active list (7%)
and the column-maximum search (8%).

ngspice does not do a full factorization per frequency. `NIacIter` orders and
factors once (`SMPcReorder`), then refactors with the same pivots
(`SMPcLUfac`) at every later frequency, and reorders only when a pivot is
singular; KLU uses `klu_refactor`. The real solver already does the
equivalent for DC/transient (`GilbertPeierlsSolver.refactorWithPivots`,
#486).

## Change

`ComplexSparseSolver.factorize` first tries `refactorWithPivots`: the pivot
sequence, L/U pattern and scatter positions of the last full factorization are
reused, and each column is a gather/multiply-subtract over the stored U
pattern with no marker, activation, sort or search work. It is used only when
G and C have the same structure as at the last full factorization (shared
arrays, or equal `colPtr`/`rowIdx` contents, for a rebuilt CSC with
frequency-dependent devices). Unlike ngspice, which keeps a reused pivot until
it is singular, reuse is accepted only when the full kernel would make
exactly the same decisions on the new values:

- every reused U entry is nonzero (the full kernel skips a zero U[k,j]);
- every touched row recorded as exactly zero is still zero, and every L entry
  is nonzero (same L/U patterns, hence the same touched rows for later
  columns);
- the ngspice-47 acceptance test (#732: |re|+|im| > 1e-13 and > 1e-3 of the
  column maximum) selects the same row: the preferred row still passes, or
  the off-preference pivot is still the first column maximum in discovery
  order (ties go to the row found first, as in the full kernel; the number of
  L rows found before the pivot row is recorded per column) and the preferred
  row still fails.

Otherwise it falls back to the full factorization. Every workspace entry then
sees the same operations in the same order, so the factors and solutions are
bit-identical to a full factorization at every frequency. The full
factorization is unchanged apart from recording that data. AC, noise and
distortion use the same solver.

## Correctness

- `packages/core/src/solver/complex-sparse-solver-reuse.test.ts` compares
  with `Object.is` against a fresh solver (full factorization) at every
  frequency:
  - 60 random MNA systems (voltage sources, VCVS branches, explicit zeros),
    each swept up and down 1 Hz to 10 GHz and through omega = 0: 3,604 reused
    and 236 full factorizations; all 60 sweeps change pivots somewhere and 57
    have row swaps; solutions, row-swap counts and factor non-zeros identical;
  - a 24x24 RC mesh sweep: every point after the first reuses;
  - exact cancellation of a U entry and of an L entry (fallback, and the same
    factor pattern as a full factorization), a column-maximum tie that must
    go to the first row found, a changed row index with unchanged column
    pointers, a content-equal rebuilt CSC, re-analysis, and recovery after a
    singular factorization;
  - every AC/noise system of six corpus decks and the #732 VCVS ladder,
    captured during `simulate()`: lowpass 30/31, CEamp 498/501, ac-test
    15/16, rca3040 100/101, bjt-diffpair-ccs 42/44, d_coil 7/9 and VCVS
    ladder 43/46 factorizations reuse pivots, all bit-identical.
- RED on main: 13 of the 14 tests fail (no reuse; `pivotReuseFactorizations`
  did not exist); the singular-recovery test passes on both.
- Mutation checks (`scripts/mutants.sh`, output `mutants.txt`): 14/14
  mutants fail the tests.
- `complex-sparse-solver-equivalence.test.ts` (#740), `complex-sparse-solver.test.ts`
  and `ac-pivot-order.test.ts` (#732) stay green.
- Aggregate corpus (`issue-740/scripts/corpus-compare.mts`, the #486 digest of
  the full engine execution): **100/100 fixtures bit-identical** to main
  (`corpus-compare.json`).
- AC A/B: every sample of both builds has the same result hash per cell
  (SHA-256 over every node voltage and branch current phasor).
- Against ngspice-47 KLU on identical decks (`ngspice-klu.jsonl`) the probe
  error is unchanged from the #740 receipts, as it must be for bit-identical
  results: max difference over sweep peak 4.7e-14 (RC ladder 1k), 3.4e-13
  (10k, 50k), 5.8e-13 / 6.7e-12 / 1.2e-11 (RC mesh 1k / 10k / 50k), 4.1e-12
  (VCVS ladder). The point-wise 1.0 at the mesh 50k and VCVS ladder are points
  more than 120 dB below the peak, where ngspice prints round-off (within
  120 dB: 2.2e-11 and 4.5e-12).

## Speed

Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB, Darwin 27.0.0 arm64, Node.js
v22.23.1, ngspice-47 (Homebrew, KLU compiled in). Before = main `7f6e92fc`
(`dist` copied before the change), after = this branch. The host was shared
with other agent lanes; the 1-minute load average was 4 to 10 during the runs.

### Paired A/B, fresh processes (`ab-ac.jsonl`, `ab-mesh-50k.jsonl`, `ab-summary.md`)

`issue-740/scripts/ab.mjs`: both samples of a pair start at the same moment;
each sample is one warmup plus one timed `simulate()` (the 50k mesh without
warmup). Ratios are before/after, >1 means this change is faster.

| deck | before median | after median | paired wall ratio (min..max) | paired CPU ratio |
|---|---:|---:|---:|---:|
| rc-ladder-ac 1k (5 pairs) | 48.0 ms | 45.9 ms | 1.02x (0.97..1.07) | **0.87x** (loss) |
| rc-ladder-ac 10k (5) | 288 ms | 276 ms | 1.06x (1.04..1.10) | 0.98x |
| rc-ladder-ac 50k (5) | 1.39 s | 1.25 s | 1.11x (1.09..1.23) | 1.00x |
| rc-mesh-ac 1k (5) | 68.3 ms | 68.6 ms | 1.00x (0.94..1.40) | **0.81x** (loss) |
| rc-mesh-ac 10k (5) | 1.53 s | 690 ms | **2.24x** (2.00..2.52) | 1.84x |
| rc-mesh-ac 50k (3, no warmup) | 23.3 s | 8.24 s | **2.74x** (2.71..2.83) | 2.60x |
| vcvs-ladder-ac 2000 (5) | 249 ms | 194 ms | 1.28x (1.22..1.39) | 1.54x |

Losses: the 1k RC ladder and 1k RC mesh use 13-19% more process CPU in the
fresh-process pairs, at unchanged wall time. In-process steady state
(`steady.txt`, `issue-740/scripts/steady.mjs`, 12 runs, one build after the
other, wall/CPU ms of the last runs) both are faster, so the fresh-process CPU
goes to compiling the extra kernel in a cold process, not to the
factorization. It is still a measured loss and stays published:

| deck | before last 3 runs (wall/CPU ms) | after last 3 runs |
|---|---|---|
| rc-ladder-ac 1k | 13/15 13/17 13/14 | 12/13 12/13 11/12 |
| rc-mesh-ac 1k | 37/38 36/39 39/49 | 20/21 21/23 21/31 |
| vcvs-ladder-ac 2000 | 138/180 139/198 139/150 | 99/133 147/220 102/158 |

### Against ngspice-47 KLU (wall, fresh `ngspice -b` process; `ngspice-klu.jsonl`)

spice-ts after (one `sample.mjs` run, in-process `simulate()`) against the
median of 3 ngspice-47 KLU runs (wall includes process start and printing) and
ngspice's own `Total analysis time`:

| deck | spice-ts after | ngspice KLU wall / analysis | spice-ts vs KLU wall | #740 receipt |
|---|---:|---:|---:|---:|
| rc-ladder-ac 1k | 43 ms | 29 / 7 ms | 1.5x slower | 1.6x |
| rc-ladder-ac 10k | 343 ms | 246 / 105 ms | 1.4x slower | 2.3x |
| rc-ladder-ac 50k | 1.03 s | 608 / 372 ms | 1.7x slower | 2.7x |
| rc-mesh-ac 1k | 64 ms | 28 / 7 ms | 2.3x slower | 2.9x |
| rc-mesh-ac 10k | 570 ms | 261 / 178 ms | 2.2x slower | 4.2x |
| rc-mesh-ac 50k | 6.42 s | 2.68 / 2.31 s | 2.4x slower | 4.6x |
| vcvs-ladder-ac 2000 | 141 ms | 89 / 65 ms | 1.6x slower | 2.2x |

ngspice still wins every AC cell. The "#740 receipt" column is the ratio
published there; the two runs were not load-paired, so only the paired A/B
above is this change's attribution.

### M2 DC and transient decks (controls, `m2-table.md`)

These decks have no AC analysis and never reach the complex solver, so the
change cannot affect them; they were re-run as controls with the #426 harness
(`scaling-m2.ts --ngspice-solvers=klu --warmups=1 --runs=3`, unpaired, before
and after run one after the other). The spice-ts probe value is identical in
every sample before and after.

| deck | nodes | spice-ts total before / after | spice-ts analysis before / after | ngspice KLU wall before / after run | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 20.7 ms / 23.0 ms | 17.4 ms / 19.9 ms | 25.8 ms / 30.6 ms | 10.6 ms / 12.7 ms | 1.57x |
| rc-ladder-tran | 10,000 | 227 ms / 216 ms | 189 ms / 183 ms | 195 ms / 197 ms | 138 ms / 140 ms | 1.31x |
| rc-ladder-tran | 50,000 | 1.09 s / 1.20 s | 977 ms / 1.07 s | 1.54 s / 1.27 s | 1.27 s / 1.07 s | 1.00x |
| resistor-mesh-op | 1,024 | 14.3 ms / 12.9 ms | 9.4 ms / 8.9 ms | 22.1 ms / 23.9 ms | 2.7 ms / 3.1 ms | 2.88x |
| resistor-mesh-op | 10,000 | 140 ms / 131 ms | 109 ms / 106 ms | 130 ms / 124 ms | 45.0 ms / 43.3 ms | 2.44x |
| resistor-mesh-op | 50,176 | 847 ms / 942 ms | 713 ms / 793 ms | 793 ms / 734 ms | 429 ms / 393 ms | 2.02x |
| cmos-inverter-chain-tran | 1,000 | 207 ms / 245 ms | 203 ms / 240 ms | 182 ms / 198 ms | 158 ms / 170 ms | 1.41x |
| cmos-inverter-chain-tran | 10,000 | 2.52 s / 3.03 s | 2.47 s / 2.97 s | 3.50 s / 5.01 s | 3.38 s / 4.80 s | 0.62x |
| cmos-inverter-chain-tran | 50,000 | 49.36 s / 47.48 s | 49.06 s / 47.09 s | 62.21 s / 59.17 s | 61.43 s / 58.45 s | 0.81x |

The before/after differences on these rows (up to 20%, in both directions,
for ngspice too) are machine load, not this change. spice-ts is still slower
than KLU in analysis time on the resistor mesh OP (2.0-2.9x), the RC ladder
at 1k/10k and the 1k MOS chain. The MOS chain 10k/50k and RC 50k cells read
spice-ts at or below KLU, but they are unpaired and inside both engines'
historical spread, so they are not claimed as wins.

## Remaining scope

- The AC mesh is still 2.2-2.4x behind KLU. After this change the 10k mesh AC
  profile (`profiles/rc-mesh-ac-10000-after.cpuprofile`) is
  `refactorWithPivots` 33.6% self, the one full `factorize` 15.1%, then GC,
  the DC operating point and AMD. The next step for this deck is supernodal
  block updates in the complex kernel (as #727 did for the real LU).
- The resistor mesh OP (2.0-2.9x KLU analysis time) is the DC deck furthest
  behind: the real LU factorization and AMD on a 2-D grid.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm -C packages/core build
# copy packages/core/dist of main and of this branch to <main>/dist and <branch>/dist
pnpm -C packages/core exec vitest run src/solver/complex-sparse-solver-reuse.test.ts \
  src/solver/complex-sparse-solver-equivalence.test.ts src/solver/complex-sparse-solver.test.ts \
  src/analysis/ac-pivot-order.test.ts
bash benchmarks/performance/results/issue-769/scripts/mutants.sh
A=benchmarks/performance/results/issue-740/scripts
spice-heavy node $A/ab.mjs <main>/dist <branch>/dist 5 /tmp/ab.jsonl \
  rc-ladder-ac:1000 rc-ladder-ac:10000 rc-ladder-ac:50000 rc-mesh-ac:1000 rc-mesh-ac:10000 vcvs-ladder-ac:2000
spice-heavy node $A/ab.mjs <main>/dist <branch>/dist 3 /tmp/ab-50k.jsonl --no-warmup rc-mesh-ac:50000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
spice-heavy node $A/steady.mjs <dist> rc-mesh-ac 1000 12
node $A/sample.mjs <branch>/dist rc-mesh-ac 10000 > /tmp/s.json && node $A/ngspice.mjs rc-mesh-ac 10000 klu 3 /tmp/s.json
# corpus: <root>/packages/core/dist is the build under test
spice-heavy npx tsx $A/corpus-compare.mts <main-root> <branch-root> /tmp/corpus-compare.json
# M2 controls (run once per build) and the table
spice-heavy pnpm exec tsx benchmarks/performance/scaling-m2.ts --sizes=1000,10000,50000 \
  --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=600 --output=/tmp/m2.json
node benchmarks/performance/results/issue-769/scripts/m2-table.mjs <before.json> <after.json>
# profiles
node --cpu-prof --cpu-prof-dir=/tmp/prof $A/sample.mjs packages/core/dist rc-mesh-ac 10000
node benchmarks/performance/profile-summary.mjs /tmp/prof/<file>.cpuprofile
```
