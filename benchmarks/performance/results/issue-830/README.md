# Issue #830: MOS1 device load and Newton step limiting on the CMOS inverter chain

Deck: the M2 `cmos-inverter-chain-tran` deck (`benchmarks/performance/scaling-m2-fixture.mjs`) at 10k and
50k nodes, with `.tran` replaced by `.op` exactly as `benchmarks/rust-lu-spike/op-swap.ts` does. The same
netlist text goes to spice-ts and to ngspice-47 (`ngspice -b`, `.options acct`).

Machine: Apple M5 Pro, Node v22.23.1, ngspice-47 (Homebrew). Shared host with other lanes, load average
3.6-4.0 during the runs. Base = `main` at `30145e8c`. Branch = this PR; the measured branch dist is byte-identical
to the committed code's build.

## Profile breakdown (self time by frame category)

`node benchmarks/performance/profile-breakdown.mjs profiles/*.cpuprofile` (raw output: `breakdown.txt`).
V8 inlines the MOS1 junction and channel equations into `MOSFET.batchStamp`, so device evaluation and stamping
are one category here. That matches ngspice's "Matrix load time" (CKTload: evaluate and stamp). The 10k OP
profiles cover 1 warm-up plus 3 measured `simulate()` calls, including module loading. The 50k OP profiles cover
one cold call. The transient profile covers 1 warm-up plus 1 measured call.

| profile | device load (eval + stamp) | step limit + conv. tests | sparse LU | GC | parse + compile | other |
|---|---|---|---|---|---|---|
| OP 10k before | 27.3% | **17.2%** | 15.3% | 13.9% | 5.0% | 21.2% |
| OP 10k after | 31.6% | 8.3% | 18.9% | 11.5% | 7.9% | 21.8% |
| OP 50k before | 27.9% | **34.2%** | 9.3% | 15.9% | 1.2% | 11.4% |
| OP 50k after | 46.9% | 8.6% | 20.1% | 13.1% | 1.6% | 9.7% |
| tran 10k after | 44.7% | 12.8% | 12.5% | 7.3% | 2.4% | 20.2% |

Before this change, the top hot path on the OP decks was not the stamp. It was `MOSFET.limitNewtonStep`,
which `applyDeviceStepLimits` calls once per MOSFET per Newton iteration. Each call destructured `this.nodes`
twice and created four closures (two in `limitNewtonStep`, two in `gateStepScale`). The 50k deck has 100k
MOSFETs and runs 1,110 Newton iterations (gmin stepping), so this frame, plus the GC it caused, was the largest
cost: 5.1 s of 15.1 s sampled. Device load itself (`batchStamp` + `mos1BulkJunctions`) is unchanged at about
4.2 s at 50k.

## Change

- `mos1NewtonStepScale` (module function in `devices/mosfet.ts`) runs the same arithmetic as the old
  `limitNewtonStep` + `gateStepScale` on scalars, with no allocation.
- `MOSFET.batchNewtonStepScale(list, previous, candidate)` is the `Math.min` of those per-device scales.
  It reads D/G/S nodes and polarity from a per-list typed-array batch, and von from the shared
  `MosfetStateStore`. The batch is rebuilt when the stores merge.
- `applyDeviceStepLimits` (`analysis/newton-raphson.ts`) caches per device list which devices are plain MOS1
  instances (prototype `MOSFET.prototype`, no own `limitNewtonStep`) and which are other limiters. It takes the
  `Math.min` over both groups. `Math.min` does not depend on order (NaN and -0 included), so the step scale is
  the same value.

Numerics are unchanged. The OP digest (sha256 of every node voltage and branch current's IEEE-754 bits) is
identical in all 20 OP samples, and the transient waveform hash is identical in all 15 transient samples.

## Wall clock (median of 5, interleaved base/branch/ngspice per round)

`scripts/op-ab.sh` produces `op-ab.jsonl`, summarised by `scripts/summary.mjs` into `op-summary.txt`.
spice-ts time is in-process `simulate()` (parse + compile + OP): at 10k after one warm-up call in the same
process, at 50k in a cold process. ngspice time is the wall time of a fresh `ngspice -b` process.

| deck | base | branch | speedup (pairs) | ngspice-47 wall | ngspice analysis / load | Newton iterations spice-ts / ngspice |
|---|---|---|---|---|---|---|
| cmos-chain-10k OP | 624 ms | 544 ms | **1.15x** (1.12-1.21) | 1580 ms | 1.40 s / 0.88 s | 226 / 637 |
| cmos-chain-50k OP | 12.88 s | 9.08 s | **1.42x** (1.38-1.49) | 50.2 s | 49.4 s / 34.4 s | 1110 / 2360 |

spice-ts reads faster than ngspice-47 on both OP decks, but most of that comes from the iteration count, not
from per-iteration speed: spice-ts converges in 2.8x / 2.1x fewer Newton iterations on these decks. Per
iteration at 10k the two engines are about even (spice-ts 2.4 ms per iteration whole-call, ngspice 2.2 ms of
analysis). At 50k ngspice's per-iteration load grows (14.6 ms) and its reorder takes 6.5 s. The comparison is not
a claimed engine-level win: the measurements are interleaved but not CPU-isolated, the two engines use different
gmin/source-stepping schedules, and only these two OP decks were measured.

Transient control (`scripts/tran-ab.sh` produces `tran-ab.jsonl`, cmos-chain-tran 10k, 5 rounds): base
2193 ms, branch 2066 ms median (1.06x, pairs 1.02-1.13). The transient Newton loop does not call
`applyDeviceStepLimits`. The gain comes from the transient's initial operating point.

## Measured and not kept

Replacing the `this.nodes` array destructuring in `MOSFET.convergenceTest` (11% of the transient's self time)
with indexed reads: tran 10k medians of 2066 ms without it and 2121 ms with it, within noise over 5 rounds.
The change was reverted.

## Test receipts

- `packages/core/src/devices/mosfet-step-limit-830.test.ts` checks that `limitNewtonStep` and
  `batchNewtonStepScale` equal (`Object.is`) a frozen copy of the pre-#830 closure implementation. It covers
  48 passes over overlapping lists, batch and per-device stamps, a temperature change, ground and node-0
  terminals, vds = 0 exactly, delta = 0 with a >10 V terminal step, and the empty list. It fails on `main`
  (`batchNewtonStepScale is not a function`). 7 of 7 mutants of the new code fail it (`mutants.txt`,
  `scripts/mutants.py`).

## Remaining scope

- Device load (`batchStamp` + `mos1BulkJunctions`) is now 45-47% of the 50k OP and the 10k transient. It is
  memory-bound: scattered `gValues` writes for 100k devices.
- Per-device `convergenceTest` / `limitedLastStamp` through `.every`/`.some` closures (11% of the transient).
  The trivial change did not help, so a batched convergence test would be the next step.
- GC is 11-13%: a fresh `Float64Array(assembler.b)` per Newton iteration, plus LU allocations (LU lane).
- The Newton iteration count against ngspice-47 on these decks (fewer than ngspice here; worth a parity check,
  not a speed task).
