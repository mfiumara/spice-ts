# Issue #570: M2 scaling decks after #548, next bottleneck

Base: main `93987d0` (includes #541 LU-factor reuse, #548 result recording
and the #498/#574 resistor changes; the branch merges it). An earlier pass of
this work measured against main `702faed`; all numbers below were rerun on
`93987d0`. Machine: Apple M5 Pro (18 cores), Node v22.23.1, ngspice-47 (KLU
compiled in). The machine was shared with other agents throughout, at load
average roughly 20-100 on 18 cores, and the load changed between runs. The
A/B below therefore starts both builds at the same moment and reports process
CPU time next to wall time. CPU time is the column to read.

## 1. Profile after #548: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), summarised with
`benchmarks/performance/profile-summary.mjs` (`scripts/prof.sh` runs both).
Raw `.cpuprofile` files and summaries are in `profiles/` (`-before` = main
`93987d0`, `-after` = this branch). Before and after ran at different moments
under different load, so compare shares, not absolute ms.

Top 5 self-time frames per deck (`scripts/table.mjs`):

| deck | build | sampled s | #1 | #2 | #3 | #4 | #5 |
|---|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | before | 0.85 | buildCompanionSystem 19.7% | stampG 17.9% | (garbage collector) 9.6% | stamp 9.5% | attemptStep 4.6% |
| rc-ladder-tran-1000 | after | 0.53 | buildCompanionSystem 17.1% | attemptStep 14.2% | (garbage collector) 11.1% | advanceSolution 8.6% | factorize 6.7% |
| rc-ladder-tran-10000 | before | 5.51 | buildCompanionSystem 13.8% | stampG 12.8% | (garbage collector) 10.9% | factorize 10.6% | attemptStep 9.5% |
| rc-ladder-tran-10000 | after | 3.01 | factorize 21.3% | attemptStep 10.9% | (garbage collector) 10.9% | buildCompanionSystem 10.4% | stampStaticDevices 10.0% |
| rc-ladder-tran-50000 | before | 35.76 | (garbage collector) 16.3% | stampG 16.0% | buildCompanionSystem 13.1% | factorize 9.1% | attemptStep 7.9% |
| rc-ladder-tran-50000 | after | 16.36 | (garbage collector) 14.8% | factorize 14.4% | attemptStep 12.1% | save 11.7% | stampStaticDevices 8.7% |
| resistor-mesh-op-1000 | before | 0.28 | detectModuleFormat 16.3% | (garbage collector) 12.5% | analyzePattern 9.5% | lockTopology 8.5% | factorize 7.4% |
| resistor-mesh-op-1000 | after | 0.29 | factorize 12.2% | (garbage collector) 12.1% | newtonRaphson 8.6% | compile 8.3% | analyzePattern 7.8% |
| resistor-mesh-op-10000 | before | 1.76 | factorize 24.1% | (garbage collector) 17.7% | amdOrdering 12.0% | compile 6.8% | newtonRaphson 5.1% |
| resistor-mesh-op-10000 | after | 1.26 | factorize 28.0% | amdOrdering 13.8% | (garbage collector) 13.5% | newtonRaphson 4.3% | resolveResistor 4.1% |
| resistor-mesh-op-50000 | before | 14.37 | factorize 64.5% | (garbage collector) 9.0% | amdOrdering 7.8% | compile 2.7% | analyzePattern 2.4% |
| resistor-mesh-op-50000 | after | 8.95 | factorize 55.9% | amdOrdering 12.2% | (garbage collector) 10.0% | compile 2.4% | lockTopology 2.3% |
| cmos-inverter-chain-tran-1000 | before | 9.41 | (garbage collector) 13.5% | stamp 12.6% | batchStamp 10.3% | factorize 8.8% | stampG 8.6% |
| cmos-inverter-chain-tran-1000 | after | 4.43 | stamp 13.9% | stampG 13.6% | evaluateBulkJunctions 13.1% | factorize 9.0% | batchStamp 8.5% |
| cmos-inverter-chain-tran-10000 | before | 85.80 | batchStamp 15.8% | stampG 11.8% | evaluateBulkJunctions 10.5% | stamp 9.1% | (garbage collector) 8.9% |
| cmos-inverter-chain-tran-10000 | after | 68.64 | batchStamp 20.4% | stampG 13.3% | stamp 10.9% | evaluateBulkJunctions 10.6% | (garbage collector) 8.8% |

Before and after profiles ran at different load (sampled times differ by up
to 2x); read shares only. The mesh path is effectively unchanged (see the A/B
control below).

Chosen hot spot: **MNA assembly on the transient decks**. On the RC ladder
the assembly frames together (`buildCompanionSystem`, the fast-path
`stampG`/`stampC` closures, `Resistor.stamp`, `stampDynamic`, `stampPrevB`,
`acceptTransientStep`) were 49-55% of self time at 1k/10k/50k
(`scripts/assembly-share.mjs`), and 36-42% on the MOS1 chain. `stampG` alone was
the #1 or #2 frame on every RC size. The mesh OP's top frame is still the one
numeric `factorize` of a single linear solve (and `amdOrdering`), and the MOS
chain's top frames are `MOSFET.batchStamp` / `stamp` /
`evaluateBulkJunctions`, which are device-model code outside this lane.

### Why assembly was hot

Every Newton iteration clears and restamps the whole matrix. For a 1 kOhm
resistor that is a megamorphic `device.stamp(ctx)` call, an array
destructure, and four `ctx.stampG` closure calls, each of which checks the
stamp-sequence slot cache before adding the value. Capacitors do the same
through `stampDynamic`/`ctx.stampC`. On top of that `buildCompanionSystem`
walked the full device list twice more per iteration just to test
`integratesTransientCharge`/`storesCharge`/optional methods, and the driver
walked it again per accepted step for `acceptTransientStep` and the accepted
charge currents. On the RC ladder almost all of those devices are plain
resistors and capacitors.

### The change

- New `packages/core/src/mna/linear-stamp.ts`: `stampStaticDevices` and
  `stampDynamicDevices` are drop-in equivalents of
  `for (d of devices) d.stamp(ctx)` / `d.stampDynamic(ctx)`. On the locked
  fast path they build, per assembler and device list, a program that walks
  the list in the same order. Each run of consecutive plain conductance-form
  `Resistor`s (or plain `Capacitor`s) is stamped by one loop over value slots
  resolved once with `stampIndex`; every other device is still stamped
  through its own method at its place in the sequence. Values are read from
  the device at stamp time (`conductance`, `capacitance`; `conductance` is the effective
  ngspice RESconduct including M, SCALE and temperature since #498), so
  `setParameter`/temperature updates apply exactly as before. A plain
  capacitor's empty static stamp is skipped.
- "Plain" means the exact class (prototype is `Resistor.prototype` /
  `Capacitor.prototype`, no own `stamp` override) and, for resistors, no
  branch form (R = 0 style). Subclasses and branch-form resistors go through
  their own `stamp`.
- A program is built only after a list has been stamped twice on the fast
  path, so a linear operating point (which converges in a couple of
  iterations) never pays the slot resolution. A relock (new value storage)
  or a changed list length rebuilds it.
- Callers: `buildCompanionSystem` (non-MOSFET devices and the dynamic pass),
  the trapezoidal history restamp `stampPrevB`, and the DC `newtonRaphson`
  loop. `buildCompanionSystem` now also caches, per device list, the devices
  that stamp `stampDynamic` and those that integrate their own charge, and the
  transient driver caches the devices with `acceptTransientStep` and with an
  accepted charge current. All of these flags are fixed at construction.

Why bit-identical: each matrix slot receives exactly the same sequence of
`+=` operations with the same operands as with per-device stamping (same
device order, same per-device entry order, `+= -g` is the same operation the
resistor issued via `stampG(…, -g)`). Floating-point results therefore do not
change. `MOSFET.batchStamp` ordering is untouched. No device model, solver,
tolerance or step-control code changed, and `gilbert-peierls.ts` is not
touched.

Test: `packages/core/src/mna/linear-stamp.test.ts` (ran RED first: module
missing). It compares the program path against per-device stamping with
`Object.is` on every G, C and b entry, over five passes (so both the
device-by-device warm-up passes and the program are exercised), after
changing every R and C value, after `invalidateTopology` + relock, for a
sub-list, and on the unlocked Map path. The fixture mixes resistors to ground
in both orientations, capacitors, a diode, an inductor, sources, a small
resistor, and resistors with `m=`, `scale=`, `tc1/tc2` and `tce` plus a
temperature change. Mutating either kernel (one `* 1.0000001`) makes 4 of 5
tests fail, and the pre-#498 kernel (`1 / resistance`) fails the parameter
test by one ulp, which is how the merge with main was caught.

### Profile after the change

MNA assembly self-time share (`scripts/assembly-share.mjs`):

| deck | before | after |
|---|---:|---:|
| RC ladder 1k | 54.6% | 25.3% |
| RC ladder 10k | 49.1% | 28.0% |
| RC ladder 50k | 49.6% | 25.7% |
| MOS1 chain 1k | 35.8% | 37.9% |
| MOS1 chain 10k | 42.0% | 37.8% |

On the RC ladder `stampG` and `Resistor.stamp` drop out of the top 5; the
remaining assembly is the companion arithmetic in `buildCompanionSystem` and
the two kernels (their self time is the slot loads and adds themselves). On
the MOS chain the assembly share is flat to slightly lower; it is dominated by
the MOSFET's own `stamp`/`stampG` calls. The MOS chain keeps its
device-model frames (`batchStamp`, `MOSFET.stamp` via the history restamp and
`stampG` from it, `evaluateBulkJunctions`).

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. In all 108 samples of the A/B
  both builds gave the same hash per cell (rc 1k `ac5d6929fc25a221`, rc 10k
  `e59b4235d4c157c7`, rc 50k `d706c8a5619a8049`, mesh 10k `73da68241f2c6ad6`,
  MOS 1k `04a9fa4f0f067778`, MOS 10k `a3f30d5252ca3690`).
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `93987d0` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`),
  with no child failures. 100/100 identical.
- `benchmarks/accuracy.ts --ci` with each build: the new history entry is
  identical (date excluded), and both print "All circuits within acceptable
  error bounds".
- No tolerance, option or step-control setting changed.

## 3. Paired A/B: concurrent pairs, 9 rounds (`ab-concurrent.jsonl`)

`node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 ab.jsonl --concurrent <cells>`.
Each sample is a fresh `node` process: one warmup, then one timed `simulate()`
on the byte-identical #426 deck. Before and after of a pair start together.
Ratios are before/after, so >1 means this change is faster. The mesh OP cell
is the control: it runs only the DC path, where the program is never built.

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 341 (321) | 298 (281) | 1.14x | 1.15x (1.00..1.20) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 | 9 | 1699 (1617) | 1070 (996) | 1.59x | 1.59x (1.46..1.74) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 | 9 | 8338 (6394) | 4732 (4691) | 1.76x | 1.69x (1.36..1.77) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 424 (385) | 442 (386) | 0.96x | 0.96x (0.91..1.01) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 1797 (1622) | 1692 (1510) | 1.06x | 1.07x (1.04..1.09) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 23253 (21780) | 20604 (18930) | 1.13x | 1.13x (1.11..1.20) | yes a3f30d5252ca3690, 654 pts |

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 270 (180) | 199 (121) | 1.36x | 1.25x (0.93..1.64) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 | 9 | 1748 (1382) | 1124 (806) | 1.56x | 1.65x (1.41..2.28) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 | 9 | 7834 (5993) | 5100 (3868) | 1.54x | 1.53x (1.34..1.97) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 375 (266) | 383 (267) | 0.98x | 1.00x (0.94..1.01) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 1997 (1417) | 1723 (1298) | 1.16x | 1.09x (1.07..1.16) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 27169 (21737) | 23232 (18711) | 1.17x | 1.14x (1.09..1.17) | yes a3f30d5252ca3690, 654 pts |

Reading it: the RC ladder gains 1.6x (10k) and 1.7x (50k) in CPU time, the
MOS chain 7% (1k) and 13% (10k). Pairs where after was slower: rc 1k wall
0.93x min (its CPU ratio stayed >= 1.00).

**Control loss, published as measured:** the mesh OP control came out at a
median paired CPU ratio of 0.96x (0.91..1.01), wall 1.00x (0.94..1.01). The
first pass of this work (against `702faed`) saw the same pattern: 0.95x CPU
concurrent, 0.97x in a 15-round sequential run, 1.01x in a rerun. In-process,
30 alternating `simulate()` calls on the 10k mesh after warmup
(`scripts/inproc.mjs`, `inproc-mesh.txt`) give 1.05x in favour of this
branch, and the profile shows the mesh never builds a program. So the
fresh-process DC path is up to ~4-5% slower in CPU time (one warmup + one run
per process), with no slowdown once warm; I could not isolate the cause
beyond the extra function layer and Map lookups on that path. As a small
nonlinear transient check, the #25 half-wave rectifier test deck
(`scripts/inproc-netlist.mjs`, `inproc-rect.txt`) is 1.09x faster in-process.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks

`pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5`
on this branch, output `scaling-m2-after.json`, table by
`scripts/scaling-table.mjs`. The harness runs each engine cell at a different
moment, so load is **not** paired across engines.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 74.3 (71.4) | 51.4 (51.1) | 71.6 | 22.8 | 1.45x slower | 3.14x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 661 (611) | 303 (296) | 636 | 225 | 2.18x slower | 2.83x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 16.1 (13.0) | 33.5 (32.7) | 12.6 | 4.4 | 0.48x (faster) | 2.88x slower | op / op |
| resistor-mesh-op | 10,000 | 212 (193) | 184 (180) | 190 | 63.4 | 1.15x slower | 2.99x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 1527 (1029) | 373 (247) | 1521 | 316 | 4.09x slower | 4.82x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 10340 (7411) | 2981 (2910) | 10314 | 2870 | 3.47x slower | 3.59x slower | 654 / 214 |

spice-ts is still slower than ngspice-47 KLU in analysis time on every deck
(2.8-4.8x). The 1k mesh wall-time "win" is ngspice process startup only;
ngspice's own analysis is 2.9x faster there. Because the engines are not
load-paired these ratios are rough; the unloaded #426 table in
`PERFORMANCE_BASELINE.md` stays the reference until an unloaded rerun.

## 5. Remaining scope (not in this PR)

- RC ladder 50k: result recording (`save`, 11.7%) is back in the top 5:
  `number[]` pushes for 50k columns x 235 points plus array growth/GC. A
  preallocated/chunked typed-array result buffer would need a result-format
  decision.
- RC ladder: `attemptStep` (the triangular solves are inlined into it) and
  `factorize`; companion arithmetic in `buildCompanionSystem` (dynamic-row
  mask and C*x products rebuilt every Newton iteration even though C is
  constant for linear capacitors).
- MOS chain: `MOSFET.batchStamp`, `MOSFET.stamp` (the trapezoidal history
  restamp still stamps MOSFETs through `ctx.stampG`, not `batchStamp`) and
  `evaluateBulkJunctions`. Device-model lane.
- Mesh OP: the single numeric `factorize` (12-65%) and `amdOrdering`
  (8-14%). Better ordering or supernodal LU.
- Step count: 235 / 654 spice-ts timepoints vs 120 / 214 for ngspice.
  Still the largest single factor on the transient decks.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof-after rc-ladder-tran:10000 ...
node benchmarks/results/issue-570/scripts/table.mjs /tmp/prof-before /tmp/prof-after
node benchmarks/results/issue-570/scripts/assembly-share.mjs /tmp/prof-after rc-ladder-tran-10000
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
node benchmarks/results/issue-570/scripts/inproc.mjs <main-dist> <branch-dist> resistor-mesh-op 10000 30
# corpus digests: <root>/packages/core/dist must be the build under test
npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
# ngspice comparison
pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5 \
  --output=benchmarks/results/issue-570/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/results/issue-570/scaling-m2-after.json
```
