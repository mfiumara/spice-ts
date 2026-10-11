# Issue #625: M2 scaling decks after #617, next bottleneck

Base: main `e58322e` (#609/PR #617 merged). Machine: Apple M5 Pro (18 cores),
48 GiB, Node v22.23.1, ngspice-47 (KLU compiled in). The machine was shared
with other agents throughout (load average roughly 10-110 on 18 cores,
changing between runs). The A/B in section 3 therefore starts both builds at
the same moment and reports process CPU time next to wall time. CPU time is
the column to read. Engine-vs-engine numbers in section 4 are **not** paired.

## 1. Profile after #617: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), run by
`benchmarks/results/issue-570/scripts/prof.sh`, summarised with
`benchmarks/performance/profile-summary.mjs`. Raw `.cpuprofile` files and
summaries are in `profiles/` (`-before` = main `e58322e`, `-after` = this
branch). Before and after ran at different moments under different load, so
compare shares, not absolute ms.

Top 5 self-time frames (`issue-570/scripts/table.mjs`):

| deck | build | sampled s | #1 | #2 | #3 | #4 | #5 |
|---|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | before | 0.20 | (garbage collector) 15.3% | attemptStep 11.9% | factorize 10.4% | buildCompanionSystem 10.3% | flush 7.5% |
| rc-ladder-tran-1000 | after | 0.47 | buildCompanionSystem 17.6% | attemptStep 13.0% | (garbage collector) 11.7% | factorize 8.9% | stampPrevB 4.2% |
| rc-ladder-tran-10000 | before | 1.06 | factorize 17.6% | attemptStep 14.4% | buildCompanionSystem 12.1% | stampPrevB 6.3% | (garbage collector) 5.9% |
| rc-ladder-tran-10000 | after | 2.08 | factorize 18.3% | attemptStep 14.4% | buildCompanionSystem 9.6% | stampStaticDevices 9.0% | (garbage collector) 4.7% |
| rc-ladder-tran-50000 | before | 8.33 | factorize 18.7% | attemptStep 14.3% | stampStaticDevices 12.9% | buildCompanionSystem 8.7% | (garbage collector) 8.4% |
| rc-ladder-tran-50000 | after | 6.39 | factorize 18.2% | attemptStep 15.2% | buildCompanionSystem 9.9% | stampStaticDevices 9.6% | (garbage collector) 9.4% |
| resistor-mesh-op-10000 | before | 0.72 | factorize 29.3% | amdOrdering 12.6% | (garbage collector) 10.5% | newtonRaphson 4.0% | analyzePattern 3.6% |
| resistor-mesh-op-10000 | after | 0.53 | factorize 26.7% | (garbage collector) 11.7% | amdOrdering 11.0% | analyzePattern 4.0% | newtonRaphson 4.0% |
| cmos-inverter-chain-tran-1000 | before | 2.64 | stampG 14.2% | evaluateBulkJunctions 12.2% | MOSFET.stamp 11.9% | factorize 10.7% | batchStamp 10.6% |
| cmos-inverter-chain-tran-1000 | after | 1.54 | batchStamp 26.3% | factorize 18.4% | evaluateBulkJunctions 12.0% | attemptStep 6.0% | buildCompanionSystem 5.4% |

The RC ladder and mesh profiles are unchanged from #609 in shape: `factorize`
is the largest function but spread over essential work, and assembly of the
constant linear G/C is the remaining large block (see Remaining scope).

The MOS1 inverter chain is the deck furthest behind ngspice (5.2x / 3.7x
analysis time at 1k / 10k in #609), and its top self-time frame was the
**generic stamp-context closure `stampG`** (14.2%). Callers
(`scripts/callers.mjs`) show where it comes from:

- `stampG` < `MOSFET.stamp` < `stampStaticDevices` < **`stampPrevB`**: 240 ms
  of the 375 ms; most of the rest from `newtonRaphson` (DC operating point).
- `MOSFET.stamp` itself (11.9%) and a third of `evaluateBulkJunctions`: same
  callers.

The Newton companion build (`buildCompanionSystem`) already stamps MOSFETs
with `MOSFET.batchStamp` from cached value slots. But the trapezoidal history
restamp `stampPrevB`, run once per accepted step, walks the whole device list
through `stampStaticDevices`, which only had kernels for plain resistors and
capacitors, so every MOSFET went through `MOSFET.stamp` and up to eleven
`ctx.stampG` calls, each a closure call plus a stamp-trace lookup. The same
happened in `newtonRaphson` whenever it is entered with an already locked
assembler (every gmin step after the first): it only classifies MOSFETs for
the batch path when it locks the topology itself.

Inclusive time on the 1k chain (`scripts/incl.mjs`):

| phase | before ms (share) | after ms (share) |
|---|---:|---:|
| `stampPrevB` (trapezoidal history restamp) | 728.5 (27.6%) | 178.0 (11.5%) |
| `buildCompanionSystem` (Newton assembly) | 598.9 (22.7%) | 482.7 (31.3%) |
| `newtonRaphson` (DC operating point) | 652.4 (24.7%) | 300.5 (19.5%) |
| `solveLinearized` (factor + solve) | 319.1 (12.1%) | 268.3 (17.4%) |
| total sampled | 2641.1 | 1542.5 |

Chosen hot spot: **per-device MOSFET stamping in `stampStaticDevices`**, the
largest inclusive phase of the deck furthest behind ngspice (`stampPrevB`
27.6%, more than the whole Newton assembly that runs several times per step).

### The change

`packages/core/src/mna/linear-stamp.ts`: stamp programs (built once per
assembler and device list after two passes, as since #570) now also turn
each maximal run of consecutive plain level-1 MOSFETs (`MOSFET.prototype`,
no own `stamp`, all slots inside the locked pattern) into one
`MOSFET.batchStamp(run, gValues, b, solution, stampIndex, ctx.gmin)` call.
Resistor runs, MOSFET runs and other devices alternate in netlist order;
runs never mix. `MOSFET.canBatchStamp(stampIndex)` (new, public) resolves
and checks the eleven value slots when the program is built; a MOSFET whose
entries are not in the locked pattern keeps its own `stamp`, which reports
the error as before.

Why bit-identical: `batchStamp` performs exactly the additions of
`MOSFET.stamp` (same junction and channel evaluation, same state updates of
`lastVbs`/`lastVbd`/`lastVon`, same value per entry, same order within the
device; `x -= v` and `x += -v` are the same IEEE operation), reading the same
solution vector and writing the same `gValues`/`b` arrays the context closures
write. Devices keep netlist order, so every slot receives the same additions
in the same order. The device gmin is the context's (`assembler.deviceGmin`),
as `MOSFET.stamp` uses. No solver, device model, tolerance or step-control
code changed. The `buildCompanionSystem` path (MOSFETs already excluded from
its `others` list) is untouched.

Test: `packages/core/src/mna/linear-stamp.test.ts`, "stamps level-1 MOSFET
runs bit for bit in netlist order (#625)". Ran RED first: `MOSFET.stamp` was
still called 7 times per programmed pass. Two independent compiles of a deck
with NMOS and PMOS runs (bulk on source, rail, own node, grounded source)
interleaved with resistors and sources that share their nodes, a non-default
device gmin, and eight solution vectors that drive the devices through
forward, reverse (vds < 0), cut-off and junction-limited regions; `gValues`
and `b` compared with `Object.is` on every entry, and `MOSFET.stamp` must not
be called once the program is built.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. In all 108 samples of the A/B
  both builds gave the same hash per cell (rc 1k `ac5d6929fc25a221`, rc 10k
  `e59b4235d4c157c7`, rc 50k `d706c8a5619a8049`, mesh 10k `73da68241f2c6ad6`,
  MOS 1k `04a9fa4f0f067778`, MOS 10k `a3f30d5252ca3690`), the same hashes as
  the #570 and #609 evidence.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `e58322e` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`),
  with no child failures. 100/100 identical.
- `benchmarks/accuracy.ts --ci` with this branch's build prints "All circuits
  within acceptable error bounds" (exit 0). The regenerated
  `accuracy-results.json` was not committed.
- No tolerance, option, threshold or step-control setting changed.

## 3. Paired A/B: concurrent pairs, 9 rounds (`ab-concurrent.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. The RC ladders
and the mesh OP contain no MOSFETs and act as controls.

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 (control) | 9 | 207 (159) | 200 (164) | 1.03x | 1.00x (0.91..1.07) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 (control) | 9 | 880 (605) | 839 (620) | 1.05x | 1.01x (0.95..1.05) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 (control) | 9 | 3843 (3176) | 3928 (3093) | 0.98x | 0.98x (0.97..1.04) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 390 (319) | 404 (294) | 0.97x | 1.02x (0.97..1.09) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 1363 (959) | 1126 (757) | 1.21x | 1.28x (1.15..1.36) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 18363 (11898) | 14382 (9651) | 1.28x | 1.18x (1.12..1.56) | yes a3f30d5252ca3690, 654 pts |

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 (control) | 9 | 81.9 (60.7) | 81.1 (61.9) | 1.01x | 1.00x (0.95..1.10) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 (control) | 9 | 624 (410) | 605 (418) | 1.03x | 1.00x (0.97..1.03) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 (control) | 9 | 3083 (2529) | 3120 (2501) | 0.99x | 0.99x (0.99..1.01) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 256 (197) | 254 (183) | 1.01x | 1.01x (0.99..1.09) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 1207 (791) | 920 (598) | 1.31x | 1.30x (0.98..1.42) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 18330 (11109) | 13846 (9199) | 1.32x | 1.13x (1.00..1.63) | yes a3f30d5252ca3690, 654 pts |

**Reading it honestly:** a clear win on the MOS1 inverter chain, 1.28x CPU at
1k and 1.18x at 10k (paired medians; every CPU pair >= 1.12x), 1.30x / 1.13x
wall. The controls move by 0.98-1.02x, i.e. no measurable change in either
direction; the worst control (rc 50k, 0.98x CPU median, 0.99x wall) is within
the noise band of the previous lanes' evidence. Decks without level-1
MOSFETs gain nothing from this change.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness, run as
`npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900`
once with main's build in `packages/core/dist` (`scaling-m2-before.json`) and
once with this branch's (`scaling-m2-after.json`); tables by
`issue-570/scripts/scaling-table.mjs`. Each engine cell ran at a different
moment, so load is **not** paired, neither across engines nor between the
two runs, and only 3 samples per cell were taken to bound machine load.
ngspice is the same binary in both runs; its variation between the two
tables (e.g. MOS 10k 5.1 s vs 10.3 s) is machine load, which is why section 3
is the measurement of this change.

Before (main `e58322e`):

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 117 (116) | 76.3 (73.1) | 111 | 26.3 | 1.54x slower | 4.20x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 1343 (1324) | 597 (555) | 1251 | 434 | 2.25x slower | 2.88x slower | 235 / 120 |
| rc-ladder-tran | 50,000 | 4457 (4109) | 2026 (1852) | 4186 | 1692 | 2.20x slower | 2.47x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 55.6 (18.8) | 95.6 (56.0) | 51.9 | 4.4 | 0.58x (faster) | 11.81x slower | op / op |
| resistor-mesh-op | 10,000 | 304 (232) | 190 (181) | 263 | 65.8 | 1.60x slower | 4.00x slower | op / op |
| resistor-mesh-op | 50,176 | 3101 (3024) | 2336 (2006) | 2855 | 1202 | 1.33x slower | 2.38x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 1410 (1308) | 285 (281) | 1404 | 248 | 4.95x slower | 5.65x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 18547 (15888) | 5115 (4621) | 18493 | 4956 | 3.63x slower | 3.73x slower | 654 / 214 |
| cmos-inverter-chain-tran | 50,000 | 119312 (113705) | 75263 (68545) | 119046 | 74258 | 1.59x slower | 1.60x slower | 654 / 214 |

After (this branch):

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 71.0 (67.7) | 42.4 (41.1) | 66.4 | 17.8 | 1.68x slower | 3.74x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 681 (617) | 405 (321) | 635 | 312 | 1.68x slower | 2.04x slower | 235 / 120 |
| rc-ladder-tran | 50,000 | 3231 (3208) | 1305 (1290) | 3087 | 1034 | 2.48x slower | 2.98x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 17.5 (15.7) | 34.9 (34.0) | 13.5 | 4.0 | 0.50x (faster) | 3.39x slower | op / op |
| resistor-mesh-op | 10,000 | 264 (226) | 178 (176) | 223 | 60.6 | 1.49x slower | 3.68x slower | op / op |
| resistor-mesh-op | 50,176 | 2614 (2483) | 1001 (987) | 2428 | 522 | 2.61x slower | 4.65x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 731 (717) | 263 (261) | 725 | 230 | 2.78x slower | 3.15x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 29172 (25875) | 10290 (10216) | 29056 | 9941 | 2.83x slower | 2.92x slower | 654 / 214 |
| cmos-inverter-chain-tran | 50,000 | 98673 (96932) | 74355 (71406) | 98287 | 73193 | 1.33x slower | 1.34x slower | 654 / 214 |

- spice-ts remains slower than ngspice-47 KLU in analysis time on every deck
  and size, before and after (1.3-4.7x after). The 1k mesh wall-time "win"
  is ngspice process startup only; its analysis is 3.4x faster there.
- MOS1 chain, spice-ts / ngspice analysis ratio: 5.65x -> 3.15x at 1k,
  3.73x -> 2.92x at 10k, 1.60x -> 1.34x at 50k. Because the cells are not
  load-paired, these ratios overstate or understate the change; the paired
  CPU speedup of section 3 (1.28x at 1k, 1.18x at 10k) is the number to
  quote. The 50k chain had no paired A/B (one sample pair costs ~4 min of two
  cores); its before/after spice-ts medians (119 s -> 98.7 s) agree in
  direction with the paired cells.
- RC ladder and mesh: the change does not touch them (section 3 controls);
  their before/after differences above are load.
- Timepoints are unchanged: 235 / 654 spice-ts vs 120 / 214 for ngspice.
- Probe values are unchanged from #609 (same build output hashes).

## 5. Remaining scope (not in this PR)

- MOS chain after this change: `batchStamp` (26% self, now including the
  inlined channel and junction evaluation of both the Newton build and the
  history restamp) and `evaluateBulkJunctions` (12%) are device-model work.
  The history restamp still evaluates every MOSFET once per accepted step;
  the static current it needs is the one of the last Newton iteration's
  linearisation point only when that point equals the accepted solution,
  which is not guaranteed (limiting), so reusing it would change results.
- Step count: 654 vs 214 timepoints on the MOS chain and 235 vs 120 on the
  RC ladder is still the largest single factor. Step-control work.
- `factorize` (18-27%): unchanged; see the #609 notes on a verified pivot
  replay and the identical-input check.
- RC ladder assembly (`buildCompanionSystem` + `stampStaticDevices` +
  `stampDynamicDevices` + `stampPrevB`, ~28% at 50k): the full restamp of
  constant linear G/C every Newton iteration.
- `newtonRaphson` still splits MOSFETs out (batch first, then the others)
  only on the call that locks the topology. That changes slot addition order
  between the first and later calls on the same assembler; harmless (both
  orders are pre-existing and deterministic) but worth unifying in a
  results-changing PR.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm -C packages/core build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
spice-heavy bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof-after \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 cmos-inverter-chain-tran:1000
node benchmarks/results/issue-570/scripts/table.mjs /tmp/prof-before /tmp/prof-after
node benchmarks/performance/results/issue-625/scripts/callers.mjs <x.cpuprofile> stampG batchStamp
node benchmarks/performance/results/issue-625/scripts/incl.mjs <x.cpuprofile> stampPrevB buildCompanionSystem solveLinearized newtonRaphson
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
spice-heavy npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
# ngspice comparison (run once per build in packages/core/dist)
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900 \
  --output=benchmarks/performance/results/issue-625/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/performance/results/issue-625/scaling-m2-after.json
```
