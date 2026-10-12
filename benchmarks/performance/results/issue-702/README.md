# Issue #702: M2 scaling decks after #693, next bottleneck

Base: main `cbbafcdf` (#693 merged; #689's ngspice CKTtrunc step control was
already on main). Head: branch `perf/m2-profile-after-693`.
Machine: Apple M5 Pro (18 cores), 48 GiB, macOS 27.0.1 arm64, Node v22.23.1,
ngspice-47 (Homebrew, KLU compiled in). Other agent lanes shared the machine
the whole time (1-minute load average 6-10 on 18 cores). Section 3 starts both
builds at the same moment and reports process CPU time next to wall time. The
ngspice table in section 4 is **not** load-paired.

## 1. Profile on main `cbbafcdf`: which hot spot

`benchmarks/results/issue-570/scripts/prof.sh` runs `node --cpu-prof
benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1` (one warmup
plus one measured `simulate()`), and `benchmarks/performance/profile-summary.mjs`
summarises it. Inclusive times come from `issue-625/scripts/incl.mjs`. Raw
`.cpuprofile` files and summaries are in `profiles/`: `-before` is main,
`-after` is this branch.

Top self-time frames on main:

| deck | sampled ms | #1 | #2 | #3 | #4 | #5 |
|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | 143 | (garbage collector) 16.6% | advanceSolution 7.0% | **record (CAPtrunc)** 6.8% | compileSourceTextModule 5.4% | read 5.1% |
| rc-ladder-tran-10000 | 618 | attemptStep 12.2% | (garbage collector) 8.6% | buildCompanionSystem 8.4% | **record (CAPtrunc)** 8.1% | **chargeTruncationTimestep** 4.8% |
| resistor-mesh-op-10000 | 326 | factorize 24.0% | amdOrdering 10.5% | (garbage collector) 8.9% | compileSourceTextModule 4.3% | lockTopology 4.0% |
| cmos-inverter-chain-tran-1000 | 460 | MOSFET.batchStamp 25.9% | (garbage collector) 8.4% | refactorWithPivots 7.3% | buildCompanionSystem 4.5% | **accept (charge state)** 4.2% |

**What changed since #693.** #689 (ngspice CKTtrunc step control) merged after
the #693 measurement. The RC ladder now takes 119 timepoints and the MOS chain
213, against ngspice's 120 and 214. The step-count gap that #693 called the
largest factor on those decks is gone. In its place #689 added a per-step cost:
`LinearReactiveTruncation`, the CAPtrunc/INDtrunc estimate over every linear
capacitor and inductor. It runs once per trial point (`timestep`) and once per
accepted point (`accept`).

**Which bottleneck, and why this one.** Inclusive on main, the truncation work
on the 10k RC ladder is `timestep` 62.9 ms (10.2%) plus the `record` /
`accept` path 60.8 ms (9.9%) of a 618 ms profile, so about a fifth of
`simulate()`. At 1k it is `timestep` 14.8 ms (10.3%). Per capacitor and per
point it did this:

- went through a `() => this.record(solution)` closure, destructured
  `capacitor.nodes`, and called a `voltage()` closure twice;
- called `TransientChargeState.accept`, which branches on the truncation
  mode, runs `Array.prototype.includes` on the index list, and re-selects the
  integration rule (three divisions) for every charge;
- called `chargeTruncationTimestep`, which allocated two JS arrays (`diff`,
  `span`) on every call. That is two arrays per capacitor per trial point, and
  it shows up as GC.

The other candidates were left alone:

- Mesh OP `factorize` (24% at 10k): the remaining scope from #693 is a
  supernodal or dense-block kernel. That kernel must keep the per-entry
  summation order and the touch order, which decides pivot ties, to stay
  bit-identical. It is a larger change and gets its own issue.
- `attemptStep` / `buildCompanionSystem` (RC ladder): their self time is
  spread over many short lines, and `attemptStep` belongs to the transient
  Newton code that #479 is editing.
- `MOSFET.batchStamp` (MOS chain): it is already struct-of-arrays (#653). What
  is left is the MOS1 equations themselves.

### The change

`packages/core/src/devices/charge-state.ts`:

- `chargeTruncationTimestep` (ngspice CKTterr) computes the divided
  differences in scalars instead of two freshly allocated arrays. The
  operations and their order are the same:
  `diff[i] = (diff[i] - diff[i+1]) / span[i]` with
  `span[i] = span[i+1] + deltas[i]` between passes.
- New `TransientChargeState.acceptAll(charges)` is the batched form of
  `accept(i, charges[i])` for every `i` followed by `commit()`.
  `truncationTimestepAll(truncation, charges)` is the batched form of
  `truncationTimestep(truncation, evaluate)` where `evaluate` accepts every
  charge. Both select the rule once and run the same expressions in the same
  index order.

`packages/core/src/analysis/transient-reactive-truncation.ts`:

- `LinearReactiveTruncation` evaluates every capacitor charge and inductor
  flux into one reused `Float64Array`, then calls the two batched methods.

Unchanged: transient Newton/convergence (#479), step-control decisions,
device models, BSIM3 (#691), the MOSFET `truncateTransientStep` path (it only
picks up the allocation-free `chargeTruncationTimestep`).

Tests: `packages/core/src/analysis/transient-reactive-truncation-equivalence.test.ts`
holds frozen copies of the pre-#702 `chargeTruncationTimestep` and
`LinearReactiveTruncation` (main `cbbafcdf`, renamed only). It compares with
`Object.is` on:

- 20,000 random CKTterr inputs covering both orders, all three methods, signed
  zeros, tiny and huge magnitudes, plus degenerate deltas (0, Infinity);
- 60 random accept/reject/reset histories of the batched against the
  per-charge `TransientChargeState`, comparing the bounds and every accepted
  charge current;
- a C/L/K circuit with grounded, shorted and one-terminal capacitors, two
  mutual couplings, and a capacitance changed mid-run.

This is a characterisation test: the frozen copies are main's code, so it
passes on main by construction. Each of these mutations fails it:

- re-associating the order-2 span (`d0 + d1 + d2`);
- integrating the current before the first accepted point;
- reordering the Gear-2 current terms;
- reading the wrong inductor current in a mutual coupling.

Component microbenchmark (`truncation-micro.mts`, 10,000 capacitors, 300
calls, single runs on the loaded machine, indicative only): `timestep`
35.7 / 34.5 ns per capacitor on main against 12.4 / 12.7 ns on this branch;
`accept` 14.6 / 10.7 ns against 8.8 / 8.8 ns.

The after profiles in `profiles/*-after.*` ran under heavier load (the A/B
below was running), so compare shares, not milliseconds. The truncation
`timestep` drops from 10.2% to 2.8% of the 10k RC profile, and from 10.3% to
3.3% at 1k.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. All 114 A/B samples give the
  same hash per cell for both builds:

  | cell | hash |
  |---|---|
  | rc 1k | `43832feb6c3df0e3` |
  | rc 10k | `e9595100f7de3b38` |
  | rc 50k | `55a45c77cca1a8fd` |
  | mesh 1k | `cc196ac698927bd3` |
  | mesh 10k | `73da68241f2c6ad6` |
  | mesh 50k | `2cc3802569b2f6af` |
  | MOS 1k | `ebd938cdfd61914c` |
  | MOS 10k | `5c133955b1098361` |
  | MOS 50k | `04e66cf711d084ef` |

  The rc and MOS hashes differ from the #693 evidence because #689 changed
  those waveforms on main (119 and 213 points). Before and after match here.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `cbbafcdf` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`).
  100/100 identical, no child failed.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.
- The #669 frozen-kernel oracle (`gilbert-peierls-equivalence.test.ts`) is
  untouched by this change and passes in CI.

## 3. Paired A/B: concurrent pairs (`ab-concurrent.jsonl`, `ab-concurrent-50k.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> <rounds> ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. 7 rounds for the
1k/10k cells, 5 rounds for the 50k cells.

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 57.0 (50.9) | 53.0 (46.4) | 1.08x | 1.07x (1.04..1.11) | yes 43832feb6c3df0e3, 119 pts |
| rc-ladder-tran:10000 | 7 | 308 (265) | 277 (236) | 1.11x | 1.14x (1.10..1.16) | yes e9595100f7de3b38, 119 pts |
| rc-ladder-tran:50000 | 5 | 1500 (1447) | 1277 (1183) | 1.17x | 1.18x (1.15..1.22) | yes 55a45c77cca1a8fd, 119 pts |
| resistor-mesh-op:1000 | 7 | 17.7 (15.3) | 17.5 (15.0) | 1.01x | 1.01x (0.96..1.04) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 7 | 143 (127) | 142 (128) | 1.01x | 1.00x (0.99..1.01) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 5 | 1043 (972) | 1034 (968) | 1.01x | 0.99x (0.99..1.01) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 7 | 216 (195) | 203 (183) | 1.06x | 1.05x (1.05..1.07) | yes ebd938cdfd61914c, 213 pts |
| cmos-inverter-chain-tran:10000 | 7 | 2282 (2255) | 2092 (2059) | 1.09x | 1.09x (1.06..1.11) | yes 5c133955b1098361, 213 pts |
| cmos-inverter-chain-tran:50000 | 5 | 33898 (30867) | 30622 (21393) | 1.11x | 1.35x (1.03..1.44) | yes 04e66cf711d084ef, 213 pts |

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 164 (148) | 161 (142) | 1.02x | 1.02x (1.01..1.04) | yes |
| rc-ladder-tran:10000 | 7 | 517 (441) | 477 (406) | 1.08x | 1.05x (1.01..1.13) | yes |
| rc-ladder-tran:50000 | 5 | 2020 (1886) | 1765 (1600) | 1.14x | 1.17x (1.11..1.20) | yes |
| resistor-mesh-op:1000 | 7 | 48.4 (41.6) | 49.0 (43.2) | 0.99x | 0.98x (0.95..1.07) | yes |
| resistor-mesh-op:10000 | 7 | 247 (221) | 246 (223) | 1.00x | 0.99x (0.98..1.01) | yes |
| resistor-mesh-op:50000 | 5 | 1415 (1303) | 1411 (1303) | 1.00x | 1.00x (0.99..1.00) | yes |
| cmos-inverter-chain-tran:1000 | 7 | 396 (358) | 382 (344) | 1.04x | 1.04x (1.02..1.05) | yes |
| cmos-inverter-chain-tran:10000 | 7 | 2756 (2625) | 2461 (2430) | 1.12x | 1.10x (1.06..1.14) | yes |
| cmos-inverter-chain-tran:50000 | 5 | 37929 (34405) | 36181 (25016) | 1.05x | 1.28x (1.02..1.38) | yes |

**Reading it honestly:**

- **RC ladder.** The decks the change targets get faster, and the gain grows
  with size: every RC pair is faster, 1.07x / 1.14x / 1.18x paired wall at
  1k / 10k / 50k. CPU time gains less at 1k (1.02x), where startup and JIT
  dominate.
- **MOS chain.** It also has a 10 fF linear load capacitor per stage, and its
  MOS1 gate-charge truncation uses `chargeTruncationTimestep`. It gains
  1.05x / 1.09x wall at 1k / 10k, with tight spreads.
- **50k MOS chain.** The 1.35x paired median has a very wide spread
  (1.03..1.44). The samples swing with load: after 21.4 s / 25.1 s / 30.6 s /
  31.5 s / 42.9 s against before 30.9-44.0 s. That is load noise on 30-40 s
  runs. The defensible reading is "faster, by an amount 5 pairs cannot pin
  down". Do not quote 1.35x.
- **Mesh OP.** This control does not touch the truncation path. It is
  unchanged at 0.98-1.01x. The 1k mesh CPU ratio of 0.98x (0.95..1.07) is
  noise around 1.00x. It is reported as measured.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness with this branch's build in
`packages/core/dist`, under `spice-heavy`:
`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=5 --timeout-s=900`
(`scaling-m2-after.json`; table by `issue-570/scripts/scaling-table.mjs`).
Medians of 5 samples per cell. Each engine cell ran at a different moment, so
load is **not** paired across engines.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 31.1 (29.3) | 32.5 (31.9) | 27.5 | 14.1 | 0.96x (faster) | 1.95x slower | 119 / 120 |
| rc-ladder-tran | 10,000 | 268 (255) | 197 (196) | 244 | 140 | 1.36x slower | 1.74x slower | 119 / 120 |
| rc-ladder-tran | 50,000 | 1397 (1335) | 1063 (1024) | 1259 | 826 | 1.31x slower | 1.52x slower | 119 / 120 |
| resistor-mesh-op | 1,024 | 10.7 (9.2) | 24.1 (23.7) | 7.3 | 3.0 | 0.45x (faster) | 2.43x slower | op / op |
| resistor-mesh-op | 10,000 | 134 (128) | 128 (127) | 107 | 44.0 | 1.04x slower | 2.43x slower | op / op |
| resistor-mesh-op | 50,176 | 1289 (1213) | 807 (797) | 1145 | 421 | 1.60x slower | 2.72x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 202 (189) | 222 (221) | 197 | 194 | 0.91x (faster) | 1.02x slower | 213 / 214 |
| cmos-inverter-chain-tran | 10,000 | 2520 (2422) | 3502 (3444) | 2459 | 3351 | 0.72x (faster) | 0.73x (faster) | 213 / 214 |
| cmos-inverter-chain-tran | 50,000 | 31274 (28475) | 55625 (54395) | 31017 | 55086 | 0.56x (faster) | 0.56x (faster) | 213 / 214 |

Probe agreement in the same run (first sample of each cell): RC ladder
`v(n10)` 0.1683765 V against 0.1683766 V (6.4e-7 relative), mesh corner
≤1.9e-7 relative at every size, and MOS chain `v(s20)` 0.34966 V against
0.35005 V (1.1e-3 relative). The engines agree, so the timings compare the
same work.

- **Losses.** spice-ts is still **slower than ngspice-47 KLU in analysis time
  on the RC ladder (1.95x / 1.74x / 1.52x) and the mesh OP (2.43x / 2.43x /
  2.72x)**. The 1k RC and 1k mesh wall-time "wins" are ngspice process startup
  only.
- **The mesh OP is now the deck furthest behind KLU.** This change does not
  touch it.
- **MOS chain.** The 1k cell is at parity in analysis time (1.02x). The 10k
  and 50k cells read 0.73x and 0.56x, i.e. spice-ts faster. These cells are
  **unpaired**. ngspice's own time on the 50k cell has ranged from 55 s to
  68 s across cards on this shared machine, and spice-ts's own paired A/B
  spread on it is wide (section 3). Since #689 both engines take about the
  same number of timepoints (213 / 214), and the probe agrees to 1.1e-3.
  These are **not a claimed win** until a load-paired engine comparison
  (ngspice and spice-ts started together) confirms them. That comparison is
  remaining scope.
- **Not attributable to this PR alone.** The large drop against the #693
  table (RC 2.84x → 1.95x at 1k, MOS 2.32x → 1.02x at 1k) comes mostly from
  #689's step-count change, which landed on main between the two cards. The
  paired section 3 is the attribution for this PR.

## 5. Remaining scope (not in this PR)

- **Mesh OP:** `factorize` (24% of the 10k profile, about half at 50k) needs
  a different kernel layout (supernodal or dense-block updates over shared
  row sets) that keeps the per-entry summation order and the touch order, to
  stay bit-identical. It is now the deck furthest behind KLU.
- **RC ladder:** the remaining per-step cost is `attemptStep` and
  `buildCompanionSystem`. The companion build makes four separate passes over
  the nonzeros (dynamic-row mask, `G·x(n)`, `G + 2C/dt`, `(2C/dt)·x(n)`).
  These could fuse into one column pass while keeping per-accumulator order.
  `attemptStep` belongs to the transient Newton code that #479 is editing.
- **MOS chain:** the `MOSFET.truncateTransientStep` path still goes through
  the closure-based `truncationTimestep` with an index list. It could use a
  batched form like this one. `MOSFET.batchStamp` is still the top frame.
- **A load-paired spice-ts vs ngspice run** (both started at the same
  moment), needed before the MOS chain cells can be called anything.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof rc-ladder-tran:1000 rc-ladder-tran:10000 \
  resistor-mesh-op:10000 cmos-inverter-chain-tran:1000
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> simulate timestep accept truncationTimestep truncationTimestepAll acceptAll
# characterisation test
pnpm -C packages/core exec vitest run src/analysis/transient-reactive-truncation-equivalence.test.ts
# component microbenchmark (run on each checkout)
pnpm exec tsx benchmarks/performance/results/issue-702/truncation-micro.mts 10000
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
  --output=benchmarks/performance/results/issue-702/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/performance/results/issue-702/scaling-m2-after.json
```
