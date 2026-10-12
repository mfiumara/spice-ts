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

## Follow-up: transient result recording ([#548](https://github.com/mfiumara/spice-ts/issues/548))

After the LU-factor reuse of #486/PR #541, the RC ladder's top self-time frame at 10k and 50k nodes was `buildStep`: every accepted step built two name-keyed Maps of all node voltages and branch currents, and `solveTransient` then walked them (28-33% self with `appendOrdered`). `solveTransient` now records each point straight from the solution vector; `simulateStream` and `createTransientSim` still return `TransientStep` Maps. Results are bit-identical (waveform hashes, 100/100 aggregate corpus digests, `accuracy.ts --ci`). Paired concurrent A/B, CPU time, 9 rounds: RC ladder 1.08x / 1.30x / 1.41x faster at 1k / 10k / 50k, MOS1 chain 1.03x / 1.05x at 1k / 10k, mesh OP (control, untouched path) 0.99x. spice-ts is still slower than ngspice-47 KLU on every deck except the 1k mesh wall time (startup only). The measurement ran on a heavily loaded shared machine; profiles, the A/B JSONL, the ngspice table and its caveats are in `benchmarks/results/issue-548/README.md`.

## Follow-up: linear stamp programs ([#570](https://github.com/mfiumara/spice-ts/issues/570))

After #548, MNA assembly was the top cost on the transient decks: on the RC ladder `buildCompanionSystem`, the fast-path `stampG`/`stampC` closures, `Resistor.stamp` and the device-list walks were 49-55% of self time at 1k/10k/50k (36-42% on the MOS1 chain). Plain conductance-form resistors and plain capacitors are now stamped by `mna/linear-stamp.ts` from value slots resolved once per locked topology, in the same device order and with the same per-entry additions, so matrices and results are bit-identical; every other device still stamps through its own method. Assembly drops to 25-28% of RC-ladder self time. Results are bit-identical (waveform hashes, 100/100 aggregate corpus digests, `accuracy.ts --ci`). Paired concurrent A/B, CPU time, 9 rounds: RC ladder 1.15x / 1.59x / 1.69x faster at 1k / 10k / 50k, MOS1 chain 1.07x / 1.13x at 1k / 10k, and a loss on the mesh OP control: 0.96x CPU (wall 1.00x) in fresh processes, 1.05x in-process once warm (DC path, where no program is ever built). spice-ts is still slower than ngspice-47 KLU in analysis time on every deck. The measurement ran on a loaded shared machine; profiles, JSONL, the ngspice table and its caveats are in `benchmarks/results/issue-570/README.md`.

## Follow-up: chunked transient result columns ([#609](https://github.com/mfiumara/spice-ts/issues/609))

After #570 the profile is flat. `GilbertPeierlsSolver.factorize` is the largest frame (17-21% on the RC ladder, 29% on the mesh OP), but its cost is spread over the essential scatter/update/pivot/store work; the single hottest line was result recording, `columns[k].push(...)` once per column per saved point (11.0% self at 50k nodes, 9.6% on that line). `solveTransient` now buffers saved points point-major in a bounded `Float64Array` chunk (at most 64 rows and 16 MiB) and appends them a column at a time (`analysis/transient-columns.ts`); the result format is unchanged. Recording drops to 4.6% of 50k self time. Results are bit-identical (waveform hashes in all 108 A/B samples, 100/100 aggregate corpus digests, `accuracy.ts --ci`). Paired concurrent A/B, 9 rounds: a small win at 50k only, RC ladder 1.04x CPU / 1.07x wall; RC 1k/10k, MOS1 chain 1k/10k and the mesh OP control 0.99-1.02x, i.e. no measurable change. Against ngspice-47 KLU at 1k / 10k / 50k (3 samples, unpaired load) spice-ts analysis time is 6.26x / 2.92x / 3.10x slower on the RC ladder, 3.82x / 3.76x / 4.60x on the mesh OP and 5.16x / 3.69x / 1.67x on the MOS1 chain, which now completes at 50k nodes (186 s; the ngspice 50k cell was load-affected). Profiles, JSONL, the ngspice table and remaining scope (factorize book-keeping, step count, constant-G restamping) are in `benchmarks/results/issue-609/README.md`.

## Follow-up: batch-stamped MOSFET runs in stamp programs ([#625](https://github.com/mfiumara/spice-ts/issues/625))

After #617 the MOS1 inverter chain, the deck furthest behind ngspice, had the generic stamp-context closure `stampG` as its top self-time frame (14.2%), and the trapezoidal history restamp `stampPrevB` was its largest inclusive phase (27.6% at 1k nodes): it walks the full device list through `stampStaticDevices`, which stamped every MOSFET through `MOSFET.stamp` (up to eleven `ctx.stampG` calls each), while the Newton companion build already used `MOSFET.batchStamp`. Stamp programs (`mna/linear-stamp.ts`) now also turn each run of consecutive plain level-1 MOSFETs into one `batchStamp` call with the context's device gmin, in netlist order, so every slot receives the same additions in the same order. `stampPrevB` drops to 11.5% of the 1k chain. Results are bit-identical (waveform hashes in all 108 A/B samples, 100/100 aggregate corpus digests, `accuracy.ts --ci`). Paired concurrent A/B, 9 rounds, CPU time: MOS1 chain 1.28x / 1.18x faster at 1k / 10k (1.30x / 1.13x wall); the RC ladder and mesh OP controls 0.98-1.02x, i.e. unchanged. Against ngspice-47 KLU (3 samples, unpaired load) spice-ts analysis time after the change is 3.74x / 2.04x / 2.98x slower on the RC ladder, 3.39x / 3.68x / 4.65x on the mesh OP and 3.15x / 2.92x / 1.34x on the MOS1 chain at 1k / 10k / 50k. Profiles, JSONL, both ngspice tables and remaining scope are in `benchmarks/performance/results/issue-625/README.md`.

## Follow-up: struct-of-arrays MOSFET batch stamping ([#653](https://github.com/mfiumara/spice-ts/issues/653))

After #648, `MOSFET.batchStamp` was the largest self-time frame on any M2 deck: 50.9% of the 10k MOS1 inverter chain profile (54.8% inclusive). Its per-line ticks were flat and dominated by memory latency: per device it chased the instance, its nodes array, params object, slot array and about a dozen boxed double fields, and wrote three of them back. Each batched device list now keeps nodes, value slots and temperature-derived constants in contiguous typed arrays, and the Newton state (vbs, vbd, von) of instances batched together lives in one shared `Float64Array` that `MOSFET.stamp` and `limitNewtonStep` read through the same accessors; the junction and channel equations are shared pure functions. Results are bit-identical (waveform hashes in all 114 A/B samples, 100/100 aggregate corpus digests, `accuracy.ts --ci`, identical scaling probes). Paired concurrent A/B, CPU time: MOS1 chain 1.04x / 1.27x / 1.07x faster at 1k / 10k / 50k (wall 1.06x / 1.30x / 1.20x; 9, 9 and 3 rounds); the RC ladder and mesh OP controls 1.00x. The slowest ratio against ngspice-47 KLU is still the 50k mesh OP (about 4.2-4.4x analysis time, `factorize` 56% of its profile), and spice-ts remains slower than KLU in analysis time on every deck (1.45-4.17x in the unpaired after run). Profiles, JSONL, both ngspice tables, caveats and remaining scope are in `benchmarks/performance/results/issue-653/README.md`.

## Follow-up: sparse LU ordering and update loop on the mesh OP ([#693](https://github.com/mfiumara/spice-ts/issues/693))

After #660 the deck furthest behind ngspice-47 KLU was the resistor-mesh OP, and on it the sparse LU was the cost. At 50k nodes, `GilbertPeierlsSolver.factorize` was 50.4% of self time and `amdOrdering` 9.8%. At 10k they were 25.2% and 13.5%, the top two frames. The fill is not the problem: the AMD order gives fewer factor entries than a geometric nested dissection of the same grid. Two other costs are. The left-looking update loop read a per-row state word on every multiply-subtract to detect fill (12% of factorize ticks). `amdOrdering` allocated a typed-array view per updated variable and resized JS element lists on every pivot. The update loop now reads the row state only when the value it just loaded was exactly zero, which is the only case where the state can change. `amdOrdering` keeps the same algorithm and decisions but stores everything in flat typed arrays. Factors and order are bit-identical: the #669 frozen-kernel oracle passes, and a new frozen-copy test of the pre-#693 `amdOrdering` checks grids, rails and random patterns. Waveform hashes match in all 114 A/B samples, 100/100 aggregate corpus digests are identical, and `accuracy.ts --ci` passes.

Paired concurrent A/B results: the mesh OP is 1.17x / 1.10x / 1.07x faster wall at 50k / 10k / 1k (1.12x / 1.04x / 1.02x CPU; 5, 7 and 7 rounds). The transient decks are unchanged at 0.98-1.02x, and the 50k MOS chain reads 0.98x CPU with a 0.97..1.01 spread. In the unpaired after run against ngspice-47 KLU (5 samples), spice-ts analysis time is 2.84x / 2.71x / 2.05x slower on the RC ladder, 3.32x / 2.37x / 2.80x on the mesh OP, and 2.32x / 1.32x on the MOS chain at 1k / 10k. The 50k MOS cell reads 0.87x, but it is unpaired, inside both engines' historical spread, and not moved by this change, so it is not a claimed win. Profiles, JSONL, the ngspice table, component A/Bs and remaining scope (a supernodal or dense-block kernel layout for the mesh, parse/compile/GC share) are in `benchmarks/performance/results/issue-693/README.md`.

## Follow-up: batched CAPtrunc/INDtrunc charge truncation ([#702](https://github.com/mfiumara/spice-ts/issues/702))

After #693 and #689 (ngspice CKTtrunc step control), the RC ladder takes 119 timepoints against ngspice's 120, and the MOS1 chain 213 against 214, so the step-count gap is gone. #689 added a per-step cost in its place: `LinearReactiveTruncation`, the CAPtrunc/INDtrunc estimate over every linear capacitor and inductor. It runs once per trial point and once per accepted point, and on the 10k RC ladder it was about a fifth of `simulate()` (`timestep` 10.2% plus the `record`/`accept` path 9.9% inclusive). Per capacitor it went through a closure and `TransientChargeState.accept`, which branches on the mode, runs `Array.includes`, and re-selects the integration rule for every charge. Then `chargeTruncationTimestep` allocated two JS arrays on every call.

The charges are now evaluated into one reused `Float64Array`. The new `TransientChargeState.acceptAll` / `truncationTimestepAll` process them in one loop, with the same expressions in the same index order. CKTterr's divided differences are computed in scalars, with the same operations in the same order. Results are bit-identical:

- a new frozen-copy test of the pre-#702 code compares with `Object.is` on 20k random CKTterr inputs, random accept/reject/reset histories, and a C/L/K circuit;
- waveform hashes match in all 114 A/B samples;
- 100/100 aggregate corpus digests are identical;
- `accuracy.ts --ci` passes.

Paired concurrent A/B results (7 rounds at 1k/10k, 5 at 50k): the RC ladder is 1.07x / 1.14x / 1.18x faster wall at 1k / 10k / 50k (1.02x / 1.05x / 1.17x CPU). The MOS1 chain is 1.05x / 1.09x wall at 1k / 10k (1.04x / 1.10x CPU). Its 50k cell is faster too, but its 5-pair spread (1.03..1.44) is too wide to put a number on. The mesh OP control is unchanged at 0.98-1.01x.

Against ngspice-47 KLU in the unpaired after run (5 samples), spice-ts analysis time is:

| deck | 1k | 10k | 50k |
|---|---|---|---|
| RC ladder | 1.95x slower | 1.74x slower | 1.52x slower |
| mesh OP | 2.43x slower | 2.43x slower | 2.72x slower |
| MOS1 chain | 1.02x slower | 0.73x | 0.56x |

Most of the drop since the #693 table comes from #689's step-count change, not this PR. The paired A/B above is this PR's attribution. The MOS chain 10k/50k cells read spice-ts faster, and the probe agrees to 1.1e-3. They are not a claimed win: the engines were not load-paired, and ngspice's own time on that cell has varied by 20% across runs. The mesh OP is now the deck furthest behind KLU. Profiles, JSONL, the ngspice table and remaining scope (mesh `factorize` kernel layout, fused companion passes, a batched MOSFET truncation path, a load-paired engine run) are in `benchmarks/performance/results/issue-702/README.md`.

## Follow-up: reusing the converged Newton iterate on linear transients ([#710](https://github.com/mfiumara/spice-ts/issues/710))

After #704, the companion build was the largest cost inside the transient Newton loop on the RC ladder: `buildCompanionSystem` was 20.5% / 24.9% of `simulate()` inclusive at 10k / 50k nodes, against 6-7% for the LU factor and solve. The ladder is linear, but every accepted step ran two Newton iterations: 236 companion builds for 119 points at 50k. The second iteration rebuilt the same system, skipped the factorisation as unchanged, solved it to the same `x`, and then passed the convergence test with a zero delta.

`attemptStep` now returns that converged result directly when every device is a plain resistor, capacitor or independent source (not TRNOISE/TRRANDOM), whose stamps never read the Newton iterate: same solution bits, same `iterations` count, the guard checkpoint still runs. Any other device, subclass or instance override keeps the full loop. The BE / trapezoidal / Gear-2 history terms in `buildCompanionSystem` are also fused into one column pass, with the same additions in the same order. Results are bit-identical:

- a new test compares with `Object.is` against the same circuits with the shortcut disabled (attempt results, solve counts, and full waveforms for trap, Gear-2 and a UIC/0 Ω deck), and against a frozen copy of the pre-#710 companion fast path on MOS1 and diode/inductor decks;
- waveform hashes match in all 114 A/B samples;
- 100/100 aggregate corpus digests are identical;
- `accuracy.ts --ci` passes.

Paired concurrent A/B results (7 rounds at 1k/10k, 5 at 50k, heavily shared machine): the RC ladder is 1.21x / 1.16x / 1.20x faster wall at 1k / 10k / 50k (1.08x / 1.10x / 1.20x CPU). The MOS1 chain is not iteration-invariant and is unchanged at 1.00-1.01x. The mesh OP control reads 0.95x / 1.03x / 1.01x wall; its 1k cell (26-40 ms samples, 0.89..1.30 spread) is load noise around 1.00x.

Against ngspice-47 KLU in the unpaired after run (5 samples), spice-ts analysis time is:

| deck | 1k | 10k | 50k |
|---|---|---|---|
| RC ladder | 1.36x slower | 1.22x slower | 1.33x slower |
| mesh OP | 2.49x slower | 2.18x slower | 2.42x slower |
| MOS1 chain | 1.33x slower | 1.12x slower | 0.43x |

These ratios are not load-paired and moved with machine load: ngspice's own 10k RC analysis time was 140 ms in the #702 run and 109 ms here. The MOS chain reads slower at 1k / 10k than in the #702 table although this PR leaves it unchanged in paired A/B; #703 (MOS1 device convergence test) landed on main in between. Its 50k cell reads spice-ts faster but is not a claimed win (unpaired; spice-ts's own paired samples on it ranged 26.9-37.8 s in this card). The mesh OP is still the deck furthest behind KLU. Profiles, JSONL, the ngspice table and remaining scope (mesh `factorize` kernel layout, the trapezoidal `stampPrevB` restamp on linear decks, MOS1 stamping, a load-paired engine run) are in `benchmarks/performance/results/issue-710/README.md`.

## Follow-up: supernodal block updates in the sparse LU ([#727](https://github.com/mfiumara/spice-ts/issues/727))

After #710 the RC ladder has no frame above 8% self time. The largest single frame on any M2 deck was the Gilbert-Peierls `factorize` on the resistor mesh: 50.3% of the 50k profile (22.9% at 10k) for one full factorization, 218 M multiply-subtracts at about 2.9 ns each. The mesh OP was also the deck furthest behind ngspice-47 KLU. 96% of those operations come from runs of consecutive L columns with nested patterns (supernodes), but the stored row order differs between linked columns in 89% of the links, so the existing columns cannot be walked together.

A full factorization now packs each such run into a row-major block as it is produced and applies the block to later columns in one pass: rows are first touched in the same order, members whose U entry is exactly zero are skipped as before, and every row receives the same subtractions in the same order (in a register, four rows at a time), running the same zero-activation step. The pivot-reuse refactorization, the solve, AMD and the singleton pre-ordering are unchanged. Results are bit-identical:

- new cases in `gilbert-peierls-equivalence.test.ts` compare factors with `Object.is` against the frozen pre-#669 kernel on grids of side 24/41 and 60 random grid-shaped matrices with exact cancellation, explicit zeros and off-preference pivots, and assert that supernodes are actually used; 9/9 mutants of the new code fail them;
- waveform hashes match in every paired A/B sample;
- 100/100 aggregate corpus digests are identical;
- `accuracy.ts --ci` passes.

Paired concurrent A/B (before/after, >1 = faster): the mesh OP is 1.13x (1.10..1.18, 5 pairs, load 8-12) and 1.19x (1.18..1.21, 7 pairs, load 3-7) faster wall at 50k, 1.06x / 1.07x at 10k; CPU 1.12x / 1.15x at 50k. The factorization kernel alone is about 1.5x faster on a 224 x 224 grid (main 594-637 ms, branch 388-398 ms per call). Everything else is unchanged within noise: mesh 1k 0.99x (CPU 0.94x on 23 ms fresh-process samples; in-process steady state is equal), RC ladder 0.99x / 1.00x / 0.98-1.00x (its factors have no supernodes), MOS chain 0.97x / 1.00x / 1.00x.

Against ngspice-47 KLU (two unpaired runs, 5 samples each), spice-ts analysis time is:

| deck | 1k | 10k | 50k |
|---|---|---|---|
| RC ladder | 1.34x / 1.72x slower | 1.54x / 1.61x slower | 2.31x slower / 0.66x |
| mesh OP | 2.72x / 2.24x slower | 2.10x / 3.55x slower | 1.84x / 1.77x slower |
| MOS1 chain | 1.23x / 1.18x slower | 1.12x slower / 0.69x | 0.46x / 0.56x |

The mesh OP is still slower than KLU at every size and still the deck furthest behind; its 50k cell moved from 2.42x (#710 run) to 1.77-1.84x, in the direction of the paired gain, but the engines were not load-paired. The RC 50k and MOS 10k cells flip between runs with load (ngspice's own RC 50k samples ranged 738-1456 ms) and are not claimed as wins; the MOS 50k cell reads spice-ts faster in both runs but spice-ts's own samples there ranged 26.7-51.6 s. Profiles, JSONL, digests, both ngspice tables, the kernel micro-benchmark and remaining scope (the pivot-reuse path and small supernodes, AMD ordering and GC on the mesh, MOS1 stamping, a load-paired engine run) are in `benchmarks/performance/results/issue-727/README.md`.

## Follow-up: fill-reducing column ordering for the complex AC LU ([#740](https://github.com/mfiumara/spice-ts/issues/740))

The complex AC LU (AC, noise, distortion) factored `G + jωC` in natural MNA order. It now orders columns like the real sparse LU: AMD on the union pattern of G and C once per topology, structural column singletons first, the permuted diagonal as preferred pivot, and the #732 ngspice-47 pivot acceptance unchanged. Results agree within round-off, not bit-for-bit: against a frozen copy of the old kernel and dense elimination the backward error stays at most 3.5e-16 on 240 random MNA systems and at most 9.0e-16 on every AC system of six corpus decks (12/12 mutants killed). 91/100 aggregate corpus digests are bit-identical; the 9 AC/noise/disto fixtures move by at most 1.75e-13 of their analysis peak, with no status, grid or signal-list change. Against ngspice-47 on identical decks the probe error is unchanged in order (≤ 1.2e-11 of the sweep peak).

Paired fresh-process A/B (before/after, >1 = faster), generated decks `rc-ladder-ac`, `rc-mesh-ac` (#426 shapes with an AC source) and the #732 `vcvs-ladder-ac`:

| deck | 1k | 10k | 50k |
|---|---|---|---|
| RC ladder AC | **0.93x** wall (loss), 0.96x CPU | 1.10x | 1.07x |
| RC mesh AC | 3.57x | 14.47x (19.7 s to 1.30 s) | about 34x, unpaired (528 s to 15.7 s) |
| VCVS ladder AC (2000 stages) | 1.35x wall, **0.86x CPU** (loss) | - | - |

In-process steady state the 1k ladder (15 to 12 ms) and the VCVS ladder (254 to 122 ms) are faster too; the fresh-process losses are published as measured. The existing AC generators (`rcChainAC`, BJT/MOS amplifiers, cascode, folded cascode) show no change beyond noise. ngspice-47 KLU still wins every cell: spice-ts is 1.6x / 2.3x / 2.7x slower on the RC ladder, 2.9x / 4.2x / 4.6x on the mesh (before: 64x and 155x at 10k and 50k), and 2.2x on the VCVS ladder, in wall time against a fresh `ngspice -b`. Method, tables, receipts and remaining scope (pivot reuse across frequencies like `NIacIter`, supernodes in the complex kernel) are in `benchmarks/performance/results/issue-740/README.md`.

## Follow-up: pivot reuse across frequencies in the complex AC LU ([#769](https://github.com/mfiumara/spice-ts/issues/769))

After #762 and #758 the scaling comparison was re-run on identical decks: the #426 M2 decks (DC/transient) and the #740 AC decks, at 1k / 10k / 50k nodes. The deck furthest behind ngspice-47 KLU was the RC mesh AC sweep (4.2x / 4.6x wall at 10k / 50k in the #740 receipts), and in its 10k profile the complex `factorize` was 75.4% of self time: a full factorization at every frequency, with the activation, fill-marker, sort and column-maximum bookkeeping that implies. ngspice orders once and then refactors with the same pivots at every later frequency (`NIacIter`: `SMPcReorder`, then `SMPcLUfac`); KLU uses `klu_refactor`.

`ComplexSparseSolver.factorize` now first refactors on the pivot sequence, L/U pattern and scatter positions of its last full factorization, when G and C keep their structure. Unlike ngspice, which keeps a reused pivot until it is singular, the reuse is accepted only when the full kernel would make exactly the same decisions: every reused U and L entry is nonzero, every recorded zero row is still zero, and the ngspice-47 pivot acceptance picks the same row (including magnitude ties, which go to the row found first). Otherwise it falls back to the full factorization. Results are bit-identical:

- a new test compares with `Object.is` against a full factorization at every frequency of 60 random MNA sweeps (3,604 reused, 236 full factorizations, pivot changes in every sweep), an RC mesh sweep, U/L cancellation, tie and pattern-change cases, and every AC/noise system of six corpus decks and the #732 VCVS ladder; 14/14 mutants fail it;
- 100/100 aggregate corpus digests are identical, and every A/B sample has the same result hash;
- the probe error against ngspice-47 on the AC decks is unchanged from the #740 receipts (at most 1.2e-11 of the sweep peak).

Paired fresh-process A/B (before/after, >1 = faster):

| deck | 1k | 10k | 50k |
|---|---|---|---|
| RC mesh AC | 1.00x wall, **0.81x CPU** (loss) | **2.24x** wall, 1.84x CPU | **2.74x** wall (23.3 s to 8.2 s), 2.60x CPU |
| RC ladder AC | 1.02x wall, **0.87x CPU** (loss) | 1.06x wall, 0.98x CPU | 1.11x wall, 1.00x CPU |
| VCVS ladder AC (2000 stages) | 1.28x wall, 1.54x CPU | - | - |

The two 1k CPU losses are fresh-process cost; in-process steady state both decks are faster (RC mesh 1k 37-39 ms to 20-21 ms, RC ladder 1k 13 ms to 11-12 ms). They stay published. Against ngspice-47 KLU wall, spice-ts is now 2.3x / 2.2x / 2.4x slower on the RC mesh AC at 1k / 10k / 50k (was 2.9x / 4.2x / 4.6x in the unpaired #740 run), 1.5x / 1.4x / 1.7x on the RC ladder AC and 1.6x on the VCVS ladder: ngspice still wins every AC cell.

The M2 DC and transient decks never reach the complex solver; their re-run is a control (unpaired, 3 samples each). spice-ts/KLU analysis time after: RC ladder 1.57x / 1.31x / 1.00x, resistor mesh OP 2.88x / 2.44x / 2.02x, MOS1 chain 1.41x / 0.62x / 0.81x at 1k / 10k / 50k, with identical spice-ts probe values before and after. The MOS chain 10k / 50k and RC 50k cells are not claimed as wins: they are unpaired and inside both engines' historical spread (ngspice's own 10k MOS analysis time moved from 3.38 s to 4.80 s between the two runs). The resistor mesh OP and the RC mesh AC are now the decks furthest behind KLU. Tables, profiles, JSONL, the M2 JSON, corpus comparison, mutants and remaining scope (supernodal updates in the complex kernel, the real LU on the 2-D mesh OP) are in `benchmarks/performance/results/issue-769/README.md`.

## Follow-up: check-free supernodal updates in the real LU ([#779](https://github.com/mfiumara/spice-ts/issues/779))

After #773 the #426 M2 decks were re-run on main against ngspice-47 KLU (identical decks, 1k / 10k / 50k nodes). The resistor mesh OP was still furthest behind (2.5x / 3.2x / 1.8x analysis time in that loaded run). In process, its one full sparse LU (`factorize`) was the largest phase at 10k and 50k (21 of 53 ms, 266 of 504 ms), with the #727 supernodal block update `applySupernode` the largest JavaScript self-time frame.

`applySupernode` now runs the zero-activation test of a four-row group only until all four rows are settled (normally after the first member), then applies the remaining members with plain multiply-subtracts, reading consecutive member slots directly when no member was skipped; the members' own U entries are computed row by row over the contiguous block row. Every workspace entry receives the same subtractions in the same order, so the factors are bit-identical: the frozen-kernel equivalence tests pass with three new cases (pivot reuse after a member U entry cancels, perturbed refactorizations of cancelling grids, L·U products that underflow to zero), 8/8 mutants of the new code fail them, 100/100 aggregate corpus digests are identical, and every A/B sample has the same result hash.

- Kernel (fresh solver, full factorization of a grid MNA): 1.41x at 224 x 224 (219 ms to 155 ms), 1.24x at 100 x 100, no change at 32 x 32.
- In `simulate()`: mesh `factorize` 266 to 200 ms at 50k, 21 to 17 ms at 10k; whole `simulate()` 1.04-1.10x, because compile, AMD and assembly are unchanged.
- Paired fresh-process A/B: mesh 50k **1.14x** wall (1.10..1.27), 1.12x CPU; mesh 10k 1.02x and 1k 1.01x (noise); MOS chain 1.00x. **Loss published:** RC ladder 10k 0.98x wall (0.96..1.03), 0.99x CPU; it has no supernodes, so this reads as noise, but it is what was measured.

ngspice-47 KLU still wins the resistor mesh (1.9x / 2.3x / 2.3x at 50k / 10k / 1k in the unpaired after-run), the RC ladder and the 1k MOS chain. On the 50k mesh spice-ts's AMD plus factorization (about 255 ms) is now within about 1.1x of KLU's reorder plus two refactorizations (about 225 ms); the remaining gap is `Circuit.compile` (case-folded name maps), AMD and assembly. Tables, profiles, JSONL, corpus comparison, mutants and remaining scope are in `benchmarks/performance/results/issue-779/README.md`.

## Follow-up: case folding once per node spelling in `Circuit.compile` ([#796](https://github.com/mfiumara/spice-ts/issues/796))

After #784 the M2 decks were re-run on main against ngspice-47 KLU (identical decks). The resistor mesh OP was again furthest behind (2.9x / 2.2x / 1.9x analysis time at 1k / 10k / 50k). With its LU already near KLU's, `Circuit.compile` was its largest in-process phase at 1k (39-40% of `simulate()`) and second at 10k / 50k (30% / 23%). Inside `compile`, every node reference was case-folded four times and every resistor without a model card merged an empty model-default table.

`compile` now folds each distinct raw node spelling once, resolves a name that is already a display spelling straight from the index map, skips the `.global` lookup when there are no globals, and builds a resistor without a model card from its instance parameters directly. Node indices, device order and results are unchanged: 7 new guard tests (random mixed-case decks against an independent folding rule, K/F/H/W/B name binding), 6/6 mutants killed, 100/100 aggregate corpus digests identical, every A/B sample hash identical.

- `compile()` alone: mesh 1.50-1.70x, RC ladder 1.23-1.42x, MOS chain 1.12-1.18x. Its share of the mesh `simulate()` drops to 30% / 18% / 17% at 1k / 10k / 50k.
- Paired fresh-process A/B: mesh 1.03x / 1.06x / 1.07x, RC ladder 1.03-1.04x, MOS chain 1.00x / 1.01x (CPU down to 0.98x in one 10k pair).
- **Measured and not kept:** filling the element-name map lazily gave 2.3-2.9x on mesh compile but made the MOS chain 10k transient 4-5% slower (0.96x, 7/7 pairs) through heap placement of the device objects; bisect in `issue-796/lazy-map-bisect/`.

ngspice-47 KLU still wins the resistor mesh (1.65-3.3x across both unpaired runs), the RC ladder at 1k / 10k and the 1k MOS chain. Tables, profiles, JSONL, corpus comparison, mutants and remaining scope are in `benchmarks/performance/results/issue-796/README.md`.

## Follow-up: MOS1 Newton step limiting on the CMOS inverter chain OP ([#830](https://github.com/mfiumara/spice-ts/issues/830))

The #802 spike measured LU at only 3-6% of OP time on the MOS1 inverter chain, so the rest of the OP was profiled on the M2 `cmos-inverter-chain-tran` deck with `.tran` replaced by `.op` (`benchmarks/performance/profile-cmos-op.mjs`, categorised by `profile-breakdown.mjs`). The top hot path was not the stamp. It was `MOSFET.limitNewtonStep`, called once per MOSFET per Newton iteration, which destructured `this.nodes` twice and created four closures per call: 17.2% of self time at 10k and 34.2% at 50k (100k MOSFETs, 1,110 gmin-stepping iterations), plus the GC it caused. Device load (`batchStamp` + `mos1BulkJunctions`, evaluation and stamping, which V8 inlines together) took 27-28%.

The step limit is now one allocation-free scalar function. `applyDeviceStepLimits` evaluates every plain MOS1 instance from a per-list typed-array batch (nodes, polarity, von from the shared state store) and takes the same `Math.min`. The results are bit-identical: OP digests match in all 20 samples, transient waveform hashes in all 15, and a new test compares against a frozen copy of the pre-#830 implementation with `Object.is` (7/7 mutants killed).

Wall clock, median of 5 interleaved rounds (in-process `simulate()` for spice-ts, fresh `ngspice -b` for ngspice-47, identical netlists):

| deck | before | after | speedup | ngspice-47 wall | Newton iterations spice-ts / ngspice |
|---|---|---|---|---|---|
| cmos-chain-10k OP | 624 ms | 544 ms | 1.15x (pairs 1.12-1.21) | 1580 ms | 226 / 637 |
| cmos-chain-50k OP | 12.88 s | 9.08 s | 1.42x (pairs 1.38-1.49) | 50.2 s | 1110 / 2360 |

After the change, device load is the largest category (31.6% / 46.9% at 10k / 50k), then sparse LU (18.9% / 20.1%) and GC (11.5% / 13.1%). spice-ts reads faster than ngspice-47 on these two OP decks, mostly because it takes 2-3x fewer Newton iterations. Per iteration at 10k the engines are about even. This is not claimed as an engine-level win (shared host, different stepping schedules, two decks). The cmos-chain-tran 10k control is 1.06x faster, from its initial OP. Replacing the array destructuring in `convergenceTest` with indexed reads was measured and not kept (no change within noise). Profiles, JSONL, ngspice acct output, mutants and remaining scope are in `benchmarks/performance/results/issue-830/README.md`.
