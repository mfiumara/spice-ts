# Issue #842: M2 scaling-deck transients vs ngspice-47, and the MOS1 device-load hot path

Decks: the three M2 scaling decks from `benchmarks/performance/scaling-m2-fixture.mjs` (`rc-ladder-tran`,
`resistor-mesh-op`, `cmos-inverter-chain-tran`) at 10k and 50k nodes. `resistor-mesh-op` has no transient
(it is a `.op` deck), so it appears here as a control only. ngspice-47 gets byte-identical netlists
(`scripts/write-decks.mjs`, checked with `cmp`).

Host: Apple M5 Pro (18 cores), macOS, Node v22.23.1, ngspice-47 (Homebrew). The Mac is shared with other
spice-ts lanes and projects. Load average was 4 to 13 during these runs, and ngspice / rustc jobs from other
lanes ran at the same time as some samples. Every run went through `spice-heavy`. Ranges are wide, so the
tables give medians and full ranges, and the paired ratio per round. Base = `main` at `eb173b51`.
Branch = this PR (`packages/core/src/devices/mosfet.ts`).

## Profile breakdown (base, self time by category)

`node --cpu-prof ... benchmarks/performance/profile-scaling-m2.mjs <deck> <nodes> 1` (one warm-up plus one
measured `simulate()`), summarised by `node scripts/breakdown.mjs [--table] profiles/*.cpuprofile`
(full per-phase output: `breakdown.txt`). V8 inlines the MOS1 equations into `MOSFET.batchStamp`, so
evaluation and stamping are one category, "device load", like ngspice's CKTload "Matrix load time".
Parse/compile falls under "other". "transient phase" is the share of samples under the transient stepping
frames (the rest is DC OP, parse/compile and GC).

| profile | sampled ms | transient phase | device load | sparse LU | history + LTE/timestep control | Newton control + convergence tests | result recording | GC | other |
|---|---|---|---|---|---|---|---|---|---|
| cmos-inverter-chain-tran-10000 | 4740 | 64.5% | **46.5%** | 14.5% | 7.9% | 11.2% | 1.8% | 11.1% | 7.2% |
| cmos-inverter-chain-tran-50000 | 48915 | 40.7% | **49.1%** | 13.6% | 5.1% | 12.6% | 0.8% | 15.2% | 3.6% |
| rc-ladder-tran-10000 | 488 | 55.4% | 17.8% | 17.6% | 6.5% | 8.9% | 11.3% | 10.4% | 27.4% |
| rc-ladder-tran-50000 | 3457 | 59.9% | 25.6% | 14.0% | 16.1% | 3.0% | 4.9% | 11.7% | 24.7% |
| resistor-mesh-op-10000 | 484 | 0.0% | 1.9% | **35.5%** | 0.0% | 5.6% | 0.0% | 11.4% | 45.5% |
| resistor-mesh-op-50000 | 2229 | 0.0% | 2.0% | **43.5%** | 0.0% | 3.6% | 0.0% | 12.7% | 38.2% |

The top measured hot path is MOS1 device load on the CMOS chain: 46-49% of all samples, and 58% of the
transient phase at 10k (1766 of 3057 ms). `MOSFET.batchStamp` alone is the top self-time frame (30% at 10k,
35% at 50k). The RC ladder and the mesh are dominated by "other" (parse/compile, Newton loop) and sparse LU,
and they take well under a second at 10k.

## Change

A device-load memo in `MOSFET.batchStamp`. Each `MosfetStateStore` keeps, per member, the inputs of its last
batched load (vD, vG, vS, vB, the previous limited vbs/vbd read from the state row, gmin) and the companion
values that load stamped (gbs, gbd, ceqbs, ceqbd, gm, gds, gmbs, Ieq). When a device's inputs are
bit-identical (`===` plus `Object.is`, so NaN never matches and -0 differs from +0), the batch stamps the
cached values and skips the MOS1 junction/channel evaluation and the state writes.

Why it is exact: the evaluation is a pure function of those inputs and the device constants, and the state
row still holds that load's writes. Every other writer of a MOS1 state row (the per-device `stamp()` path and
the vbs/vbd/von setters) invalidates the row first, and a constants change (temperature) empties the cache.
No tolerance, no per-circuit switch.

On `cmos-inverter-chain-tran` 10k, 95.6% of the transient's batched loads hit (15.47M of 16.18M; the settled
stages far from the switching edge), against 41% in the DC operating point (gmin stepping moves every node).
Microbenchmark of `batchStamp` on the 10k chain: 52 ns per device before, 24 ns on a hit, 55 ns on a miss.
At 50k: about 75 ns before, 31 ns on a hit, 72 ns on a miss.

## Numerics: bit-identical

`scripts/run.mjs` hashes (sha256) the IEEE-754 bits of every time point and every node voltage and branch
current vector (or every OP value). Every base and branch sample of every deck has the same digest:

| deck | 10k digest | 50k digest |
|---|---|---|
| rc-ladder-tran | 64a4c2f7f31f... | d7c0d7119898... |
| resistor-mesh-op | 73da68241f2c... | 2cc3802569b2... |
| cmos-inverter-chain-tran | 86b987c9da8c... | a8a9d19d6dfe... |
| cmos-inverter-chain-tran as `.op` | e205d5ed5767... | d1719e4eb5ab... |

Newton iterations, accepted steps and rejected steps are also unchanged (cmos 10k: 226 DC + 599 transient
iterations, 213 accepted steps, 0 rejected; 50k: 1110 + 599).

## Wall clock A/B (interleaved base/branch, fresh process per sample)

`scripts/ab.sh` (`BASE_DIST`/`BRANCH_DIST` = copies of each build's `packages/core/dist`), summarised by
`scripts/summary.mjs`. spice-ts time is in-process `simulate()` (parse + compile + OP + analysis).
ngspice-47 time is the wall time of a fresh `ngspice -b` process (startup and parsing included).

Touched deck, CMOS inverter chain transient:

| run | base median (range) ms | branch median (range) ms | speedup, median of pairs (range) | n |
|---|---|---|---|---|
| 10k, warm, median of 3 calls per process (`ab-10k-cmos-repeated.jsonl`) | 2499 (2437-3180) | 2071 (2044-2117) | **1.207x** (1.169-1.502) | 5 |
| 10k, warm, 1 call per process, ngspice interleaved (`ab-10k.jsonl`) | 2603 (2174-2979) | 2421 (2173-2561) | 1.137x (0.885-1.301) | 5 |
| 50k, cold, 1 call per process (`ab-50k.jsonl`) | 22957 (21191-27232) | 19916 (18904-23322) | **1.121x** (0.985-1.188) | 5 |

Controls (code path untouched: no MOSFETs), median of 5 (10k) or 3 (50k) warm calls per process, alternating
order (`ab-10k-controls-repeated.jsonl`, `ab-50k-controls-repeated.jsonl`):

| deck | base median (range) ms | branch median (range) ms | speedup (range) | n |
|---|---|---|---|---|
| rc-ladder-tran 10k | 217 (207-230) | 216 (209-238) | 0.986x (0.957-1.028) | 7 |
| resistor-mesh-op 10k | 116 (110-130) | 115 (107-126) | 0.997x (0.932-1.189) | 7 |
| rc-ladder-tran 50k | 1187 (1132-1244) | 1155 (1133-1250) | 1.026x (0.933-1.058) | 5 |
| resistor-mesh-op 50k | 809 (799-845) | 818 (790-836) | 1.011x (0.974-1.032) | 5 |

Medians move by at most 1.1% (mesh 50k, branch slower). The single cold-call 50k run (`ab-50k.jsonl`) gave
rc 1.021x and mesh 0.955x with pair ranges of 0.88-1.17 and 0.87-1.11, which is host noise: neither deck
reaches the changed code.

Not settled: the CMOS chain with `.tran` swapped for `.op` (the miss-heavy path, 41% hits) measured 10k
1018 vs 938 ms medians (pair median 0.923x, range 0.835-1.089) and 50k 13897 vs 15915 ms (pair median
0.881x, range 0.844-1.216), during the noisiest window (load average 13.7, three ngspice processes from
another lane). The isolated miss-path microbenchmark above shows no penalty at 50k (72 vs 75 ns), and the
full 50k transient, which includes this OP, is 1.12x faster. A quiet-host re-measure of the OP-only deck is
still owed before claiming it is neutral.

## spice-ts vs ngspice-47 (same netlists)

ngspice medians from `.options acct` (`ngspice/*.acct.txt`; 5 runs at 10k, 3 at 50k, `ngspice-50k.jsonl`).
spice-ts is the branch, repeated-call medians where available.

| deck | spice-ts branch | ngspice-47 wall (range) | ngspice analysis / load | ngspice transient analysis / load / trunc | iterations spice-ts / ngspice |
|---|---|---|---|---|---|
| rc-ladder-tran 10k | 216 ms | 180 ms (140-211) | 0.109 / 0.048 s | 0.103 / 0.046 / 0.023 s | 238 / 238 tran |
| rc-ladder-tran 50k | 1155 ms | 1370 ms (974-1543) | 1.10 / 0.37 s | 1.07 / 0.35 / 0.42 s | 238 / 238 tran |
| resistor-mesh-op 10k | 115 ms | 1808 ms (1140-2210) | 1.72 s (reorder 1.57 s) | n/a | 2 / 3 |
| resistor-mesh-op 50k | 818 ms | 79097 ms (51082-80941) | 78.6 s (reorder 74.5 s) | n/a | 2 / 3 |
| cmos-inverter-chain-tran 10k | 2071 ms | 5405 ms (5247-6077) | 5.24 / 3.34 s | 2.79 / 1.58 / 0.63 s | 226 DC + 599 tran / 637 DC + 483 tran |
| cmos-inverter-chain-tran 50k | 19916 ms | 78584 ms (77251-81176) | 77.9 / 49.1 s | 16.2 / 8.4 / 4.1 s | 1110 DC + 599 tran / 2360 DC + 483 tran |

Losses: the RC ladder at 10k, where ngspice-47 is about 1.2x faster even including process startup. At
50k the two are within noise of each other.

The CMOS chain and the mesh read faster in spice-ts, but this is not an engine-level claim. On the CMOS
chain spice-ts needs 2.1-2.8x fewer DC iterations (different gmin/source-stepping schedule), while its
transient takes **24% more Newton iterations than ngspice-47 (599 vs 483) for the same 214 timepoints**.
That is a parity gap to chase, not a speed task. The mesh gap is ngspice's sparse reorder. Samples are
interleaved but not CPU-isolated.

## Review fix: junction charge folds (PR #859 review of `8b561cbb`)

`stampTransientCharge` folds the bulk junction charge currents into STATE_CD/CBS/CBD/GBS/GBD after every load
(mos1load.c: cbd += cqbd, cd -= cqbd, gbd += geq, cbs += cqbs, gbs += geq). At `8b561cbb` a cache hit left the
folded row in place, so the next fold stacked on the previous one and `convergenceTest` (mos1conv.c) read the
stacked values. The cache now also stores the load's pre-fold STATE_CD/CBS/CBD (GBS/GBD were already cached),
and a hit restores all five before the fold runs again. The scaling decks above have no junction capacitance,
so they never fold; their only cost is three extra stores per miss and five per hit.

State writers audited: `recordMos1Load` (batched miss and per-device `stamp`, which invalidates first), the
vbs/vbd/von setters and `limitNewtonStep` (invalidate), `foldJunctionChargeCurrent` (restored on a hit), store
merges (fresh cache), constants change (cache emptied).

Regression tests in `mosfet-load-cache-842.test.ts`: the reviewer's probe (batched load + `stampTransientCharge`
vs the uncached per-device path on a CBD/CBS and CJ/CJSW/TOX deck, 24 passes with Euler and trapezoidal, G, b,
every state value and `convergenceTest` compared bit for bit) and an 8-stage junction-cap transient that counts
folds starting from the previous fold's output. On `712611c1` (the reviewed code rebased onto `c14f5ad0`) both
fail: `pass 2 M1 state[13]: 0.0004000000013866242 !== 0.00020000000138662412` and 31 stacked folds. With the fix
both pass, together with all of `src/devices` (82 files, 989 tests) and `transient-iteration-invariant-710`.

A 25-stage junction-cap chain (the inverter chain of the test's deck without its source followers,
`.tran 0.2n 30n`, 213 points) gives the same waveform digest
(`scripts/jcap-digest.mjs`: sha256 of the time points and all 29 voltage/current series, `59139967cfee9e83`) on
base `c14f5ad0`, on the reviewed code and with the fix. The stacked values only reached the convergence test, and on this deck they did not change a
Newton decision. That is luck, not a property, so the fix stands.

### Test fix after the review of `ff07fc7c`

The review of `ff07fc7c` found that deleting any one of the three STATE_CD/CBS/CBD restores on a hit passed the
whole test file. The probe's charge history was never accepted, so every junction fold current was exactly 0 and
a stacked CD/CBS/CBD fold changed nothing. The transient test only looked at GBS/GBD, and only counted a stack
when both were stale. The simulator code is unchanged; the tests now:

- accept the probe's charge history at a seed solution no pass uses, so its folds carry nonzero currents, and
  assert that passes repeating a solution (cache hits) fold a nonzero current on both B-D (index 3) and B-S
  (index 4);
- track each folded value (state[7]/[8]/[9]/[13]/[14]) separately in the transient. A value counts as stacked
  when the previous fold moved it, the load in between had the same inputs (the rest of the row is unchanged),
  and the fold starts from exactly the previous fold's output. The rest-of-row condition excludes 2 coincidences
  on the uncached base, where a one-ulp CD fold landed on the next load's new CD. Each stage of the test's chain
  also drives a source follower whose source is not its bulk. Before that, every vbs was constant and STATE_CBS
  never folded. Each value now folds at least 5,864 times in the run, with 0 stacks.

Each of the five restore deletions is now caught by both tests. In the transient they leave 20 (CD), 5 (CBS),
20 (CBD), 50 (GBS) and 50 (GBD) stacked folds. `mosfet.ts` from before the fix (`1fa757e0^`) still fails both.

### A/B re-measure after the fix

Base = `main` at `c14f5ad0`, branch = the fix. Same `scripts/ab.sh`, `spice-heavy`, load average 7 to 8, other
lanes active. 1k and 10k: median of 3 warm calls per process; 50k: one cold call per process.

| deck | base median (range) ms | branch median (range) ms | speedup, median of pairs (range) | n | digest |
|---|---|---|---|---|---|
| cmos-inverter-chain-tran 1k (`ab-r2-1k-repeated.jsonl`) | 162 (158-689) | 144 (134-242) | 1.188x (1.050-2.844) | 5 | identical 884bc08a23df |
| rc-ladder-tran 1k, control (`ab-r2-1k-repeated.jsonl`) | 21 (21-27) | 23 (21-30) | 0.951x (0.892-1.019) | 5 | identical 253060d6a53a |
| cmos-inverter-chain-tran 10k (`ab-r2-10k-cmos-repeated.jsonl`) | 2382 (1786-3133) | 2272 (1658-2675) | 1.077x (0.891-1.379) | 5 | identical 86b987c9da8c |
| cmos-inverter-chain-tran 50k (`ab-r2-50k.jsonl`) | 22498 (21109-24036) | 18397 (17644-30834) | 1.147x (0.730-1.362) | 3 | identical a8a9d19d6dfe |

The 10k pair median dropped from 1.207x to 1.077x with a much wider range (base 1786-3133 ms) on a busier host,
so the 10k number is noisier than before rather than clearly lower; 1k and 50k agree with the earlier runs.
The 1k RC ladder never reaches MOS1 code, and its 2 ms gap is noise at that size. The earlier tables above are
kept as measured on `eb173b51`.

## Measured and not kept

- A first version of the memo copied cached junction/channel outputs into scratch arrays and rewrote all 15
  state values on every hit: tran 10k 2398 vs 2312 ms (1.04x), 50k about 1.01x. Skipping the state writes
  on a hit (and invalidating on other writers) is what made the memo pay.
- A helper function for the signed-zero comparison was not inlined into `batchStamp` (5% self time).
  Inline `===` plus `Object.is` fixed that.

## Test receipts

- `packages/core/src/devices/mosfet-load-cache-842.test.ts` runs 96 passes of `batchStamp` against the
  uncached per-device `MOSFET.stamp` on a twin circuit and compares G, b and every MOS1 state value with
  `Object.is`. It covers repeated solutions (hits), partial changes, signed zeros flipped on an otherwise
  identical solution, a gmin change and a temperature change on a repeated solution, sublists sharing one
  store, and per-device stamps at a different gate voltage between two batched loads.
- `scripts/mutants.py` (`mutants.txt`): 13 of 14 mutants of the new code fail the test, including all five
  deletions of a fold restore on a hit (CD, CBS, CBD, GBS, GBD). The survivor drops the
  constants-epoch flush; it is masked because `applyTemperature` also writes `lastVon`, which invalidates
  the row. The flush stays as the explicit guard.
- `pnpm build`, `pnpm lint`, and targeted vitest (`src/devices`, 965 tests; MOS convergence, transient
  convergence/iteration-invariant, inverter-chain OP) pass locally. The full suite runs in CI.

## Remaining scope

- Newton control + convergence tests are now the second-largest transient category on the CMOS chain
  (per-device `convergenceTest`, 8-10% of samples). A batched convergence test would come next.
- GC is 11-15% (fresh `Float64Array(assembler.b)` per Newton iteration, LU and per-step copies).
- The 599 vs 483 transient Newton iteration gap against ngspice-47 on the CMOS chain (parity).
- A quiet-host re-measure of the CMOS-as-OP deck (see above).

## Commands

```
node scripts/write-decks.mjs <deck-dir>
BASE_DIST=<base dist copy> BRANCH_DIST=<branch dist copy> NG_DIR=<deck-dir> spice-heavy scripts/ab.sh ab-10k.jsonl 5 10000 rc-ladder-tran resistor-mesh-op cmos-inverter-chain-tran
BASE_DIST=... BRANCH_DIST=... spice-heavy scripts/ab.sh ab-50k.jsonl 5 50000 rc-ladder-tran resistor-mesh-op cmos-inverter-chain-tran
WARMUPS=1 REPEATS=5 ... scripts/ab.sh ab-10k-controls-repeated.jsonl 7 10000 rc-ladder-tran resistor-mesh-op
WARMUPS=1 REPEATS=3 ... scripts/ab.sh ab-50k-controls-repeated.jsonl 5 50000 rc-ladder-tran resistor-mesh-op
WARMUPS=1 REPEATS=3 ... scripts/ab.sh ab-10k-cmos-repeated.jsonl 5 10000 cmos-inverter-chain-tran
WARMUPS=1 REPEATS=3 ... scripts/ab.sh ab-10k-cmos-op-repeated.jsonl 5 10000 cmos-inverter-chain-tran-as-op
... scripts/ab.sh ab-50k-cmos-op.jsonl 5 50000 cmos-inverter-chain-tran-as-op
spice-heavy scripts/ngspice-runs.sh <deck-dir> ngspice-50k.jsonl 3 50000 rc-ladder-tran resistor-mesh-op cmos-inverter-chain-tran
node scripts/summary.mjs <ab.jsonl>... --ng ngspice
python3 scripts/mutants.py
node scripts/jcap-digest.mjs <core dist dir> 25
```

(Paths relative to `benchmarks/performance/results/issue-842/`, except `ab.sh` / `run.mjs`, which resolve the
repo root themselves. The base dist is `pnpm -C packages/core build` on `eb173b51`.)
