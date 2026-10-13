# Issue #878: CMOS chain transient Newton iterations vs ngspice-47

#842 measured 599 transient Newton iterations for spice-ts against 483 for ngspice-47 on the
`cmos-inverter-chain-tran` 10k scaling deck, for the same 214 timepoints. This directory has the
per-timepoint comparison, the root cause, the fix and before/after numbers.

Host: Apple M5 Pro, macOS, Node v22.23.1, ngspice-47 (Homebrew, and a source build of the
`ngspice-47` tag, see below). Base = `main` at `5572c5b0`. Branch = this PR. Decks are the M2
scaling decks from `benchmarks/performance/scaling-m2-fixture.mjs`, byte-identical for both
simulators. The Mac is shared with other lanes. Load average was 4 to 38 during these runs (see
`ab-load.txt`), and every heavy run went through `spice-heavy`.

## Per-timepoint iterations

ngspice has no per-timepoint iteration output, so `scripts/ngspice-47-iterlog.patch` adds one
`fprintf` after the `NIiter` call in `dctran.c` (time, step, iterations of that call, return code,
order), printed only when `NGSPICE_ITERLOG` is set. `scripts/ngspice-iterlog.sh` builds it and logs
the deck. The instrumented build reports the same `.options acct` totals as the Homebrew binary
(483 transient iterations, 214 timepoints, 0 rejected, SPARSE 1.3 in both; `logs/*.acct.txt`), so
the print does not change the run. `scripts/spice-ts-iterlog.mjs` prints the same lines for
spice-ts (`createTransientSim`, one `advanceSolution()` per accepted point), and
`scripts/compare-iterlog.mjs` pairs them point by point.

The two engines take the same time grid (all 213 steps match), so the counts compare directly.
1k and 10k nodes give identical counts (the edge reaches about 20 stages in 2 ns).

| run | spice-ts iterations | histogram (iterations:points) | points vs ngspice-47 (more / equal / fewer) | pairs spice-ts/ngspice |
|---|---|---|---|---|
| ngspice-47 | 483 | 2:156 3:57 | | |
| base `5572c5b0` | 599 | 1:17 2:6 3:190 | 133 / 63 / 17 | 3/2 x133, 3/3 x57, 2/2 x6, 1/2 x17 |
| branch | **466** | 1:17 2:139 3:57 | **0** / 196 / 17 | 2/2 x139, 3/3 x57, 1/2 x17 |

(`logs/compare-{base,branch}-{1000,10000}.txt`, raw logs next to them.)

The extra iterations were spread evenly: 133 timepoints took 3 iterations where ngspice-47 takes 2.
No timepoint was rejected in either engine.

## Root cause

ngspice-47 enters every transient timepoint in `MODEINITPRED`. In that mode mos1load.c does not
read the device voltages from the last solution. It extrapolates vbs, vgs and vds from the two
accepted points, `(1 + xfact) * state1 - xfact * state2` with `xfact = CKTdelta / CKTdeltaOld[1]`,
and limits the result against the accepted junction voltages (`CKTstate0 = CKTstate1`). The first
iterate is then linearised close to the new solution, and the second one usually converges.

spice-ts had this predictor for diodes and BJTs (`devices/diode.ts`, `devices/bjt.ts`) but not for
MOS1. The first MOS1 load of a timepoint was linearised at the previous accepted solution, so
whenever the chain was moving it needed a third iterate.

## Fix

`packages/core/src/devices/mosfet.ts`: level-1 MOSFETs implement `beginTransientNewton` like the
diode and BJT. The state store shared by the batch-stamped instances keeps the solution at the last
two accepted points and the accepted step. The first load of each attempt (batched or per-device)
reads node voltages `v(n) + x * (v(n) - v(n-1))`, `x = dt / dt(n)`, and later loads read the Newton
iterate. A retried timepoint restores the junction voltages loaded at the accepted point before
limiting. After the operating point there is one accepted point, and the prediction is that point
(dctran.c copies CKTstate1 into CKTstate2 there).

`packages/core/src/analysis/transient-step.ts` (Newton code only): `beginTransientNewton(dt,
accepted)` now goes to every device that has it, not only self-limiting ones (MOS1 nodes are still
damped, unlike diode/BJT nodes), and plain MOS1 instances are started together through
`MOSFET.batchBeginTransientNewton`.

Known differences from ngspice, all inside the Newton tolerance:

- ngspice extrapolates the branch voltages of the last load at each accepted point, which comes
  from the iterate before the accepted solution. spice-ts extrapolates the accepted node voltages
  (the same linear map, applied to the accepted solution).
- The formula is written `v(n) + x * (v(n) - v(n-1))`, so a node that did not move is predicted
  exactly and a settled device keeps its #842 cached load.
- The Meyer and junction charge companions are still evaluated at the iterate on that first load.
  ngspice also extrapolates qgs/qgd/qgb there. The scaling decks have no MOS charges.
- 17 settled timepoints at the start (before the input edge) converge on the first iterate in
  spice-ts. ngspice `NIiter` never accepts iterate 1 (`noncon = 1` when `iterno == 1`), so it takes
  2 there. That rule is not part of this change. Adding it would cost those 17 iterations back.

## Waveform parity

`scripts/parity.mjs` runs ngspice-47 (Homebrew) on the same deck with only the `.print` card
replaced by a `wrdata` of v(s1)..v(s40) at 17 digits. It compares base and branch at the 214
matched points (`parity-1000.json`, `parity-10000.json`):

| nodes | base max abs diff vs ngspice-47 | branch max abs diff vs ngspice-47 | base vs branch |
|---|---|---|---|
| 1k | 6.279991e-4 V (s19, t=1.945 ns) | 6.279976e-4 V (same point) | 5.06e-9 V |
| 10k | 6.279991e-4 V (s19, t=1.945 ns) | 6.279976e-4 V (same point) | 5.06e-9 V |

Parity is unchanged, slightly better in the 7th digit. The 0.63 mV gap to ngspice-47 exists before
and after this change and is not explained here.

## Wall clock A/B

`../issue-842/scripts/ab.sh` (fresh process per sample, base/branch order flipped every round, 1k
and 10k: median of 3 calls after 1 warm-up, 50k: one cold call), summarised by
`../issue-842/scripts/summary.mjs`; 5 rounds each (`ab-1k.jsonl`, `ab-10k.jsonl`, `ab-50k.jsonl`).
Speedup is base / branch per round, so > 1 means the branch is faster.

| deck | nodes | base median (range) ms | branch median (range) ms | speedup, median of pairs (range) | results |
|---|---|---|---|---|---|
| cmos-inverter-chain-tran | 1k | 194 (172-202) | 181 (180-204) | 1.043x (0.948-1.087) | differ (iterates) |
| rc-ladder-tran | 1k | 30 (27-31) | 31 (27-32) | 0.968x (0.942-1.007) | bit-identical |
| resistor-mesh-op | 1k | 21 (20-22) | 20 (19-22) | 1.059x (0.982-1.139) | bit-identical |
| cmos-inverter-chain-tran | 10k | 2130 (2028-2238) | 2082 (1970-2172) | 1.030x (0.966-1.094) | differ (iterates) |
| rc-ladder-tran | 10k | 216 (212-228) | 231 (216-243) | 0.945x (0.889-1.057) | bit-identical |
| resistor-mesh-op | 10k | 157 (145-165) | 159 (139-173) | 0.973x (0.840-1.183) | bit-identical |
| cmos-inverter-chain-tran | 50k | 23541 (18762-46982) | 20632 (20420-44945) | 1.028x (0.810-1.143) | differ (iterates) |
| rc-ladder-tran | 50k | 1847 (1548-4914) | 1935 (1588-4668) | 0.975x (0.955-1.053) | bit-identical |
| resistor-mesh-op | 50k | 1249 (986-2871) | 1135 (1014-3557) | 0.984x (0.807-1.232) | bit-identical |

In-process interleaved A/B (`scripts/ab-inproc.mjs`: both dists in one process, alternating calls,
wall and process CPU time; `ab-inproc.jsonl`):

| deck | nodes | rounds | wall speedup (range) | CPU speedup (range) |
|---|---|---|---|---|
| cmos-inverter-chain-tran | 1k | 9 | 1.051x (1.017-1.116) | 1.007x (0.963-1.206) |
| cmos-inverter-chain-tran | 10k | 9 | 1.029x (0.907-1.196) | 1.030x (0.900-1.224) |
| cmos-inverter-chain-tran | 50k | 5 | 1.121x (0.998-1.376) | 1.060x (0.987-1.307) |
| rc-ladder-tran | 10k | 15 | 0.969x (0.848-1.093) | 1.005x (0.791-1.190) |
| resistor-mesh-op | 10k | 15 | 0.984x (0.856-1.425) | 1.004x (0.741-1.300) |

Reading:

- The CMOS chain gains 3-6% (12% wall at 50k in-process). Every range crosses 1.0, so this is a
  small, noisy gain, not a large one. Iterations drop 22%, but the DC operating point (226 of 692
  Newton iterations at 10k, 1110 of 1576 at 50k) is untouched, and the extra iterations base took
  were the cheap ones: on settled stages the #842 cache hits. The predicted first iterate misses
  the cache on about 2,000 of the 20,000 devices per timepoint (0.44M of 4.24M predicted loads).
  Transient misses go from 0.71M to 1.17M while transient loads go from 16.2M to 13.5M (counted
  with an instrumented build, not committed).
- Losses: the RC ladder reads 0.945x-0.975x in the fresh-process A/B. It has no MOSFET; the only
  code it runs differently is one empty `batchBeginTransientNewton` call per step, and its results
  are bit-identical. The resistor mesh never reaches the changed code (`.op` only) and reads
  0.973x-0.984x at 10k/50k. In-process CPU time for both is 1.004-1.005x. These are host noise at
  the load seen, and they are published as measured.
- A first version kept the predictor history per instance in the MOS1 state rows and recorded it
  in `acceptTransientStep` through `ctx.getVoltage`. It had the same iterations, but it was slower
  than base on the CMOS chain (10k 0.952x, 50k 0.880x in the same `ab.sh` setup): about 0.5 s of
  history bookkeeping in a 10k `--cpu-prof` (warm-up plus measured call) and a 2.3x wider state
  row. The committed version keeps
  one solution copy per state store and timepoint.

## Files

- `scripts/ngspice-47-iterlog.patch`, `scripts/ngspice-iterlog.sh`: instrumented ngspice-47 build.
- `scripts/spice-ts-iterlog.mjs`, `scripts/compare-iterlog.mjs`: per-timepoint logs and comparison.
- `scripts/parity.mjs`: waveform parity against ngspice-47.
- `scripts/ab-inproc.mjs`: in-process A/B. `scripts/profile.mjs`: `--cpu-prof` driver.
- `logs/`: iteration logs and comparisons, ngspice-47 acct summaries.
- Regression tests: `packages/core/src/analysis/transient-mos1-predictor-878.test.ts` (the 42-node
  deck: every timepoint takes ngspice-47's count or 1 where ngspice takes 2; red on base with 133
  mismatches) and `packages/core/src/devices/mosfet-predictor-878.test.ts` (the first load of a
  timepoint is at the extrapolated voltages, also on a retry and after a reset).
