# Issue #570: M2 scaling decks after #548, next bottleneck

Base: main `702faed` (includes #541 LU-factor reuse and #548 result
recording). Machine: Apple M5 Pro (18 cores), Node v22.23.1, ngspice-47 (KLU
compiled in). The machine was shared with other agents throughout, at load
average roughly 20-100 on 18 cores, and the load changed between runs. The
A/B below therefore starts both builds at the same moment and reports process
CPU time next to wall time. CPU time is the column to read.

## 1. Profile after #548: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), summarised with
`benchmarks/performance/profile-summary.mjs` (`scripts/prof.sh` runs both).
Raw `.cpuprofile` files and summaries are in `profiles/` (`-before` = main
`702faed`, `-after` = this branch). Before and after ran at different moments
under different load, so compare shares, not absolute ms.

Top 5 self-time frames per deck (`scripts/table.mjs`):

| deck | build | sampled s | #1 | #2 | #3 | #4 | #5 |
|---|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | before | 0.37 | buildCompanionSystem 19.8% | stampG 18.2% | attemptStep 14.4% | stamp 8.8% | factorize 6.2% |
| rc-ladder-tran-1000 | after | 0.49 | attemptStep 16.7% | (garbage collector) 11.1% | factorize 8.5% | advanceSolution 5.8% | buildCompanionSystem 5.7% |
| rc-ladder-tran-10000 | before | 2.48 | buildCompanionSystem 18.2% | stampG 15.6% | factorize 9.2% | attemptStep 8.6% | stamp 7.6% |
| rc-ladder-tran-10000 | after | 3.36 | attemptStep 16.3% | buildCompanionSystem 14.3% | (garbage collector) 13.4% | factorize 13.4% | save 4.8% |
| rc-ladder-tran-50000 | before | 11.99 | stampG 18.6% | buildCompanionSystem 16.9% | attemptStep 9.8% | factorize 9.7% | stamp 8.3% |
| rc-ladder-tran-50000 | after | 15.84 | save 15.6% | factorize 15.3% | attemptStep 13.8% | (garbage collector) 11.9% | buildCompanionSystem 8.8% |
| resistor-mesh-op-1000 | before | 0.14 | factorize 18.9% | (idle) 9.8% | amdOrdering 8.5% | (program) 7.2% | compileForInternalLoader 6.9% |
| resistor-mesh-op-1000 | after | 0.27 | (garbage collector) 30.0% | (idle) 14.6% | remove 9.7% | compileSourceTextModule 8.0% | (program) 7.6% |
| resistor-mesh-op-10000 | before | 0.62 | factorize 32.3% | amdOrdering 12.1% | (garbage collector) 6.4% | compile 5.1% | lockTopology 4.3% |
| resistor-mesh-op-10000 | after | 1.62 | factorize 26.8% | (garbage collector) 25.6% | amdOrdering 11.3% | compile 6.9% | lockTopology 6.6% |
| resistor-mesh-op-50000 | before | 4.18 | factorize 61.7% | amdOrdering 11.2% | (garbage collector) 7.4% | compile 2.8% | lockTopology 2.3% |
| resistor-mesh-op-50000 | after | 12.25 | factorize 67.1% | (garbage collector) 9.0% | amdOrdering 8.1% | compile 2.2% | lockTopology 1.4% |
| cmos-inverter-chain-tran-1000 | before | 2.69 | stamp 12.6% | batchStamp 11.6% | stampG 11.5% | evaluateBulkJunctions 10.9% | factorize 9.9% |
| cmos-inverter-chain-tran-1000 | after | 5.81 | (garbage collector) 13.0% | batchStamp 12.1% | stamp 11.0% | factorize 10.7% | evaluateBulkJunctions 10.2% |
| cmos-inverter-chain-tran-10000 | before | 33.04 | batchStamp 19.2% | stampG 12.0% | stamp 10.1% | evaluateBulkJunctions 9.5% | buildCompanionSystem 8.0% |
| cmos-inverter-chain-tran-10000 | after | 51.99 | batchStamp 20.2% | stampG 13.1% | evaluateBulkJunctions 11.5% | stamp 11.2% | factorize 8.1% |

The mesh "after" profiles ran during a load spike (sampled time 2-3x the
before run, GC share inflated); the mesh path is effectively unchanged (see
the A/B control below).

Chosen hot spot: **MNA assembly on the transient decks**. On the RC ladder
the assembly frames together (`buildCompanionSystem`, the fast-path
`stampG`/`stampC` closures, `Resistor.stamp`, `stampDynamic`, `stampPrevB`,
`acceptTransientStep`) were 55% of self time at every size
(`scripts/assembly-share.mjs`), and 40% on the MOS1 chain. `stampG` alone was
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
  the device at stamp time (`1 / resistance`, `capacitance`), so
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
in both orientations, capacitors, a diode, an inductor, sources and a small
resistor. Mutating either kernel (one `* 1.0000001`) makes 4 of 5 tests fail.

### Profile after the change

MNA assembly self-time share (`scripts/assembly-share.mjs`):

| deck | before | after |
|---|---:|---:|
| RC ladder 1k | 54.9% | 28.0% |
| RC ladder 10k | 55.1% | 26.8% |
| RC ladder 50k | 55.5% | 28.5% |
| MOS1 chain 1k | 40.8% | 35.4% |
| MOS1 chain 10k | 40.2% | 36.8% |

On the RC ladder, `stampG` and `Resistor.stamp` drop out of the top 5 (to
1.4% / 0.9% at 10k); the remaining assembly is the companion arithmetic in
`buildCompanionSystem` and the two kernels. The MOS chain keeps its
device-model frames (`batchStamp`, `MOSFET.stamp` via the history restamp and
`stampG` from it, `evaluateBulkJunctions`).

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. In all 108 samples of the A/B
  both builds gave the same hash per cell (rc 1k `c6710bfb82c7c505`, rc 10k
  `685f65c16b2ef1e4`, rc 50k `8ca8fb22476658b2`, mesh 10k `73da68241f2c6ad6`,
  MOS 1k `04a9fa4f0f067778`, MOS 10k `a3f30d5252ca3690`; mesh 1k
  `cc196ac698927bd3` in the sequential run).
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `702faed` and
  this branch (`corpus-digests-before.json`, `corpus-digests-after.json`),
  with no child failures. 100/100 identical. (They differ from the #548 files
  because main gained other fixes since.)
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
| rc-ladder-tran:1000 | 9 | 326 (253) | 292 (240) | 1.12x | 1.11x (1.01..1.19) | yes c6710bfb82c7c505, 235 pts |
| rc-ladder-tran:10000 | 9 | 1698 (1183) | 975 (778) | 1.74x | 1.70x (1.52..1.90) | yes 685f65c16b2ef1e4, 235 pts |
| rc-ladder-tran:50000 | 9 | 8218 (5568) | 4535 (3905) | 1.81x | 1.76x (1.39..2.13) | yes 8ca8fb22476658b2, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 373 (299) | 388 (314) | 0.96x | 0.95x (0.91..1.03) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 1847 (1288) | 1771 (1232) | 1.04x | 1.05x (1.03..1.09) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 24753 (22879) | 21524 (20757) | 1.15x | 1.15x (1.09..1.20) | yes a3f30d5252ca3690, 654 pts |

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) |
|---|---:|---:|---:|---:|---:|
| rc-ladder-tran:1000 | 9 | 371 (145) | 273 (94.2) | 1.36x | 1.38x (0.96..1.64) |
| rc-ladder-tran:10000 | 9 | 2657 (934) | 1433 (522) | 1.85x | 1.79x (1.05..4.49) |
| rc-ladder-tran:50000 | 9 | 12284 (4877) | 6124 (3656) | 2.01x | 1.68x (1.23..3.02) |
| resistor-mesh-op:10000 (control) | 9 | 538 (200) | 551 (207) | 0.98x | 0.98x (0.93..1.03) |
| cmos-inverter-chain-tran:1000 | 9 | 3167 (1097) | 2907 (1037) | 1.09x | 1.07x (0.98..1.19) |
| cmos-inverter-chain-tran:10000 | 9 | 40070 (25223) | 36653 (22383) | 1.09x | 1.15x (0.98..1.36) |

Reading it: the RC ladder gains 1.7x (10k) and 1.8x (50k) in CPU time with
every pair faster. The MOS chain gains 5% (1k) and 15% (10k). Individual
pairs where after was slower: rc 1k wall 0.96x, MOS 1k wall 0.98x, MOS 10k
wall 0.98x (CPU ratios of those pairs were all >1).

**Control loss, published as measured:** the mesh OP control came out at a
median paired CPU ratio of 0.95x (0.91..1.03) here, and 0.97x (0.86..1.33)
in a separate 15-round sequential run (`ab-mesh-sequential.jsonl`, wall
0.91x median there, mesh 1k 1.02x CPU). In-process, 30 alternating
`simulate()` calls on the 10k mesh after warmup (`scripts/inproc.mjs`) gave
1.04x in favour of this branch, and the profile shows the mesh never builds a
program (`buildProgram` absent). A later 9-round concurrent rerun of the
control alone (`ab-mesh-concurrent-rerun.jsonl`) gave 1.01x CPU
(0.94..1.13) but 0.95x wall (0.76..1.22); a build with only the DC
`newtonRaphson` call site reverted gave 0.98x CPU (0.92..1.07) in the same
session. So the signal does not reproduce consistently and I could not
isolate a cause; the only change on that path is one extra function layer
and a Map lookup per Newton pass. Treat the mesh OP as unchanged to slightly
slower (up to ~5% CPU in fresh processes) until an unloaded rerun says
otherwise.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks

`pnpm bench:scaling:m2 -- --sizes=1000,10000 --ngspice-solvers=klu --runs=5`
on this branch, output `scaling-m2-after.json`, table by
`scripts/scaling-table.mjs`. The harness runs each engine cell at a different
moment, so load is **not** paired across engines.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 83.6 (81.1) | 54.3 (49.1) | 80.8 | 21.0 | 1.54x slower | 3.85x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 905 (808) | 392 (347) | 819 | 296 | 2.31x slower | 2.76x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 20.1 (13.7) | 40.7 (40.6) | 17.0 | 5.0 | 0.49x (faster wall) | 3.39x slower | op / op |
| resistor-mesh-op | 10,000 | 280 (258) | 296 (238) | 255 | 79.0 | 0.95x (faster wall) | 3.23x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 1996 (1707) | 407 (394) | 1990 | 359 | 4.90x slower | 5.54x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 71398 (53129) | 13945 (13028) | 71040 | 13456 | 5.12x slower | 5.28x slower | 654 / 214 |

spice-ts is still slower than ngspice-47 KLU in every analysis-time cell.
The two mesh wall-time "wins" are ngspice process startup only: ngspice's own
analysis beats spice-ts by 3.2-3.4x there. The MOS 10k spice-ts cell ran into
a load spike (the A/B above measured ~21.5 s CPU for the same build and
deck), so its ratio is inflated; ngspice's MOS cells also ran slower than in
#548's table. Because the engines are not load-paired these ratios are rough;
the unloaded #426 table in `PERFORMANCE_BASELINE.md` stays the reference until
an unloaded rerun.

## 5. Remaining scope (not in this PR)

- RC ladder 50k: result recording (`save`, 15.6%) is now the #1 frame again:
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
- Mesh OP: the single numeric `factorize` (27-67%) and `amdOrdering`
  (8-15%). Better ordering or supernodal LU.
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
