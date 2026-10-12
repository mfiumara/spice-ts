# Issue #710: M2 scaling decks after #704, next bottleneck

Base: main `dd4e58be` (#704 and #706 merged). Head: branch `perf/m2-profile-after-704`.
Machine: Apple M5 Pro (18 cores), 48 GiB, macOS 27.0.1 arm64, Node v22.23.1,
ngspice-47 (Homebrew, KLU compiled in). Other agent lanes shared the machine
the whole time: the 1-minute load average went from 3 to 9 on 18 cores. Section 3
starts both builds at the same moment and reports process CPU time next to wall time.
The ngspice table in section 4 is **not** load-paired.

## 1. Profile on main `dd4e58be`: which hot spot

Same tooling as #702: `benchmarks/results/issue-570/scripts/prof.sh` (`node
--cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`, one
warmup plus one measured `simulate()`), `profile-summary.mjs`, and
`issue-625/scripts/incl.mjs` for inclusive times. `scripts/tree.mjs` prints the
inclusive call tree under a frame. `scripts/lines.mjs` prints per-line self time
from `positionTicks`. Raw profiles and summaries are in `profiles/`: `-before`
is main, `-after` is this branch.

Top self-time frames on main:

| deck | sampled ms | #1 | #2 | #3 | #4 |
|---|---:|---|---|---|---|
| rc-ladder-tran-1000 | 199 | buildCompanionSystem 14.3% | compileSourceTextModule 9.0% | (gc) 7.4% | attemptStep 5.9% |
| rc-ladder-tran-10000 | 930 | buildCompanionSystem 10.6% | attemptStep 10.1% | stampStaticDevices 7.1% | (gc) 6.4% |
| rc-ladder-tran-50000 | 3064 | attemptStep 9.8% | (gc) 9.5% | stampStaticDevices 8.5% | buildCompanionSystem 7.6% |
| resistor-mesh-op-10000 | 358 | factorize 22.6% | (gc) 10.2% | amdOrdering 9.7% | analyzePattern 5.7% |
| resistor-mesh-op-50000 | 2680 | factorize 48.8% | (gc) 11.0% | amdOrdering 6.6% | compile 3.7% |
| cmos-inverter-chain-tran-1000 | 586 | MOSFET.batchStamp 22.8% | (gc) 7.5% | attemptStep 7.1% | buildCompanionSystem 6.2% |
| cmos-inverter-chain-tran-10000 | 4506 | MOSFET.batchStamp 27.6% | (gc) 8.0% | mos1BulkJunctions 7.8% | convergenceTest 5.8% |

Inclusive on the RC ladder (main):

| frame | 1k | 10k | 50k |
|---|---:|---:|---:|
| `attemptStep` (transient Newton) | 30.5% | 40.9% | 44.8% |
| `buildCompanionSystem` | 19.0% | 20.5% | 24.9% |
| `solveLinearized` (factor + solve) | 2.9% | 7.3% | 6.4% |

**Which bottleneck, and why this one.** The companion build is the largest
single cost of the transient Newton loop on the RC ladder: a quarter of
`simulate()` at 50k nodes, against 6-7% for the LU factor and solve. The
counter-instrumented 50k run on main showed 236 companion builds for 119
accepted points: the ladder is linear, yet every accepted step runs **two**
Newton iterations. The first one solves the system. The second one rebuilds
the same system (same time, dt, history and device state), skips the
factorisation because its input is unchanged (`matchesFactoredInput`), solves
it to the same `x`, and only then passes the convergence test with a zero
delta. That second build and solve is pure overhead on any circuit whose
stamps do not read the Newton iterate.

The other candidates are left alone:

- Mesh OP `factorize` (49% at 50k): still the #693/#702 remaining scope, a
  supernodal or dense-block kernel that must keep the per-entry summation and
  touch order to stay bit-identical. It is a larger change and gets its own
  issue.
- `MOSFET.batchStamp` (MOS chain): already struct-of-arrays (#653). What is
  left is the MOS1 equations themselves.
- `stampPrevB` / the trapezoidal history restamp: next on the RC ladder after
  this change (section 5).

### The change

`packages/core/src/analysis/transient-step.ts`:

- New `isIterationInvariant(compiled)`, cached per compiled circuit. It is true
  only when every device is exactly a `Resistor`, `Capacitor`, `VoltageSource`
  or `CurrentSource` (prototype check, no own `stamp`/`stampDynamic`
  override), and no source is TRNOISE/TRRANDOM. Those stamps read only their
  own parameters and the stamp time, never the solution vector.
- In `attemptStep`, when an iterate is not converged, was not damped or
  limited, another iteration is allowed (`iter + 1 < itl4`), and the circuit
  is iteration-invariant, the function returns the result the next iteration
  would have produced: `ok`, this `x` (a fresh copy), `iterations: iter + 2`,
  the same `oscillated` flag. The guard checkpoint of the skipped iteration
  still runs. `assembler.solution` already holds `x`.

Why the next iteration would return exactly this: the companion build and the
solve are deterministic functions of (devices, time, dt, history, gmin, method,
solution). Only the solution changed, and no invariant device reads it. So the
matrix and RHS are bit-identical, the factorisation is skipped as unchanged,
the solve gives the same `x`, every delta is `0` (not damped, no oscillation
since `0 * d < 0` is false), and the transient convergence test passes because
`0 <= vntol + reltol * |x|`. No invariant device has a `convergenceTest`,
`limitsOwnJunctions` or `observeTransientNewton`.

`packages/core/src/mna/companion.ts`:

- The fast-path history terms for BE, trapezoidal and Gear-2 used two to four
  separate passes over the non-zeros (dynamic-row mask, `G·x(n)`, `G + kC`,
  `kC·x(n)`). They are now one column-major pass per method. Every slot and
  every row accumulator gets the same additions in the same order. `G·x(n)`
  reads a slot before the same iteration adds `kC` to it, as the separate pass
  did before the `G + kC` pass. This is the smaller part of the gain (about
  1.02x paired on the RC ladder in a separate spike, `spike-fused-pass-only.jsonl`).

Unchanged: device models, step control (#708/#709 territory), TXL/CPL,
truncation, the LU kernels, the benchmark aggregate and corpus-f harnesses.

### Tests

`packages/core/src/analysis/transient-iteration-invariant-710.test.ts`:

- `isIterationInvariant` is true for a plain R/C/V deck and false for a diode,
  an inductor, a TRNOISE source, a VCVS, and an instance `stamp` override.
- `attemptStep` on a sine + pulse-current deck with a floating capacitor, for
  BE, trapezoidal and Gear-2 with full history: the shortcut does one linear
  solve where the reference does two, and returns the same `iterations` (2),
  `oscillated` flag, solution and `assembler.solution`, compared with
  `Object.is`. The reference is the same circuit with an own `stamp` on one
  resistor that calls the prototype method (identical additions, shortcut
  disabled).
- Full `solveTransient` waveforms (time axis, every node voltage, every branch
  current) bit-identical with and without the shortcut on three linear decks:
  a pulsed RC ladder (trap), sine + pulse current with `method=gear`, and a PWL
  source through a 0 Ω branch resistor with `IC=` and `uic`.
- A frozen copy of the pre-#710 `buildCompanionSystem` fast path (main
  `dd4e58be`, renamed only) against the fused one on a MOS1 inverter pair with
  load and coupling caps and on a diode/inductor/mutual-coupling deck: 40
  random trials × 3 methods × both `staticCurrentHistory` settings × with and
  without history, comparing every `G` value and RHS entry with `Object.is`.
  Inputs include exact zeros, signed zeros and eight decades of magnitude.

Mutation checks, each fails the test file: disabling the shortcut (solve count
2 instead of 1); computing `G·x(n)` after adding `kC` in the fused trap pass;
reordering the Gear-2 history terms; re-associating `factor * cp * xj` in the
BE pass.

Existing suites run locally: `transient-step`, `transient-linear-jump`,
`transient-driver`, `transient-record`, `gilbert-peierls-equivalence` (#669
frozen-kernel oracle), `src/mna/*`, `transient-reactive-truncation-equivalence`,
`transient-ckttrunc-621`: 10 files, 63 tests, all pass.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node voltage
  and branch current as Float64 bytes. All 114 A/B samples (9 cells) give the
  same hash for both builds. The RC ladder and mesh hashes equal the #702
  evidence (`43832feb…`, `e9595100…`, `55a45c77…`, `cc196ac6…`, `73da6824…`,
  `2cc38025…`). The MOS chain hashes (`db7a45ff…`, `82429838…`, `dbda503e…`)
  differ from #702 because #703 (MOS1 device convergence test, #479) and #706
  changed main between the two cards. Before and after match here.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `dd4e58be` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`).
  100/100 identical, no child failed.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.
- The #669 frozen-kernel oracle (`gilbert-peierls-equivalence.test.ts`) is
  untouched and passes.

## 3. Paired A/B: concurrent pairs (`ab-concurrent.jsonl`, `ab-concurrent-50k.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> <rounds> ab.jsonl --concurrent <cells>`,
under `spice-heavy`. Each sample is a fresh `node` process: one warmup, then
one timed `simulate()` on the byte-identical #426 deck. Before and after of a
pair start together. Ratios are before/after, so >1 means this change is
faster. 7 rounds for the 1k/10k cells, 5 rounds for the 50k cells.

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 141 (69.5) | 101 (59.2) | 1.39x | 1.21x (1.15..1.63) | yes 43832feb6c3df0e3, 119 pts |
| rc-ladder-tran:10000 | 7 | 632 (398) | 513 (346) | 1.23x | 1.16x (1.08..1.26) | yes e9595100f7de3b38, 119 pts |
| rc-ladder-tran:50000 | 5 | 1373 (1341) | 1148 (1133) | 1.20x | 1.20x (1.18..1.21) | yes 55a45c77cca1a8fd, 119 pts |
| resistor-mesh-op:1000 | 7 | 36.9 (25.9) | 38.4 (26.2) | 0.96x | 0.95x (0.89..1.30) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 7 | 328 (227) | 315 (227) | 1.04x | 1.03x (0.91..1.11) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 5 | 1080 (1062) | 1069 (1057) | 1.01x | 1.01x (0.99..1.03) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 7 | 592 (380) | 593 (378) | 1.00x | 1.01x (0.98..1.03) | yes db7a45ff9f193198, 213 pts |
| cmos-inverter-chain-tran:10000 | 7 | 5698 (3615) | 5644 (3596) | 1.01x | 1.01x (0.99..1.02) | yes 8242983813aac963, 213 pts |
| cmos-inverter-chain-tran:50000 | 5 | 36850 (36432) | 36584 (26886) | 1.01x | 1.01x (0.99..1.36) | yes dbda503ef3935405, 213 pts |

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 278 (208) | 251 (192) | 1.11x | 1.08x (1.05..1.12) | yes |
| rc-ladder-tran:10000 | 7 | 830 (711) | 758 (648) | 1.10x | 1.10x (1.06..1.14) | yes |
| rc-ladder-tran:50000 | 5 | 2016 (1868) | 1683 (1640) | 1.20x | 1.20x (1.13..1.24) | yes |
| resistor-mesh-op:1000 | 7 | 73.1 (66.3) | 78.5 (69.8) | 0.93x | 0.96x (0.85..1.04) | yes |
| resistor-mesh-op:10000 | 7 | 428 (401) | 424 (386) | 1.01x | 1.05x (0.95..1.10) | yes |
| resistor-mesh-op:50000 | 5 | 1432 (1428) | 1434 (1416) | 1.00x | 1.01x (0.99..1.01) | yes |
| cmos-inverter-chain-tran:1000 | 7 | 738 (648) | 724 (647) | 1.02x | 1.01x (1.00..1.04) | yes |
| cmos-inverter-chain-tran:10000 | 7 | 5406 (4107) | 5445 (4112) | 0.99x | 1.00x (0.98..1.01) | yes |
| cmos-inverter-chain-tran:50000 | 5 | 41709 (40755) | 41606 (32136) | 1.00x | 1.00x (0.99..1.27) | yes |

**Reading it honestly:**

- **RC ladder.** Every pair is faster: 1.21x / 1.16x / 1.20x paired wall at
  1k / 10k / 50k, and 1.08x / 1.10x / 1.20x CPU. The 1k and 10k cells ran
  while the machine was loaded (load average 8-9), so their absolute times
  are inflated and their spreads are wide. The 50k cell ran later on a
  quieter machine and has a tight spread (1.18..1.21).
- **MOS chain.** It is not iteration-invariant (MOSFETs), so only the fused
  companion pass applies. It is unchanged at 1.00-1.01x. The 50k cell's max
  ratio of 1.36x is one load-skewed pair; the median is 1.01x.
- **Mesh OP.** This control has no transient. It reads 0.95x (0.89..1.30)
  wall and 0.96x CPU at 1k, where a sample is 26-40 ms and load dominates;
  1.03x / 1.01x at 10k / 50k. Reported as measured: no change is expected
  and the 1k reading is noise around 1.00x, not a measured regression.
- In an earlier 3-round spike (`spike-combined-3-rounds.jsonl`, the same
  change before the explicit `!limited` guard was added, which never fires
  on these decks) the RC ladder read 1.29x / 1.18x / 1.18x and MOS 1k 1.01x. The fused pass
  alone (`spike-fused-pass-only.jsonl`, 5 rounds) read 1.02x / 1.02x at
  10k / 50k.

Profiles (shares, because the after profiles ran while the A/B was running):
`attemptStep` drops from 44.8% to 30.0% of the 50k RC profile, and
`buildCompanionSystem` from 24.9% to 13.4%; at 10k from 40.9% to 27.7% and from
20.5% to 12.6%.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness with this branch's build in
`packages/core/dist`, under `spice-heavy`:
`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900`
(`scaling-m2-after.json`; table by `issue-570/scripts/scaling-table.mjs`).
Medians of 5 samples per cell. Each engine cell ran at a different moment, so
load is **not** paired across engines.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 17.2 (15.6) | 25.8 (25.6) | 14.6 | 10.7 | 0.67x (faster) | 1.36x slower | 119 / 120 |
| rc-ladder-tran | 10,000 | 153 (144) | 154 (153) | 132 | 109 | 1.00x | 1.22x slower | 119 / 120 |
| rc-ladder-tran | 50,000 | 908 (781) | 782 (764) | 796 | 599 | 1.16x slower | 1.33x slower | 119 / 120 |
| resistor-mesh-op | 1,024 | 17.9 (15.0) | 37.1 (36.2) | 12.1 | 4.9 | 0.48x (faster) | 2.49x slower | op / op |
| resistor-mesh-op | 10,000 | 192 (172) | 193 (187) | 147 | 67.2 | 1.00x | 2.18x slower | op / op |
| resistor-mesh-op | 50,176 | 2070 (2037) | 1454 (1258) | 1856 | 767 | 1.42x slower | 2.42x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 402 (389) | 335 (328) | 394 | 295 | 1.20x slower | 1.33x slower | 213 / 214 |
| cmos-inverter-chain-tran | 10,000 | 4532 (3273) | 4110 (2958) | 4446 | 3957 | 1.10x slower | 1.12x slower | 213 / 214 |
| cmos-inverter-chain-tran | 50,000 | 24345 (23521) | 56018 (54696) | 24118 | 55494 | 0.43x (faster) | 0.43x (faster) | 213 / 214 |

Probe agreement in the same run (first sample of each cell): RC ladder
`v(n10)` 0.16837649 V against 0.1683766 V (6.4e-7 relative), mesh corner
≤1.9e-7 relative at every size, and MOS chain `v(s20)` 0.34966 V against
0.35005 V (1.1e-3 relative). The engines agree, so the timings compare the
same work.

- **Losses.** spice-ts is still **slower than ngspice-47 KLU in analysis time
  on the RC ladder (1.36x / 1.22x / 1.33x), the mesh OP (2.49x / 2.18x /
  2.42x) and the MOS chain at 1k / 10k (1.33x / 1.12x)**. The 1k RC and 1k
  mesh wall-time "wins" are ngspice process startup only.
- **The mesh OP is still the deck furthest behind KLU.** This change does not
  touch it.
- **MOS chain.** This run reads 1.33x / 1.12x slower at 1k / 10k where the
  #702 run read 1.02x slower / 0.73x. Neither change is attributable to this
  PR: section 3 shows the MOS chain unchanged at 1.00-1.01x paired, and #703
  (MOS1 device convergence test) landed on main between the two runs. The
  #702 cells were unpaired too. The 50k cell reads 0.43x (spice-ts faster)
  but is **not claimed as a win**: it is unpaired, and the spice-ts paired
  samples on that cell ranged 26.9-37.8 s in this card alone.
- **RC ladder.** The analysis ratio moved from 1.95x / 1.74x / 1.52x (#702) to
  1.36x / 1.22x / 1.33x. Part of that is this change (section 3: 1.16-1.21x
  paired); the rest is load: ngspice's own analysis time on the 10k cell was
  140 ms in the #702 run and 109 ms here. Use section 3 for attribution.

## 5. Remaining scope (not in this PR)

- **Mesh OP:** `factorize` (49% of the 50k profile) needs a different kernel
  layout (supernodal or dense-block updates over shared row sets) that keeps
  the per-entry summation order and the touch order, to stay bit-identical.
  It is the deck furthest behind KLU.
- **RC ladder:** after this change the top inclusive frames under
  `advanceSolution` are `attemptStep` (one companion build and solve per step)
  and `stampPrevB`, the trapezoidal history restamp of every static device
  after each accepted point (13% of the 50k after profile). On an
  iteration-invariant circuit that restamp repeats the static part of the
  build that produced the accepted point.
- **MOS chain:** `MOSFET.batchStamp` and the MOS1 junction/limiting code; the
  `MOSFET.truncateTransientStep` path still uses the closure-based
  `truncationTimestep`.
- **A load-paired spice-ts vs ngspice run** (both started at the same moment),
  needed before the MOS chain and RC cells can be compared across cards.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof rc-ladder-tran:1000 rc-ladder-tran:10000 \
  rc-ladder-tran:50000 resistor-mesh-op:10000 resistor-mesh-op:50000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> simulate attemptStep buildCompanionSystem solveLinearized stampPrevB
node benchmarks/performance/results/issue-710/scripts/tree.mjs <x.cpuprofile> simulate 4 40
node benchmarks/performance/results/issue-710/scripts/lines.mjs <x.cpuprofile> buildCompanionSystem attemptStep
# characterisation test
pnpm -C packages/core exec vitest run src/analysis/transient-iteration-invariant-710.test.ts
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
# ngspice comparison (branch build in packages/core/dist)
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900 \
  --output=benchmarks/performance/results/issue-710/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/performance/results/issue-710/scaling-m2-after.json
```
