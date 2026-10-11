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

The full matrix took 56 minutes, mostly in the ngspice 50k cells.

## Workloads and provenance

All decks come from `benchmarks/performance/scaling-m2-fixture.mjs`. They are original generated material written for this repository and carry the repository's MIT licence. No third-party circuit, model card or netlist is used. The MOS1 model cards are hand-picked generic level-1 values (`vto=±0.5`, `kp=120u/60u`, `lambda=0.02`), not vendor models. Generator, licence, ngspice version and the SHA-256 of all nine decks are recorded in `benchmarks/SOURCES.md` ([#480](https://github.com/mfiumara/spice-ts/issues/480)); `scaling-m2.test.ts` fails if the generator, `results/scaling-m2.json` and that table disagree. That test runs in CI and `pnpm test`; the timing matrix does not.

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
- ngspice time is the wall time of a fresh `ngspice -b` CLI process per sample. That includes process start, deck loading, and printing the `.print` rows plus the initial-solution / `.op` node listing to a pipe. The JSON also records ngspice's own `Netlist loading time`, `Total analysis time` and matrix reorder/factor/solve/load phases from `.options acct`. **End-to-end "faster" cells below compare in-process spice-ts with a cold native CLI, which is an embedding comparison. Use the analysis-time column for solver-against-solver.**
- ngspice-47 defaults to **Sparse 1.3** when the deck does not request KLU. This build was compiled with KLU. Both solvers are measured. spice-ts rejects `.options klu`, so the solver is chosen outside the shared deck with a per-run `.spiceinit` (`option klu` or `option sparse`). The harness checks the `Using ... as Direct Linear Solver` banner on every sample. KLU is the stronger ngspice baseline and the one spice-ts has to beat.
- Failures stop a cell. The error text and time-to-failure are recorded and never retried or dropped. No timeouts were hit, with a budget of 600 s per sample.
- Correctness sanity: the probe value is recorded per sample, because timing is only meaningful when the engines agree.
  - RC ladder `v(n10)` at 100 ns: 0.168395 V (spice-ts) against 0.168377 V (ngspice, both solvers), a 1.08e-4 relative difference at every size.
  - Mesh corner voltage: agrees to ≤1.9e-7 relative at every size.
  - Inverter chain `v(s20)` at 2 ns: 0.6456 V (spice-ts) against 0.3501 V (ngspice). This probe sits on a steep rising edge, so small delay differences amplify. A side check on the 1k deck compares the 1.25 V crossing times. spice-ts is earlier by 4.0 ps at `s1` (0.2214 vs 0.2254 ns), 4.8 ps at `s2`, 7.6 ps at `s5` and 11.5 ps at `s10` (1.0793 vs 1.0908 ns, -1.1%). That check ran on main `9b21238`, and the `v(s20)` probe value is unchanged on `3490527`. Read the inverter-chain timings with that roughly 1% per-stage delay difference in mind. spice-ts also emits 671 output points against ngspice's 214 accepted timepoints.

## Environment and load

- Run: 2026-10-11 04:18–05:14 UTC (`generatedAt` 2026-10-11T05:14:34Z)
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM, Darwin 27.0.0 arm64
- spice-ts 0.3.0 at main `3490527` (includes #444 AMD ordering and the #428 gmin-stepping fix) plus this measurement-only branch. Node.js v22.23.1, pnpm 10.28.1
- ngspice: ngspice-47 (Homebrew build, KLU compiled in)
- **The host was shared with other agent workloads.** The 1-minute load average, sampled every 30 s, ranged from 4.6 to 22.1 on 18 logical CPUs. Medians across isolated processes are the comparison of record. Re-run on an idle machine before quoting any ratio tighter than "about Nx".
- ⚠ The spice-ts `cmos-inverter-chain-tran` 1k cell was hit by a load spike: samples ran 1.68–10.87 s against roughly 1.0 s standalone. The full row was re-run right after (05:21 UTC, same build and flags) into `results/scaling-m2-inverter-1k-rerun.json`. spice-ts median 1.08 s / p95 1.23 s, ngspice KLU 151 ms / 168 ms, Sparse 151 ms / 156 ms: **7.15x and 7.17x slower**. The original cell stays in the table and the JSON, unedited.

## Results: end-to-end time (median / p95 of 10)

| Circuit | Nodes | spice-ts total median / p95 | ngspice KLU wall median / p95 | ngspice Sparse 1.3 wall median / p95 | spice-ts vs KLU wall | spice-ts vs Sparse wall |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 90.9 ms / 93.7 ms | 23.9 ms / 24.5 ms | 22.2 ms / 23.0 ms | 3.80x slower | 4.08x slower |
| rc-ladder-tran | 10,000 | 1.12 s / 1.31 s | 179 ms / 207 ms | 160 ms / 164 ms | 6.29x slower | 7.01x slower |
| rc-ladder-tran | 50,000 | 8.92 s / 9.45 s | 1.09 s / 1.18 s | 752 ms / 836 ms | 8.17x slower | 11.86x slower |
| resistor-mesh-op | 1,024 | 5.82 ms / 9.49 ms | 18.2 ms / 18.6 ms | 25.1 ms / 25.4 ms | 3.13x faster | 4.32x faster |
| resistor-mesh-op | 10,000 | 146 ms / 158 ms | 100 ms / 103 ms | 1.10 s / 7.40 s | 1.46x slower | 7.58x faster |
| resistor-mesh-op | 50,176 | 2.71 s / 2.87 s | 906 ms / 1.47 s | 46.48 s / 135.16 s | 3.00x slower | 17.12x faster |
| cmos-inverter-chain-tran | 1,000 | 3.15 s / 10.87 s ⚠ | 408 ms / 441 ms | 393 ms / 424 ms | 7.73x slower | 8.02x slower |
| cmos-inverter-chain-tran | 10,000 | 18.35 s / 22.25 s | 4.60 s / 10.24 s | 3.98 s / 5.03 s | 3.99x slower | 4.61x slower |
| cmos-inverter-chain-tran | 50,000 | **FAILED** | 68.39 s / 135.63 s | 84.82 s / 111.44 s | - | - |

## Results: phase split, step counts, memory

| Circuit | Nodes | spice-ts parse | spice-ts compile+analysis | ngspice KLU load | ngspice KLU analysis | ngspice Sparse analysis | spice-ts analysis vs KLU analysis | timepoints spice-ts / ngspice | peak RSS spice-ts / KLU / Sparse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 1.09 ms | 89.7 ms | 1.93 ms | 9.88 ms | 8.39 ms | 9.08x slower | 235 / 120 | 254 / 13 / 12 MiB |
| rc-ladder-tran | 10,000 | 10.5 ms | 1.11 s | 22.2 ms | 128 ms | 105 ms | 8.69x slower | 235 / 120 | 427 / 33 / 29 MiB |
| rc-ladder-tran | 50,000 | 78.4 ms | 8.84 s | 109 ms | 892 ms | 582 ms | 9.91x slower | 235 / 120 | 933 / 131 / 105 MiB |
| resistor-mesh-op | 1,024 | 1.04 ms | 4.83 ms | 2.07 ms | 2.21 ms | 9.00 ms | 2.19x slower | op / op | 185 / 14 / 13 MiB |
| resistor-mesh-op | 10,000 | 9.32 ms | 136 ms | 20.1 ms | 33.1 ms | 1.04 s | 4.12x slower | op / op | 348 / 47 / 49 MiB |
| resistor-mesh-op | 50,176 | 76.1 ms | 2.63 s | 151 ms | 449 ms | 46.17 s | 5.87x slower | op / op | 445 / 219 / 244 MiB |
| cmos-inverter-chain-tran | 1,000 | 4.56 ms | 3.15 s | 9.94 ms | 345 ms | 322 ms | 9.13x slower | 671 / 214 | 281 / 20 / 17 MiB |
| cmos-inverter-chain-tran | 10,000 | 39.0 ms | 18.31 s | 65.1 ms | 4.44 s | 3.85 s | 4.12x slower | 671 / 214 | 662 / 102 / 75 MiB |
| cmos-inverter-chain-tran | 50,000 | failed | failed | 354 ms | 67.77 s | 84.08 s | - | - / 214 | - / 472 / 333 MiB |

spice-ts "timepoints" counts returned output points, and ngspice's counts its "Accepted timepoints". The two are related but not the same quantity.

## Wins and losses

- **Wins are embedding wins only.** On the 1,024-node mesh, in-process spice-ts (5.8 ms) beats a cold ngspice CLI (18.2 ms KLU, 25.1 ms Sparse). Its analysis alone is still 2.19x slower than KLU's (4.83 ms vs 2.21 ms). Against ngspice's default Sparse 1.3, spice-ts wins the 10k and 50k mesh by 7.6x and 17.1x wall: Sparse 1.3 blows up super-linearly on the 2-D grid, while spice-ts now orders columns with AMD. That says Sparse 1.3 is a weak baseline on this topology, not that spice-ts beats ngspice. With KLU, ngspice wins.
- **Linear OP (2-D mesh) against KLU:** 1.46x slower wall at 10k (146 ms vs 100 ms) and 3.00x at 50k (2.71 s vs 0.91 s). Analysis time alone is 4.1–5.9x slower.
- **Linear transient (RC ladder):** 3.8x / 6.3x / 8.2x slower than KLU wall at 1k / 10k / 50k, and 8.7–9.9x slower in analysis time. spice-ts takes about 2x the output timepoints for the same `.tran 1n 100n`, and its final value matches ngspice to 1.1e-4 relative.
- **Nonlinear transient (MOS1 inverter chain):** about 7x slower at 1k (re-run row) and 4.0x slower than KLU at 10k (18.35 s vs 4.60 s), with the roughly 1% stage-delay difference noted above. At 50k spice-ts **fails**: the seeding DC operating point throws `SingularMatrixError ... (nodes: s135)` after 28.6 s. ngspice solves it with both solvers. A side bisection on `9b21238` showed the `.op`-only deck solves at 30k nodes and fails at 40k. Filed as [#462](https://github.com/mfiumara/spice-ts/issues/462), the residual of #428, and still reproduced on `3490527`.
- **Memory:** a loss everywhere. At 50k nodes spice-ts peaks at 933 MiB (RC) and 445 MiB (mesh) against 131 MiB and 219 MiB for ngspice KLU (7.1x and 2.0x), and at 662 MiB against 102 MiB on the 10k inverter chain (6.5x). All figures include Node's roughly 120–180 MiB runtime baseline.
- **Parsing is not the problem.** spice-ts parses the 50k-node decks in 76–78 ms, faster than ngspice's netlist loading (109–151 ms).

## Base-to-base change during this card

The same harness and flags were first run on main `9b21238`, before #449 (#444 AMD ordering) and five other fixes merged. That full run is kept, unedited, in `results/scaling-m2-9b21238.json`. Several commits separate the two bases, so this table is not an isolated attribution to #449. Medians:

| Workload | Nodes | spice-ts on 9b21238 | spice-ts on 3490527 | peak RSS 9b21238 → 3490527 |
|---|---:|---:|---:|---:|
| resistor-mesh-op | 1,024 | 26.8 ms | 5.82 ms | 184 → 185 MiB |
| resistor-mesh-op | 10,000 | 2.91 s | 146 ms | 331 → 348 MiB |
| resistor-mesh-op | 50,176 | 83.21 s | 2.71 s | 1676 → 445 MiB |
| rc-ladder-tran | 10,000 | 1.13 s | 1.12 s | 423 → 427 MiB |
| rc-ladder-tran | 50,000 | 9.08 s | 8.92 s | 935 → 933 MiB |
| cmos-inverter-chain-tran | 10,000 | 23.38 s | 18.35 s | 654 → 662 MiB |

On `9b21238` the 10k mesh profile put `GilbertPeierlsSolver.factorize` at 95.7% of self time, which is what motivated #444. The mesh OP went from 106x slower than KLU at 50k to 3.0x.

## Measured bottleneck (CPU profiles)

The profiles are committed under `benchmarks/performance/results/profiles/`, at 10k nodes on the `3490527` build. The mesh and RC profiles cover 1 warmup plus 3 measured `simulate()` calls. The inverter-chain profile covers 1 warmup plus 1 measured call. Summaries come from `profile-summary.mjs`.

- **Top bottleneck now: per-timestep MNA assembly in transient analysis.** Both transient workloads are led by it, and they are the largest remaining gaps against KLU.
  - `cmos-inverter-chain-tran-10000.cpuprofile` (7,018 samples, 29.55 s), self time: `MOSFET.batchStamp` 14.7%, assembler `stampIndex` lookup closure 11.3%, `stampG` closure 10.2%, `buildCompanionSystem` 9.5%, `factorize` 9.0%, MOSFET `stamp` 7.2%, `evaluateBulkJunctions` 6.0%, GC 5.4%. Inclusive, `buildCompanionSystem` is 46.9% and `batchStamp` 31.5%.
  - `rc-ladder-tran-10000.cpuprofile` (1,391 samples, 5.16 s), self time: `stampG` 19.0%, `buildCompanionSystem` 12.9%, transient result `save` 12.4% (every node stored at every output point, though the deck prints one node), `factorize` 11.6%, GC 10.5%, `buildStep` 9.1%.

  Follow-up: [#475](https://github.com/mfiumara/spice-ts/issues/475).
- **Mesh OP:** in `resistor-mesh-op-10000.cpuprofile` (243 samples, 0.73 s), `factorize` is still the largest frame at 54.4% self, then `amdOrdering` 11.2%. On this topology the LU is no longer a scaling outlier.

The raw JSON and CPU profiles are the evidence of record. Rounded values here are rendered by `scaling-m2-report.mjs` and are summaries only.
