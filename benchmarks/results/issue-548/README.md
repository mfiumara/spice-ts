# Issue #548: M2 scaling decks after #541 LU reuse, next bottleneck

Base: PR #541 head `5de4a79` (LU-factor reuse, #486) on main `6ce5b1b`. #541
was not merged when this ran, so this branch is stacked on it.
Machine: Apple M5 Pro (18 cores), Node v22.23.1, ngspice-47 (KLU compiled in).
The machine was shared with other agents the whole time, at load average
130-260 on 18 cores. Wall times are therefore several times the unloaded
numbers in `benchmarks/PERFORMANCE_BASELINE.md` and swing a lot between
samples. The A/B below runs both builds at the same moment and reports process
CPU time next to wall time. CPU time is the more reliable column here.

## 1. Profile after #541: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`, so each profile covers two runs),
summarised with `benchmarks/performance/profile-summary.mjs`. All summaries and
raw `.cpuprofile` files are in `profiles/` (`-before` = #541 head, `-after` =
this change). Before and after profiles ran at different moments under
different load, so compare shares, not absolute ms.

Top self time on the #541 head, per deck and size:

| deck | nodes | sampled | #1 | #2 | #3 | result recording (`buildStep` + `appendOrdered`) |
|---|---:|---:|---|---|---|---:|
| RC ladder `.tran 1n 100n` | 1k | 1.4 s | buildCompanionSystem 12.7% | GC 11.8% | stampG 11.7% | 10.7% |
| RC ladder | 10k | 17.1 s | **buildStep 22.1%** | GC 14.4% | stampG 11.7% | **28.2%** |
| RC ladder | 50k | 77.1 s | **buildStep 26.8%** | GC 14.5% | stampG 11.6% | **32.7%** |
| resistor mesh OP | 1k | 0.34 s | GC 24.5% | (program) 12.3% | factorize 8.3% | n/a (DC) |
| resistor mesh OP | 10k | 2.4 s | factorize 34.0% | GC 13.2% | amdOrdering 12.1% | n/a (DC) |
| resistor mesh OP | 50k | 13.6 s | factorize 54.6% | GC 14.8% | amdOrdering 7.9% | n/a (DC) |
| MOS1 inverter chain `.tran 10p 2n` | 1k | 12.8 s | batchStamp 18.9% | GC 11.6% | stamp 10.3% | 4.5% |
| MOS1 inverter chain | 10k | 195.7 s | batchStamp 21.7% | GC 9.4% | stampDynamic 9.3% | 4.6% |

The MOS chain at 50k nodes was not profiled: one run takes minutes even
unloaded, and the #426 baseline shows the 50k DC seed failing (#462).

Chosen hot spot: **per-step transient result recording**. `buildStep` is the top
self-time frame on the RC ladder at 10k and 50k, and with `appendOrdered` it is
28-33% of self time there, plus part of the GC share. It also costs 4-5% on the
MOS chain. The mesh OP's top frame is still the one numeric `factorize` (#541
already removed the repeated one). The MOS chain's top frame is
`MOSFET.batchStamp`, device-model code outside this lane.

### Why recording was hot

For every accepted timestep `TransientSimImpl.advance()` built a
`TransientStep` with two `Map<string, number>`s holding every node voltage and
branch current (`nodeIndexMap.get(name)` plus `Map.set` per variable).
`solveTransient` then walked both Maps to push each value onto its result
array. On the 50k RC ladder that is about 100k Map inserts and 100k iterator
steps per point, and the Maps become garbage straight away.

### The change

- `TransientSimImpl.advanceSolution()` runs the existing step loop and returns
  the accepted solution vector. `advance()` is now
  `buildStep(advanceSolution())`, so `createTransientSim`, `advanceUntil` and
  `simulateStream` still return the same `TransientStep` Maps.
- `solveTransient` builds a column plan once (result array plus solution slot
  per name) and pushes `solution[slot]` per saved point. No Maps per step.
- The plan keeps the old Maps' semantics exactly: one column per distinct
  name, in first-occurrence order, holding the slot of the name's last
  occurrence (`Map.set` overwrites). Points before TSTART are now skipped
  without building Maps first.

No solver, parser or device-model code changed. The test
`packages/core/src/analysis/transient-record.test.ts` ran RED first
(`advanceSolution`/`currentSolution` missing). It checks, with `Object.is` on
every value, that `advanceSolution()` matches a twin driver's `advance()` Maps
at every point, and that `solveTransient` (TSTART, inductor and source
branches, a subcircuit) matches the streamed `TransientStep`s and `simulate()`.

### Profile after the change

| deck | nodes | recording self before | after (`save`) | new top 3 self |
|---|---:|---:|---:|---|
| RC ladder | 1k | 10.7% | below top 20 | GC 24.2%, buildCompanionSystem 13.6%, attemptStep 11.1% |
| RC ladder | 10k | 28.2% | 2.5% | GC 17.0%, buildCompanionSystem 14.5%, stampG 14.4% |
| RC ladder | 50k | 32.7% | 6.7% | stampG 18.8%, buildCompanionSystem 17.2%, GC 14.0% |
| MOS1 chain | 1k | 4.5% | below top 20 | batchStamp 19.9%, GC 11.5%, stamp 10.3% |
| MOS1 chain | 10k | 4.6% | 0.7% | batchStamp 25.4%, buildCompanionSystem 10.6%, stampDynamic 10.0% |

The remaining `save` cost is the `number[]` pushes for every node at every
point, which the result format requires.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node voltage
  and branch current as Float64 bytes. In every sample of every cell both
  builds gave the same hash, and it is the same hash #486 recorded for main
  `6ce5b1b` (rc 1k `1b2381a4bc677c0f`, rc 10k `2ddc0c5dd0e60cfa`, rc 50k
  `062a200f824d7b24`, mesh 10k `73da68241f2c6ad6`, MOS 1k `08c22350bc51ed62`,
  MOS 10k `775afceba7baa25f`).
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` (`runNativeSpiceTs`, the aggregate's adapter) are
  identical between the #541 head and this change, with no child failures
  (`corpus-digests-before.json`, `corpus-digests-after.json`; both also equal
  `issue-486/corpus-digests-after.json` byte for byte). 100/100 identical.
- `benchmarks/accuracy.ts --ci` with each build: the new history entry is
  identical (date excluded), and both print "All circuits within acceptable
  error bounds".
- `aggregate-report.ts --check` exits 1 on this head in its preflight, on the
  stale `benchmarks/SOURCES.md` pin (pinned `0a8b490f…`, actual `cdd28c98…`),
  the same failure as on main `6ce5b1b` and #541. The aggregate lane (#470)
  owns that pin; this PR does not touch SOURCES.md or aggregate files. The
  corpus digests above stand in for the parity outcome.
- No tolerance, option or step-control setting changed.

## 3. Paired A/B: concurrent pairs, 9 rounds (`ab-concurrent.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <pr541-dist> <change-dist> 9 ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. The mesh OP cell
is a control: it never runs the transient code this change touches.

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 344 (335) | 319 (309) | 1.08x | 1.08x (1.03..1.15) | yes, 235 pts |
| rc-ladder-tran:10000 | 9 | 2151 (2099) | 1716 (1616) | 1.25x | 1.30x (1.20..1.33) | yes, 235 pts |
| rc-ladder-tran:50000 | 9 | 11186 (10711) | 7835 (7620) | 1.43x | 1.41x (1.39..1.47) | yes, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 378 (367) | 380 (368) | 0.99x | 0.99x (0.93..1.11) | yes, 1 pt |
| cmos-inverter-chain-tran:1000 | 9 | 2126 (1999) | 2062 (1956) | 1.03x | 1.03x (1.00..1.06) | yes, 671 pts |
| cmos-inverter-chain-tran:10000 | 9 | 31127 (29409) | 29583 (28498) | 1.05x | 1.05x (0.91..1.09) | yes, 671 pts |

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) |
|---|---:|---:|---:|---:|---:|
| rc-ladder-tran:1000 | 9 | 477 (267) | 434 (250) | 1.10x | 1.10x (0.89..1.17) |
| rc-ladder-tran:10000 | 9 | 4938 (2448) | 3130 (2025) | 1.58x | 1.35x (1.17..2.01) |
| rc-ladder-tran:50000 | 9 | 33801 (14338) | 16858 (10710) | 2.01x | 1.54x (0.78..3.76) |
| resistor-mesh-op:10000 (control) | 9 | 669 (367) | 603 (370) | 1.11x | 0.99x (0.96..1.21) |
| cmos-inverter-chain-tran:1000 | 9 | 5741 (2210) | 5070 (2178) | 1.13x | 1.02x (0.97..1.13) |
| cmos-inverter-chain-tran:10000 | 9 | 74970 (32742) | 70448 (31587) | 1.06x | 1.05x (0.87..1.07) |

Reading it: the RC ladder gains 1.3x (10k) and 1.4x (50k) in CPU time with
tight spreads. The MOS chain gains about 3-5%, in line with the 4.5% recording
share it had. The control cell is flat (0.99x), as it should be. Wall ratios
are noisier than CPU ratios under this load. Individual pairs where after was
slower: rc 1k (wall 0.89x), rc 50k (wall 0.78x, while that pair's CPU ratio
was still >1.39x), mesh control (CPU 0.93x), MOS 10k (wall 0.87x, CPU 0.91x).
They are published in the JSONL. No cell is slower in median.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks

`pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5`
on this branch, output `scaling-m2-after.json`. The harness runs each engine
cell at a different moment, so load is **not** paired across engines. Under
load average 130-260, both engines ran several times slower than unloaded
(compare the unloaded table in `PERFORMANCE_BASELINE.md`).

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 1639 (1297) | 299 (150) | 1637 | 96.4 | 5.49x slower | 17.0x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 5414 (4416) | 1939 (1278) | 5278 | 1478 | 2.79x slower | 3.57x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 49.7 (13.2) | 91.4 (42.4) | 39.2 | 5.7 | 0.54x (faster wall) | 6.8x slower | op / op |
| resistor-mesh-op | 10,000 | 975 (622) | 722 (594) | 827 | 236 | 1.35x slower | 3.50x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 6858 (5948) | 1044 (649) | 6747 | 938 | 6.57x slower | 7.19x slower | 671 / 214 |
| cmos-inverter-chain-tran | 10,000 | 66336 (51043) | 8490 (7670) | 66217 | 8208 | 7.81x slower | 8.07x slower | 671 / 214 |

spice-ts is still slower than ngspice-47 KLU in every cell except the 1k mesh
wall time, and that win is only ngspice's process startup: ngspice's own
analysis (5.7 ms) beats spice-ts (39 ms). The rc 1k spice-ts cell ran into a
load spike: the A/B above measured 319 ms CPU and a 434 ms wall median for the same
build and deck, so its 5.49x is inflated. Because of the unpaired load the
ratios in this table are rough. The unloaded #426 table stays the reference
until an unloaded rerun.

## 5. Remaining scope (not in this PR)

- RC ladder: MNA assembly (`stampG` + `buildCompanionSystem` + `stampC`, about
  33-40% self at 10k/50k after this change) and GC are now the top frames.
- MOS chain: `MOSFET.batchStamp` (20-25%) and the device `stamp` /
  `stampDynamic` restamps dominate. Device-model code, separate lane.
- Mesh OP: the single numeric `factorize` (34-55%) and `amdOrdering`.
  A better ordering or supernodal LU would be needed.
- Step count: spice-ts takes 235 / 671 timepoints where ngspice takes 120 / 214.
  This is a step-control question and probably the largest single factor left
  on the transient decks.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (one deck, one build)
node --cpu-prof --cpu-prof-dir=/tmp/prof --cpu-prof-name=rc.cpuprofile \
  benchmarks/performance/profile-scaling-m2.mjs rc-ladder-tran 10000 1
node benchmarks/performance/profile-summary.mjs /tmp/prof/rc.cpuprofile 20
# paired A/B: copy packages/core/dist of #541 and of this branch to two dirs
node benchmarks/results/issue-486/ab.mjs <pr541-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
# ngspice comparison
pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5 \
  --output=benchmarks/results/issue-548/scaling-m2-after.json
```
