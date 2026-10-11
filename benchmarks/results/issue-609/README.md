# Issue #609: M2 scaling decks after #570, next bottleneck

Base: main `8013a23` (#570/PR #580 merged). Machine: Apple M5 Pro (18 cores),
Node v22.23.1, ngspice-47 (KLU compiled in). The machine was shared with other
agents throughout (load average roughly 10-120 on 18 cores, changing between
runs). The A/B below therefore starts both builds at the same moment and
reports process CPU time next to wall time. CPU time is the column to read.

## 1. Profile after #570: which hot spot

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1`
(one warmup plus one measured `simulate()`), run by
`benchmarks/results/issue-570/scripts/prof.sh`, summarised with
`benchmarks/performance/profile-summary.mjs`. Raw `.cpuprofile` files and
summaries are in `profiles/` (`-before` = main `8013a23`, `-after` = this
branch). Before and after ran at different moments under different load, so
compare shares, not absolute ms.

Top 5 self-time frames (`issue-570/scripts/table.mjs`):

| deck | build | sampled s | #1 | #2 | #3 | #4 | #5 |
|---|---|---:|---|---|---|---|---|
| rc-ladder-tran-1000 | before | 0.25 | buildCompanionSystem 13.0% | factorize 11.7% | attemptStep 8.8% | save 6.8% | compileSourceTextModule 6.2% |
| rc-ladder-tran-1000 | after | 0.39 | attemptStep 19.6% | factorize 10.8% | (garbage collector) 9.4% | advanceSolution 7.8% | buildCompanionSystem 7.6% |
| rc-ladder-tran-10000 | before | 1.30 | factorize 17.0% | buildCompanionSystem 12.3% | attemptStep 12.2% | stampStaticDevices 11.6% | (garbage collector) 6.8% |
| rc-ladder-tran-10000 | after | 1.77 | factorize 15.7% | attemptStep 13.6% | buildCompanionSystem 10.6% | stampStaticDevices 8.1% | (garbage collector) 7.9% |
| rc-ladder-tran-50000 | before | 5.35 | factorize 19.0% | attemptStep 13.4% | save 11.0% | buildCompanionSystem 10.4% | (garbage collector) 9.1% |
| rc-ladder-tran-50000 | after | 7.63 | factorize 20.6% | attemptStep 13.9% | buildCompanionSystem 10.0% | stampStaticDevices 10.0% | (garbage collector) 8.5% |
| resistor-mesh-op-10000 | before | 0.49 | factorize 29.0% | (garbage collector) 11.5% | amdOrdering 11.0% | analyzePattern 5.3% | compile 3.9% |
| resistor-mesh-op-10000 | after | 0.70 | factorize 29.0% | amdOrdering 13.8% | (garbage collector) 8.1% | newtonRaphson 4.8% | lockTopology 4.0% |
| cmos-inverter-chain-tran-1000 | before | 1.86 | MOSFET.stamp 18.1% | factorize 12.9% | batchStamp 12.5% | stampG 8.6% | (garbage collector) 7.7% |
| cmos-inverter-chain-tran-1000 | after | 2.59 | MOSFET.stamp 14.1% | batchStamp 12.9% | evaluateBulkJunctions 11.4% | stampG 10.4% | factorize 9.2% |

After #570 the profile is flat. Per-line self time
(`scripts/lineticks.mjs`, V8 `positionTicks`) on the 50k RC ladder:

- The single hottest **line** of the whole profile was result recording in
  `solveTransient`: `columns[k].push(solution[slots[k]])`, 515 ms of 5.35 s
  sampled (9.6%). Every saved point pushed one value into each of ~50k
  separate `number[]` columns, so each point touched 50k scattered array
  headers and backing stores, and the arrays grew one element at a time.
- `GilbertPeierlsSolver.factorize` is the largest **function** (17-21% on the
  RC ladder, 29% on the mesh OP), but its cost is spread over the scatter,
  the left-looking update, the pivot search, the L store and the workspace
  clear, plus the bit-identical-input check of #486 (about 15% of the frame,
  for the 299 of 475 calls that reuse factors). The book-keeping a
  pivot-sequence replay could drop (dedup flags, active-set build and sort,
  pinv restore) is about 17% of the frame, i.e. roughly 3% of the run, and a
  replay must re-verify every pivot and every zero to stay bit-identical. Not
  attempted here; see Remaining scope.
- `attemptStep` is mostly the triangular solves inlined into it; the MOS
  chain's top frames remain device-model code (`MOSFET.stamp`, `batchStamp`,
  `evaluateBulkJunctions`), outside this lane.

Chosen hot spot: **transient result recording** (`save`), the largest
single-line cost and the frame that grows fastest with circuit size (6.8% at
1k, 3.2% at 10k but 11.0% at 50k).

### The change

New `packages/core/src/analysis/transient-columns.ts`: `ColumnRecorder`
copies each saved point contiguously into a point-major `Float64Array` chunk
(`record`), and when the chunk is full, or at the end of the run (`flush`),
appends the buffered rows to each column in turn, so each column receives its
values in one burst. The chunk is bounded at 64 rows and 2^21 values (16 MiB):
64 rows at 1k and 10k nodes, 41 rows at 50k. It is allocated on the first
saved point. `solveTransient` uses it in place of the per-point push and
flushes before building the `TransientResult`. The result format
(`Map<string, number[]>`) is unchanged; `simulateStream` and
`createTransientSim` are untouched.

Why bit-identical: values are copied Float64 to Float64 and appended to the
same columns in the same point order, so every column holds exactly the
numbers the per-point push produced. No solver, device, tolerance or
step-control code changed. The columns are only observable after
`solveTransient` returns, and the flush runs before that.

Test: `packages/core/src/analysis/transient-columns.test.ts` (ran RED first:
module missing). It compares the recorder with per-point pushes using
`Object.is` on every value (0, -0, NaN, ±Infinity, subnormals, random
magnitudes), for 1/2/3/7/64 rows per chunk and point counts around the chunk
boundary, with duplicate and out-of-order slots, with the solution vector
mutated after each `record`, after an intermediate flush, with pre-filled
columns, and with no columns. The existing #548 test
`transient-record.test.ts` still pins `solveTransient` against the streamed
`TransientStep` Maps bit for bit.

### Profile after the change

On the 50k RC ladder, recording went from `save` 11.0% (515 ms on its push
line) to `flush` 4.1% + `record` 0.5% (292 ms + 28 ms on their hot lines, in
a run that sampled 7.63 s instead of 5.35 s, i.e. under heavier load). A
synthetic in-process micro benchmark (`scripts/record-micro.mjs`, 50,001
columns x 235 points, loaded machine) gave 1.9-2.2 s for the per-point push
against 0.8-1.0 s for the recorder. The remaining recording cost is the
`number[]` growth and the 94 MB of result data itself.

## 2. Results are bit-identical

- `issue-486/sample.mjs` hashes (SHA-256) the time axis and every node
  voltage and branch current as Float64 bytes. In all 108 samples of the A/B
  both builds gave the same hash per cell (rc 1k `ac5d6929fc25a221`, rc 10k
  `e59b4235d4c157c7`, rc 50k `d706c8a5619a8049`, mesh 10k `73da68241f2c6ad6`,
  MOS 1k `04a9fa4f0f067778`, MOS 10k `a3f30d5252ca3690`), the same hashes as
  the #570 evidence.
- Aggregate corpus: `issue-486/corpus-hash.mts` digests of all 100 fixtures'
  spice-ts `EngineExecution` are byte-identical between main `8013a23` and
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
Ratios are before/after, so >1 means this change is faster. The mesh OP cell
is the control: it saves a single DC point.

Process CPU time (user + system, includes GC helper threads):

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 295 (240) | 296 (239) | 1.00x | 1.00x (0.74..1.03) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 | 9 | 1070 (867) | 1078 (963) | 0.99x | 1.00x (0.90..1.07) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 | 9 | 4752 (4486) | 4725 (4223) | 1.01x | 1.04x (0.97..1.06) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 457 (413) | 460 (408) | 0.99x | 0.99x (0.88..1.13) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 2034 (1655) | 2004 (1659) | 1.02x | 1.00x (0.96..1.03) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 25391 (18791) | 23782 (17840) | 1.07x | 1.01x (0.95..1.09) | yes a3f30d5252ca3690, 654 pts |

Wall time:

| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 9 | 238 (100) | 248 (100) | 0.96x | 1.00x (0.80..1.17) | yes ac5d6929fc25a221, 235 pts |
| rc-ladder-tran:10000 | 9 | 1181 (610) | 1190 (627) | 0.99x | 1.02x (0.97..1.11) | yes e59b4235d4c157c7, 235 pts |
| rc-ladder-tran:50000 | 9 | 5866 (3683) | 5546 (3379) | 1.06x | 1.07x (1.00..1.09) | yes d706c8a5619a8049, 235 pts |
| resistor-mesh-op:10000 (control) | 9 | 399 (280) | 403 (285) | 0.99x | 1.02x (0.93..1.17) | yes 73da68241f2c6ad6, 1 pts |
| cmos-inverter-chain-tran:1000 | 9 | 2402 (1409) | 2365 (1413) | 1.02x | 1.00x (0.98..1.02) | yes 04a9fa4f0f067778, 654 pts |
| cmos-inverter-chain-tran:10000 | 9 | 27372 (17681) | 27278 (16809) | 1.00x | 1.02x (0.96..1.14) | yes a3f30d5252ca3690, 654 pts |

**Reading it honestly: this is a small win.** Only the 50k RC ladder moves
outside noise: 1.04x CPU, 1.07x wall (paired medians; every wall pair >= 1.00x,
CPU min 0.97x). At 1k and 10k, and on the MOS chain, the paired ratios are
1.00-1.02x, i.e. no measurable change in either direction. The profile share
of recording dropped by about 6 points at 50k, but the end-to-end CPU gain is
smaller: the 94 MB of result data and the `number[]` growth are still paid, now
in `flush`. No regression was found beyond noise; the worst single pairs (rc
1k CPU 0.74x, rc 10k 0.90x, mesh 0.88x) sit in cells whose medians are 0.99-1.00x.

## 4. spice-ts vs ngspice-47 (KLU), same machine, same decks, 1k/10k/50k

`pnpm bench:scaling:m2` harness (run as `npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900`)
on this branch's build, output `scaling-m2-after.json`, table by
`issue-570/scripts/scaling-table.mjs`. Each engine cell ran at a different
moment, so load is **not** paired across engines, and only 3 samples per cell
were taken to bound machine load.

| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |
|---|---:|---:|---:|---:|---:|---|---|---|
| rc-ladder-tran | 1,000 | 167 (139) | 94.1 (77.6) | 162 | 25.9 | 1.78x slower | 6.26x slower | 235 / 120 |
| rc-ladder-tran | 10,000 | 1915 (1599) | 767 (618) | 1828 | 627 | 2.50x slower | 2.92x slower | 235 / 120 |
| rc-ladder-tran | 50,000 | 5494 (4029) | 2049 (1975) | 5199 | 1676 | 2.68x slower | 3.10x slower | 235 / 120 |
| resistor-mesh-op | 1,024 | 21.5 (19.0) | 36.7 (36.5) | 17.2 | 4.5 | 0.58x (faster) | 3.82x slower | op / op |
| resistor-mesh-op | 10,000 | 280 (218) | 192 (181) | 242 | 64.3 | 1.46x slower | 3.76x slower | op / op |
| resistor-mesh-op | 50,176 | 3273 (3038) | 1218 (1212) | 3050 | 663 | 2.69x slower | 4.60x slower | op / op |
| cmos-inverter-chain-tran | 1,000 | 1607 (1484) | 357 (350) | 1598 | 309 | 4.50x slower | 5.16x slower | 654 / 214 |
| cmos-inverter-chain-tran | 10,000 | 20832 (19767) | 5842 (5568) | 20762 | 5620 | 3.57x slower | 3.69x slower | 654 / 214 |
| cmos-inverter-chain-tran | 50,000 | 186198 (181513) | 112451 (89268) | 185786 | 111190 | 1.66x slower | 1.67x slower | 654 / 214 |

- spice-ts is slower than ngspice-47 KLU in analysis time on every deck and
  size (1.7-6.3x). The 1k mesh wall-time "win" is ngspice process startup
  only; its analysis is 3.8x faster there.
- Before/after against ngspice: there is no separate before run of this
  harness. Applying the paired CPU medians of section 3, the before ratios are
  the same as the after ratios within noise at 1k/10k, and about 4% higher on
  the 50k RC ladder (about 2.8x wall instead of 2.68x). This is derived, not
  measured.
- The MOS1 inverter chain at **50k nodes now completes** in spice-ts (3 of 3
  samples; 186 s). The #426 table recorded a `SingularMatrixError` there
  (#462, since closed on main). This PR did not cause that change (it does
  not touch the OP path); it was observed on this branch, which contains main
  `8013a23`. The ngspice
  50k chain cell (89-123 s) is far slower per node than its 10k cell
  (5.8 s), and its samples spread 1.4x, so treat that ratio as load-affected.
- Probe values: RC ladder `v` 0.168395 vs 0.168377 (1.1e-4 relative, unchanged
  from #426), mesh identical to 7 digits, inverter chain `v(s20)` at 2 ns
  0.3592 V (spice-ts) vs 0.3501 V (ngspice); the #426 table had 0.6456 V for
  spice-ts. That probe sits on a steep edge and moved with MOS1 model work on
  main (e.g. #601), not with this PR (bit-identical A/B hashes above).
- The unloaded #426 table in `PERFORMANCE_BASELINE.md` stays the reference
  until an unloaded rerun.

## 5. Remaining scope (not in this PR)

- `factorize` (17-21% RC, 29% mesh): close to its floor per call for this
  left-looking algorithm. Options: a verified pivot-sequence replay (about
  17% of the frame, must check every pivot choice and every exact zero to stay
  bit-identical), and making the #486 identical-input check cheaper (about
  15% of the frame).
- Step count: 235 / 654 spice-ts timepoints vs 120 / 214 for ngspice. Still
  the largest single factor on the transient decks (one factorization and
  solve per Newton iteration per step). Step-control work, not a hot-path
  change.
- Assembly on the RC ladder (`buildCompanionSystem` + `stampStaticDevices` +
  `stampDynamicDevices` + `stampPrevB`, about 27% at 50k): the dynamic-row mask
  and the full restamp of constant linear G/C every Newton iteration.
- MOS chain: `MOSFET.stamp` / `batchStamp` / `evaluateBulkJunctions`
  (device-model lane).
- Memory: result recording still holds the full `number[]` columns
  (94 MB at 50k nodes x 235 points) plus growth slack.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm -C packages/core build
# profiles (writes <dir>/<deck>-<nodes>.{cpuprofile,summary.txt})
spice-heavy bash benchmarks/results/issue-570/scripts/prof.sh /tmp/prof-after \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 cmos-inverter-chain-tran:1000
node benchmarks/results/issue-570/scripts/table.mjs /tmp/prof-before /tmp/prof-after
TOP=40 node benchmarks/results/issue-609/scripts/lineticks.mjs <x.cpuprofile> packages/core/dist/<chunk>.js save,flush,record,factorize
npx tsx benchmarks/results/issue-609/scripts/record-micro.mjs $PWD/packages/core/src/analysis/transient-columns.ts 50001 235
# paired A/B: copy packages/core/dist of main and of this branch to two dirs
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 9 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:10000 \
  cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus digests: <root>/packages/core/dist must be the build under test
spice-heavy npx tsx benchmarks/results/issue-486/corpus-hash.mts <root> /tmp/digests.json
# ngspice comparison
spice-heavy npx tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran,resistor-mesh-op,cmos-inverter-chain-tran \
  --sizes=1000,10000,50000 --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=900 \
  --output=benchmarks/results/issue-609/scaling-m2-after.json
node benchmarks/results/issue-570/scripts/scaling-table.mjs benchmarks/results/issue-609/scaling-m2-after.json
```
