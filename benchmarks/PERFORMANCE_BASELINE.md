# 10k-node performance baseline

This report is the measurement-only first slice of [#40](https://github.com/mfiumara/spice-ts/issues/40). It changes no solver or runtime implementation.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm bench:scaling -- --sizes=100,1000,5000,10000 --warmups=3 --runs=10 --output=benchmarks/results/scaling-baseline.json
node --cpu-prof --cpu-prof-name=spice-ts-10000.cpuprofile \
  --cpu-prof-dir=benchmarks/results/profiles \
  benchmarks/performance/profile-spice-ts.mjs 10000 5
```

The scaling fixture is a deterministically generated linear resistor ladder with a DC operating-point analysis. For each size the harness verifies that spice-ts and ngspice receive the same SHA-256-identical netlist. Its provenance and licence are recorded in `benchmarks/SOURCES.md`.

Each size runs in an isolated spice-ts process. Three warmups precede ten recorded samples. The primary statistic is the median; raw samples plus min, p95, and max remain in `benchmarks/results/scaling-baseline.json`.

The two timing columns are deliberately not conflated:

- spice-ts API time includes parsing, compilation, topology construction, and solving through public `simulate()`.
- ngspice wall time starts a fresh native CLI process for every sample.
- ngspice analysis time is ngspice's internal analysis timer and excludes CLI startup and netlist-loading work.

Peak RSS includes each runtime's baseline. Node reports spice-ts peak RSS through `process.resourceUsage()`; ngspice reports its own maximum program size under `.options acct`.

## Environment

- Date: 2026-10-10
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM
- OS: Darwin 27.0.0, arm64
- spice-ts: 0.3.0 at the PR head
- Node.js: v22.23.1
- pnpm: 10.28.1
- ngspice: ngspice-47, KLU direct linear solver build

## Results

| Nodes | spice-ts API median | ngspice CLI median | ngspice analysis median | spice-ts peak RSS | ngspice peak RSS |
|---:|---:|---:|---:|---:|---:|
| 100 | 0.61 ms | 10.35 ms | 0.36 ms | 135.05 MiB | 10.31 MiB |
| 1,000 | 1.85 ms | 13.02 ms | 0.65 ms | 131.38 MiB | 11.69 MiB |
| 5,000 | 9.68 ms | 24.58 ms | 1.89 ms | 183.66 MiB | 17.48 MiB |
| 10,000 | 20.88 ms | 40.24 ms | 3.55 ms | 208.94 MiB | 24.47 MiB |

No engine failed at any tested size through 10,000 nodes. Sizes above 10,000 were not tested in this slice, so this report makes no claim about the next failure point.

## Interpretation: wins and losses

- Against end-to-end native CLI wall time, the in-process spice-ts API is 17.10x faster at 100 nodes, narrowing to 1.93x at 10,000 nodes. This is an embedding/startup comparison, not a solver-superiority claim.
- Against ngspice's internal analysis timer, spice-ts is slower at every size: 1.68x at 100 nodes, 2.87x at 1,000, 5.11x at 5,000, and 5.87x at 10,000.
- Memory remains a clear loss. At 10,000 nodes spice-ts peaks at 208.94 MiB versus 24.47 MiB for ngspice, an 8.54x ratio.
- Relative to the prior committed baseline, merged performance work reduced the 10,000-node spice-ts median from 28.78 ms to 20.88 ms (27.46%) and peak RSS from 914.94 MiB to 208.94 MiB (77.16%). The full raw before/after samples remain visible in Git history; this refresh does not conflate that improvement with ngspice parity.
- Raw samples, including scheduler/GC variation, remain in the JSON. Medians are the primary comparison; p95/max are retained rather than hidden.

## Profile findings

The committed 10,000-node V8 CPU profile is `benchmarks/results/profiles/spice-ts-10000.cpuprofile`. It profiles one warmup plus five measured runs without the TypeScript loader in the measured process.

The refreshed profile contains 62 self samples. `MNAAssembler.lockTopology` remains the dominant named frame (12 samples), followed by garbage collection (10), numeric factorization (5), and sparse pattern analysis (4). The dense `Int32Array(n * n)` position map identified by the original profile has been removed, explaining the large RSS reduction. Source inspection now points to topology construction's boxed `Set<number>`, per-column `number[][]`, and copy into typed CSC arrays as the next focused allocation target.

Focused follow-ups:

- [#69 — replace dense O(n²) MNA stamp position map](https://github.com/mfiumara/spice-ts/issues/69) (completed)
- [#70 — reuse sparse symbolic analysis across unchanged topology](https://github.com/mfiumara/spice-ts/issues/70) (completed)
- [#118 — reduce MNA topology-lock construction allocations](https://github.com/mfiumara/spice-ts/issues/118)

The raw JSON and CPU profile are the evidence of record; rounded values in this report are summaries only.

---

# M2 scaling comparison: 1k/10k/50k nodes ([#426](https://github.com/mfiumara/spice-ts/issues/426))

This is a measurement-only slice. It changes no solver or runtime code. It extends the DC ladder above to three generated workloads at 1k, 10k and 50k nodes and compares spice-ts with ngspice-47 on byte-identical decks. Every loss is published below.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm bench:scaling:m2 -- --sizes=1000,10000,50000 --ngspice-solvers=klu,sparse \
  --warmups=2 --runs=10 --timeout-s=600 --output=benchmarks/performance/results/scaling-m2.json
node benchmarks/performance/scaling-m2-report.mjs   # renders the tables below from the JSON
for c in resistor-mesh-op:3 rc-ladder-tran:3 cmos-inverter-chain-tran:1; do
  node --cpu-prof --cpu-prof-dir=benchmarks/performance/results/profiles \
    --cpu-prof-name=${c%%:*}-10000.cpuprofile \
    benchmarks/performance/profile-scaling-m2.mjs ${c%%:*} 10000 ${c##*:}
done
node benchmarks/performance/profile-summary.mjs benchmarks/performance/results/profiles/<file>.cpuprofile
npx tsx --test benchmarks/performance/scaling-m2.test.ts   # fixture/parser unit checks
```

The full matrix took 86 minutes, mostly in the 50k cells.

## Workloads and provenance

All decks come from `benchmarks/performance/scaling-m2-fixture.mjs`. They are original generated material written for this repository and carry the repository's MIT licence. No third-party circuit, model card or netlist is used. The MOS1 model cards are hand-picked generic level-1 values (`vto=±0.5`, `kp=120u/60u`, `lambda=0.02`), not vendor models. A `benchmarks/SOURCES.md` entry follows once PR #413 (which holds that file's pin) has merged.

| Circuit | Deck | Analysis | Nodes run |
|---|---|---|---|
| `rc-ladder-tran` | PULSE source driving N-1 series 1 kOhm resistors, each node loaded by 1 pF | `.tran 1n 100n`, `.print tran v(n10)` | 1,000 / 10,000 / 50,000 |
| `resistor-mesh-op` | ceil(sqrt N)² grid of 1 kOhm edges, 1 V at one corner, 1 kOhm to ground at the opposite corner | `.op` | 1,024 / 10,000 / 50,176 |
| `cmos-inverter-chain-tran` | N-2 MOS1 CMOS inverters (PMOS W=2u, NMOS W=1u, L=1u), 10 fF per output, 2.5 V supply, input pulse | `.tran 10p 2n`, `.print tran v(s20)` | 1,000 / 10,000 / 50,000 |

Every deck carries `.options acct`, which spice-ts accepts as output-only. The harness hashes the deck in each child process and aborts on any SHA-256 mismatch:

| Circuit | Nodes | Deck SHA-256 |
|---|---:|---|
| rc-ladder-tran | 1,000 | `0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7` |
| rc-ladder-tran | 10,000 | `eb21933fd99fcbc32276816a4f389ba216dcdddc29683551a67f606f352dfca7` |
| rc-ladder-tran | 50,000 | `2fd0c2090d17dddf80980eb3391440a3e4f99e1a77d1158360ffedc4246a7ada` |
| resistor-mesh-op | 1,024 | `6c6d5adb109cdde9ac844c3346135f4e7ffc352626b2f3c430598c0ebd9d8d40` |
| resistor-mesh-op | 10,000 | `c88e6076daf2523437e3da014d7a3c329f679a7405f789530c5c805f447ed0dc` |
| resistor-mesh-op | 50,176 | `f81ed198f7ba67068138846b12fe93b9ec957e6bb3a89300d2c7c50e30d47329` |
| cmos-inverter-chain-tran | 1,000 | `1a9866593c778a9fa26e23c1916c7b00b1bdb1adc2e7a246d9e3f4aa4f1ca1e1` |
| cmos-inverter-chain-tran | 10,000 | `2ce663326238609299d8628016b1211632f1474e9d40b6c39747fff964999a18` |
| cmos-inverter-chain-tran | 50,000 | `d680f1054eb14002980a7a65eb68a5dddae8063a871050fde025e8f5080bc543` |

## Method

- Each engine/circuit/size/solver cell runs in its own fresh child process: 2 warmups, then 10 recorded samples. Medians are primary. Min, p95 (nearest rank, which is the maximum at 10 samples), max and every raw sample are in `benchmarks/performance/results/scaling-m2.json`.
- spice-ts time is `parseAsync()` plus `simulate(circuit)` through the public API, all in-process. The JSON splits it into `parseMs` and `analysisMs` (compile + analysis).
- ngspice time is the wall time of a fresh `ngspice -b` CLI process per sample. That includes process start, deck loading, and printing the `.print` rows plus the initial-solution / `.op` node listing to a pipe. The JSON also records ngspice's own `Netlist loading time`, `Total analysis time` and matrix reorder/factor/solve/load phases from `.options acct`.
- ngspice-47 defaults to **Sparse 1.3** when the deck does not request KLU. This build was compiled with KLU. Both solvers are measured. spice-ts rejects `.options klu`, so the solver is chosen outside the shared deck with a per-run `.spiceinit` (`option klu` or `option sparse`). The harness checks the `Using ... as Direct Linear Solver` banner on every sample. KLU is the stronger ngspice baseline and the one spice-ts has to beat.
- Failures stop a cell. The error text and time-to-failure are recorded and never retried or dropped. No timeouts were hit, with a budget of 600 s per sample.
- Correctness sanity: the probe value is recorded per sample, because timing is only meaningful when the engines agree.
  - RC ladder `v(n10)` at 100 ns: 0.168395 V (spice-ts) against 0.168377 V (ngspice, both solvers), a 1.08e-4 relative difference at every size.
  - Mesh corner voltage: agrees to ≤1.9e-7 relative at every size.
  - Inverter chain `v(s20)` at 2 ns: 0.6456 V (spice-ts) against 0.3501 V (ngspice). This probe sits on a steep rising edge, so small delay differences amplify. A side check on the 1k deck compares the 1.25 V crossing times. spice-ts is earlier by 4.0 ps at `s1` (0.2214 vs 0.2254 ns), 4.8 ps at `s2`, 7.6 ps at `s5` and 11.5 ps at `s10` (1.0793 vs 1.0908 ns, -1.1%). Read the inverter-chain timings with that roughly 1% per-stage delay difference in mind. spice-ts also emits 671 output points against ngspice's 214 accepted timepoints.

## Environment and load

- Run: 2026-10-11 02:39–04:05 UTC (`generatedAt` 2026-10-11T04:04:57Z)
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM, Darwin 27.0.0 arm64
- spice-ts 0.3.0 at main `9b21238` plus this measurement-only branch. Node.js v22.23.1, pnpm 10.28.1
- ngspice: ngspice-47 (Homebrew build, KLU compiled in)
- **The host was shared with other agent workloads.** The 1-minute load average, sampled every 30 s, ranged from 3.9 to 26.6 on 18 logical CPUs during the run. That inflates some p95 values (for example spice-ts mesh 50k: median 83.2 s, p95 172.1 s) and adds noise in both directions. Medians across isolated processes are the comparison of record. Re-run on an idle machine before quoting any ratio tighter than "about Nx".
- An earlier full run on main `60f49b2`, before the #428 gmin-stepping fix landed, was discarded rather than mixed in. Its inverter-chain cells all failed. It is superseded by this run on the PR's base.

## Results: end-to-end time (median / p95 of 10)

| Circuit | Nodes | spice-ts total | ngspice KLU wall | ngspice Sparse 1.3 wall | spice-ts vs KLU | spice-ts vs Sparse |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 126 ms / 136 ms | 40.4 ms / 46.0 ms | 31.5 ms / 33.0 ms | 3.11x slower | 4.00x slower |
| rc-ladder-tran | 10,000 | 1.13 s / 1.91 s | 375 ms / 571 ms | 266 ms / 393 ms | 3.00x slower | 4.23x slower |
| rc-ladder-tran | 50,000 | 9.08 s / 11.83 s | 865 ms / 1.00 s | 701 ms / 799 ms | 10.50x slower | 12.94x slower |
| resistor-mesh-op | 1,024 | 26.8 ms / 41.1 ms | 19.2 ms / 20.8 ms | 28.0 ms / 29.5 ms | 1.40x slower | 1.05x faster |
| resistor-mesh-op | 10,000 | 2.91 s / 2.98 s | 108 ms / 114 ms | 1.41 s / 1.58 s | 26.91x slower | 2.07x slower |
| resistor-mesh-op | 50,176 | 83.21 s / 172.07 s | 784 ms / 885 ms | 79.31 s / 154.48 s | 106.08x slower | 1.05x slower |
| cmos-inverter-chain-tran | 1,000 | 1.43 s / 2.02 s | 234 ms / 247 ms | 282 ms / 305 ms | 6.09x slower | 5.05x slower |
| cmos-inverter-chain-tran | 10,000 | 23.38 s / 35.86 s | 3.76 s / 5.28 s | 3.90 s / 5.85 s | 6.22x slower | 6.00x slower |
| cmos-inverter-chain-tran | 50,000 | **FAILED** | 78.92 s / 157.07 s | 104.06 s / 144.30 s | - | - |

## Results: phase split, step counts, memory

| Circuit | Nodes | spice-ts parse | spice-ts compile+analysis | ngspice KLU load | ngspice KLU analysis | ngspice Sparse analysis | spice-ts analysis vs KLU analysis | timepoints spice-ts / ngspice | peak RSS spice-ts / KLU / Sparse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 1.36 ms | 124 ms | 3.25 ms | 17.4 ms | 12.2 ms | 7.15x slower | 235 / 120 | 245 / 13 / 12 MiB |
| rc-ladder-tran | 10,000 | 10.1 ms | 1.12 s | 41.4 ms | 259 ms | 177 ms | 4.30x slower | 235 / 120 | 423 / 35 / 30 MiB |
| rc-ladder-tran | 50,000 | 68.4 ms | 9.00 s | 97.4 ms | 684 ms | 533 ms | 13.16x slower | 235 / 120 | 935 / 134 / 105 MiB |
| resistor-mesh-op | 1,024 | 1.02 ms | 25.9 ms | 2.12 ms | 2.35 ms | 9.85 ms | 11.01x slower | op | 184 / 14 / 13 MiB |
| resistor-mesh-op | 10,000 | 12.9 ms | 2.90 s | 21.9 ms | 36.2 ms | 1.34 s | 79.91x slower | op | 331 / 48 / 49 MiB |
| resistor-mesh-op | 50,176 | 64.0 ms | 83.13 s | 140 ms | 416 ms | 78.73 s | 199.73x slower | op | 1676 / 219 / 244 MiB |
| cmos-inverter-chain-tran | 1,000 | 3.36 ms | 1.42 s | 6.45 ms | 205 ms | 244 ms | 6.92x slower | 671 / 214 | 257 / 19 / 17 MiB |
| cmos-inverter-chain-tran | 10,000 | 47.0 ms | 23.33 s | 53.5 ms | 3.61 s | 3.77 s | 6.47x slower | 671 / 214 | 654 / 103 / 75 MiB |
| cmos-inverter-chain-tran | 50,000 | failed | failed | 354 ms | 77.91 s | 103.05 s | - | - / 214 | - / 467 / 334 MiB |

spice-ts "timepoints" counts returned output points, and ngspice's counts its "Accepted timepoints". The two are related but not the same quantity.

## Wins and losses

- **No meaningful spice-ts win at these sizes.** The single cell where spice-ts is not slower is the 1,024-node mesh against ngspice's default Sparse 1.3 wall time: 26.8 ms vs 28.0 ms. That 1.05x is within this run's noise, and spice-ts loses the same cell to KLU by 1.40x. Against KLU, spice-ts loses every completed cell end-to-end, even though ngspice's wall time includes native process start and deck loading.
- **Linear transient (RC ladder):** about 3x slower than KLU wall time at 1k–10k and 10.5x at 50k. Analysis time alone is 4.3–13.2x slower. spice-ts takes about 2x the output timepoints for the same `.tran 1n 100n`, and its final value matches ngspice to 1.1e-4 relative.
- **Linear OP (2-D mesh):** this is the scaling problem. spice-ts grows from 27 ms (1k) to 2.9 s (10k) to 83 s (50k). ngspice KLU stays at 0.11 s and 0.78 s wall, so spice-ts is 106x slower at 50k (200x in analysis time). Against ngspice's default Sparse 1.3 the gap is only 1.05–2.1x, because Sparse 1.3 shows the same super-linear blow-up. Most of ngspice's lead comes from KLU's fill-reducing ordering.
- **Nonlinear transient (MOS1 inverter chain):** about 6x slower than both ngspice solvers at 1k and 10k, with the roughly 1% stage-delay difference noted above. At 50k spice-ts **fails**: the DC operating point that seeds the transient throws `SingularMatrixError` at `s49998` after 40.8 s. ngspice solves it with both solvers. A side bisection on the `.op`-only deck shows 30k nodes solve and 40k fail. This is the residual of #428 and is filed as [#462](https://github.com/mfiumara/spice-ts/issues/462) (measurement-only here).
- **Memory:** a loss everywhere. At the largest completed sizes spice-ts peaks at 935 MiB (RC 50k), 1,676 MiB (mesh 50k) and 654 MiB (inverter 10k). ngspice KLU peaks at 134, 219 and 103 MiB: ratios of 7.0x, 7.7x and 6.3x, including Node's roughly 120 MiB runtime baseline.
- **Parsing is not the problem.** spice-ts parses 50k-node decks in 64–68 ms, faster than ngspice's netlist loading (97–140 ms KLU runs).

## Measured bottleneck (CPU profiles)

The profiles are committed under `benchmarks/performance/results/profiles/`, at 10k nodes on the same build as the run above. The mesh and RC profiles cover 1 warmup plus 3 measured `simulate()` calls. The inverter-chain profile covers 1 warmup plus 1 measured call. Summaries come from `profile-summary.mjs`.

- **Top bottleneck: sparse LU factorization on the 2-D mesh OP.** In `resistor-mesh-op-10000.cpuprofile` (3,725 samples, 15.48 s), `GilbertPeierlsSolver.factorize` takes 95.7% of self time (14.81 s). Parse, compile, topology lock and stamping together stay under 2%. Source inspection of `packages/core/src/solver/gilbert-peierls.ts` finds threshold row pivoting but no fill-reducing column ordering (AMD/COLAMD). The working hypothesis is fill-in along the grid bandwidth, which matches ngspice Sparse 1.3 behaving similarly while KLU (AMD-ordered) does not. Follow-up: [#444](https://github.com/mfiumara/spice-ts/issues/444).
- **Per-step assembly on the nonlinear transient.** In `cmos-inverter-chain-tran-10000.cpuprofile` (8,876 samples, 36.60 s), self time is led by `MOSFET.batchStamp` (17.1%), the assembler `stampIndex` position lookup (12.7%), `factorize` (10.8%), the `stampG` closure (9.5%), `buildCompanionSystem` (7.8%), MOSFET `stamp` (7.1%) and `evaluateBulkJunctions` (6.1%). Inclusive, `buildCompanionSystem` is 49.1% and `batchStamp` 35.5%. Here device evaluation and stamping through the `stampIndex` closure cost more than the LU.
- **RC-ladder transient.** In `rc-ladder-tran-10000.cpuprofile` (2,251 samples, 7.36 s), self time is `stampG` closure 18.9%, the transient result `save` 18.3%, `factorize` 13.2%, `buildStep` 12.7% and `buildCompanionSystem` 9.3%. `save` stores every node's voltage at every output point (10k nodes x 235 points), and the deck asks for only one `.print` node.

The raw JSON and CPU profiles are the evidence of record. Rounded values here are rendered by `scaling-m2-report.mjs` and are summaries only.
