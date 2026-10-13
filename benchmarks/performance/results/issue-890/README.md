# Issue #890: rc-ladder-tran hot path vs ngspice-47

#890 quoted `PERFORMANCE_BASELINE.md` (generated at `9b21238`): rc-ladder-tran 50k nodes at 8.92 s
against 1.09 s for ngspice-47 KLU (8.17x), 10k at 6.29x. This directory re-measures on current
`main`, names the top frame, fixes it without changing any result, and gives before/after numbers.

Host: Apple M5 Pro, macOS, Node v22.23.1, ngspice-47 (Homebrew). Base = `main` at `a1987482`.
Branch = this PR. Decks are the M2 scaling decks from `benchmarks/performance/scaling-m2-fixture.mjs`
(byte-identical for both simulators; 10k SHA-256 `eb21933f...`, 50k `2fd0c209...`, as in
`PERFORMANCE_BASELINE.md`). The Mac is shared with other lanes. Load average was 5 to 9 during
these runs (`ab-load.txt`), and every heavy run went through `spice-heavy`. Treat single numbers
as noisy; the paired A/B and the profiles carry the evidence.

## Where main stands before this change

The 8.2x gap in the issue is out of date. #669/#710/#842/#878 already closed most of it. On `main`,
spice-ts and ngspice-47 take the same steps on this deck: 120 timepoints, 119 accepted steps,
0 rejected, 238 transient Newton iterations in both (`.options acct` of the KLU run; spice-ts
`convergence.transient`). So the remaining gap is per-iteration cost, not step control.

## Profile (before)

`node --cpu-prof benchmarks/performance/profile-scaling-m2.mjs rc-ladder-tran <n> 3` (one warm-up
plus three measured `simulate()` calls), summarised by `profile-summary.mjs`
(`profiles/base-rc-ladder-tran-{10000,50000}.{cpuprofile,summary.txt}`).

50k, top self time (7957 ms sampled):

| frame | self ms | self % |
|---|---:|---:|
| (garbage collector) | 887 | 11.2% |
| **`stampStaticDevices`** (`mna/linear-stamp.ts`) | **762** | **9.6%** |
| `evaluate` (reactive truncation charges) | 673 | 8.5% |
| `buildCompanionSystem` | 368 | 4.6% |
| `stampDynamicDevices` | 343 | 4.3% |
| `solveLinearized` | 315 | 4.0% |

`stampStaticDevices` is the top non-GC frame: 9.6% self, 14.1% inclusive (1121 ms). It is called
twice per step from the companion build (Newton) and once per step from the trapezoidal history
restamp (`stampPrevB`). Almost all of its self time is the resistor kernel: for each of the 49,999
resistors it loads the device object to read `conductance`, then adds into four value slots. The
device objects are large and spread over the heap, so the kernel is bound by that pointer chase,
not by the arithmetic. `stampDynamicDevices` has the same pattern for capacitors (`capacitance`).
At 10k the objects mostly stay in cache and the frame is 4.4% self.

## Fix

`packages/core/src/mna/linear-stamp.ts`: each resistor (static) or capacitor (dynamic) run of a
stamp program keeps the run's conductances or capacitances in a `Float64Array`. The kernel reads
that array. It is refilled from the devices when a value may have changed.

`Resistor.conductance` and `Capacitor.capacitance` are now accessors over a private field. Every
write, from any path (temperature, `M`/`SCALE`, `.step`/`.alter` through `setParameter`, `.sens`
perturbations, or a direct assignment), bumps a module-level revision for that class. A program
compares the revision once per run per pass and refills only when it moved. The cached value is the
field's value copied unchanged, and the slots receive the same additions in the same order, so the
matrices are bit-identical to before (and to per-device stamping, which the existing #570 tests
check).

Not changed: `evaluate` in the reactive truncation (third frame) reads `capacitor.capacitance` and
`capacitor.nodes` the same way. It is a separate file and a separate change; left for a follow-up.

## Profile (after)

`profiles/branch-rc-ladder-tran-{10000,50000}.*`, same command.

| 50k frame | base self ms (%) | branch self ms (%) | base inclusive ms | branch inclusive ms |
|---|---:|---:|---:|---:|
| `stampStaticDevices` | 762 (9.6%) | 245 (4.1%) | 1121 | 550 |
| `stampDynamicDevices` | 343 (4.3%) | 109 (1.8%) | 422 | 201 |
| `refillValues` (new) | | 2.6 (0.0%) | | 2.6 |
| `simulate` (inclusive, 4 calls) | | | 6590 | 4659 |

After the change, the top 50k self frames are GC (15.6%), `evaluate` (7.0%), `solveLinearized`
(5.7%), `buildCompanionSystem` (5.0%), then `stampStaticDevices` (4.1%). Most of
`stampStaticDevices`' remaining inclusive time is the per-device passes before a program is built
and the program build itself (per `simulate()`), not the per-iteration kernel.

## Results are bit-identical

`scripts/identical.mjs` compares every saved sample (time vector and every node voltage and branch
current) of base and branch with `Object.is` (`identical.jsonl`):

| deck | nodes | samples | differing |
|---|---:|---:|---:|
| rc-ladder-tran | 10,000 | 1,200,240 | 0 |
| rc-ladder-tran | 50,000 | 6,000,240 | 0 |
| resistor-mesh-op | 10,000 | 10,001 | 0 |
| resistor-mesh-op | 50,000 | 50,177 | 0 |
| cmos-inverter-chain-tran | 1,000 | 214,642 | 0 |
| cmos-inverter-chain-tran | 10,000 | 2,140,642 | 0 |

The fresh-process A/B below also hashes every result (`../issue-842/scripts/run.mjs`): one digest
per deck across all base and branch samples.

## Wall clock vs ngspice-47 on identical decks

### Fresh process, interleaved (base, branch, ngspice-47 KLU)

`../issue-842/scripts/ab.sh` with `NG_DIR` (decks from `write-decks.mjs`, `.spiceinit` =
`option klu`, KLU confirmed in each log), base/branch order flipped every round, 7 rounds.
10k: median of 1 call after 1 warm-up per process; 50k: one cold call per process. ngspice is one
`ngspice -b` process. (`ab-10k.jsonl`, `ab-50k.jsonl`.)

| nodes | base median (range) | branch median (range) | branch speedup, median of pairs (range) | ngspice-47 KLU median (range) | base / KLU | branch / KLU |
|---:|---:|---:|---:|---:|---:|---:|
| 10k | 271 ms (230-275) | 261 ms (242-266) | 1.040x (0.950-1.091) | 206 ms (194-223) | 1.31x | 1.26x |
| 50k | 1488 ms (1409-1793) | 1353 ms (1214-1447) | 1.124x (1.051-1.378) | 1185 ms (957-1309) | 1.26x | 1.14x |

### scaling-m2 harness (KLU and Sparse 1.3)

`pnpm exec tsx benchmarks/performance/scaling-m2.ts --circuits=rc-ladder-tran
--sizes=10000,50000 --warmups=1 --runs=7`, once on the branch dist then once on the base dist,
back to back (`scaling-branch.json`, `scaling-base.json`, table by `scripts/summary.mjs`). The
harness runs each engine in its own processes, so ngspice was measured separately for each row
and its medians drift with host load (Sparse at 50k: 1.48 s in the base run, 971 ms in the
branch run).

| nodes | run | spice-ts total (analysis) | ngspice-47 KLU total (analysis) | ngspice-47 Sparse total (analysis) | spice-ts / KLU total | spice-ts / Sparse total | spice-ts analysis / KLU analysis |
|---:|---|---:|---:|---:|---:|---:|---:|
| 10000 | base | 217 ms (176 ms) | 201 ms (145 ms) | 196 ms (132 ms) | 1.08x | 1.11x | 1.21x |
| 50000 | base | 1.59 s (1.34 s) | 1.47 s (1.23 s) | 1.48 s (1.18 s) | 1.08x | 1.07x | 1.09x |
| 10000 | branch | 231 ms (185 ms) | 203 ms (144 ms) | 172 ms (114 ms) | 1.14x | 1.34x | 1.29x |
| 50000 | branch | 1.31 s (1.07 s) | 1.35 s (1.11 s) | 971 ms (746 ms) | 0.97x | 1.35x | 0.96x |

### In-process A/B (both dists in one process, alternating calls)

`scripts/ab-inproc.mjs` (copied from issue-878), median of per-round base/branch ratios
(`ab-inproc.jsonl`):

| deck | nodes | rounds | wall speedup (range) | CPU speedup (range) |
|---|---:|---:|---:|---:|
| rc-ladder-tran | 10k | 15 | 1.018x (0.932-1.120) | 1.008x (0.896-1.177) |
| rc-ladder-tran | 50k | 7 | 1.185x (1.028-1.348) | 1.147x (0.938-1.242) |
| resistor-mesh-op | 10k | 15 | 0.966x (0.909-1.376) | 0.972x (0.822-1.251) |
| resistor-mesh-op | 50k | 5 | 0.997x (0.892-1.053) | 1.005x (0.812-1.065) |
| cmos-inverter-chain-tran | 10k | 7 | 0.938x (0.871-1.065) | 0.848x (0.763-1.097) |

Two earlier control runs (cmos 10k 0.983x, mesh 10k 0.954x) overlapped the full core test suite on
the same host and are kept in the file as measured.

### Controls, fresh process

`ab.sh` without ngspice, 7 rounds (`ab-controls-10k.jsonl`):

| deck | nodes | base median (range) | branch median (range) | speedup (range) | digests |
|---|---:|---:|---:|---:|---|
| cmos-inverter-chain-tran | 10k | 1994 ms (1950-2354) | 1992 ms (1879-2253) | 1.034x (0.976-1.099) | identical |
| resistor-mesh-op | 10k | 172 ms (166-212) | 175 ms (159-234) | 0.978x (0.904-1.047) | identical |

## Reading

- 50k RC ladder: 1.12x faster fresh-process (all 7 pairs > 1.05), 1.19x in-process.
  `stampStaticDevices` self time drops 3.1x and `stampDynamicDevices` 3.1x in the profile. Against
  ngspice-47 KLU the fresh-process ratio goes from 1.26x to 1.14x slower.
- 10k RC ladder: +2 to +4%, inside the noise (ranges cross 1.0). The pointer chase is cheap when the
  device objects fit in cache.
- spice-ts is still slower than ngspice-47 on this deck at 10k and 50k (1.14x to 1.31x KLU wall
  fresh-process; Sparse 1.3 is faster than KLU on this linear ladder). The harness row where the
  branch reads 0.97x KLU is within the load drift and is not a claim that spice-ts is faster.
- Losses / unresolved: the in-process CMOS chain control reads 0.938x wall / 0.848x CPU. The same
  deck fresh-process reads 1.034x (range 0.976-1.099), and its results are bit-identical. The CMOS
  chain uses the capacitor kernel (10 fF per stage) and the trapezoidal history restamp, so it
  runs the changed code; the in-process number is published as measured, and the fresh-process
  number is the one that matches how the harness and users run it. The resistor mesh reads
  0.966-0.997x in-process and 0.978x fresh-process, ranges crossing 1.0.
- Next frames on this deck after the fix: GC (15.6%), the reactive-truncation `evaluate` (7.0%, same
  object pointer chase on capacitors), `solveLinearized` (5.7%).

## Files

- `scripts/identical.mjs`: bit-for-bit base/branch comparison of one deck.
- `scripts/ab-inproc.mjs`: in-process A/B. `scripts/summary.mjs`: harness JSON to table.
- `../issue-842/scripts/{ab.sh,run.mjs,summary.mjs,write-decks.mjs}`: fresh-process A/B (reused).
- `profiles/`: before/after `.cpuprofile` and summaries.
- Tests: `packages/core/src/mna/linear-stamp.test.ts` (#890 cases: a pass with no value change
  reads no device value, red on base with 126 reads on a 63-stage ladder; direct `conductance` and
  `capacitance` writes between passes are still stamped bit for bit).
