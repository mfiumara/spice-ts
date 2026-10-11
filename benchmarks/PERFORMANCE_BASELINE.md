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
node --cpu-prof --cpu-prof-dir=benchmarks/performance/results/profiles \
  --cpu-prof-name=resistor-mesh-op-10000.cpuprofile \
  benchmarks/performance/profile-scaling-m2.mjs resistor-mesh-op 10000 3
node --cpu-prof --cpu-prof-dir=benchmarks/performance/results/profiles \
  --cpu-prof-name=rc-ladder-tran-10000.cpuprofile \
  benchmarks/performance/profile-scaling-m2.mjs rc-ladder-tran 10000 3
node benchmarks/performance/profile-summary.mjs benchmarks/performance/results/profiles/<file>.cpuprofile
npx tsx --test benchmarks/performance/scaling-m2.test.ts   # fixture/parser unit checks
```

The full run took about 85 minutes, mostly in the 50k cells.

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
- ngspice time is the wall time of a fresh `ngspice -b` CLI process per sample. That includes process start, deck loading and printing the `.print` rows / `.op` listing to a pipe. The JSON also records ngspice's own `Netlist loading time`, `Total analysis time` and matrix reorder/factor/solve/load phases from `.options acct`.
- ngspice-47 defaults to **Sparse 1.3** when the deck does not request KLU. This build was compiled with KLU. Both solvers are measured. spice-ts rejects `.options klu`, so the solver is chosen outside the shared deck with a per-run `.spiceinit` (`option klu` or `option sparse`). The harness checks the `Using ... as Direct Linear Solver` banner on every sample. KLU is the stronger ngspice baseline and the one spice-ts has to beat.
- Failures stop a cell. The error text and time-to-failure are recorded and never retried or dropped. No timeouts were hit in this run, with a budget of 600 s per sample.
- Correctness sanity: the probe value is recorded per sample, and timing is only meaningful when the engines agree. At t = 100 ns the RC-ladder `v(n10)` is 0.168395 V in spice-ts and 0.168377 V in ngspice (both solvers): a 1.08e-4 relative difference at every size, with different accepted step counts. The mesh corner voltage agrees to ≤1.9e-7 relative at every size.

## Environment and load

- Run: 2026-10-11 01:03–02:28 UTC (`generatedAt` 2026-10-11T02:28:43Z)
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM, Darwin 27.0.0 arm64
- spice-ts 0.3.0 at main `60f49b2` plus this measurement-only branch. Node.js v22.23.1, pnpm 10.28.1
- ngspice: ngspice-47 (Homebrew build, KLU compiled in)
- **The host was shared with other agent workloads.** The 1-minute load average ranged from about 3.5 to 42 on 18 logical CPUs during the run. That inflates p95 (for example spice-ts RC ladder 50k: median 21.3 s, p95 43.0 s) and adds noise in both directions. Medians across isolated processes are the comparison of record. Re-run on an idle machine before quoting any ratio tighter than "about Nx".

## Results: end-to-end time (median / p95 of 10)

| Circuit | Nodes | spice-ts total | ngspice KLU wall | ngspice Sparse 1.3 wall | spice-ts vs KLU | spice-ts vs Sparse |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 371 ms / 1.92 s | 110 ms / 188 ms | 75.8 ms / 113 ms | 3.38x slower | 4.89x slower |
| rc-ladder-tran | 10,000 | 3.62 s / 4.47 s | 339 ms / 451 ms | 283 ms / 362 ms | 10.69x slower | 12.80x slower |
| rc-ladder-tran | 50,000 | 21.34 s / 42.98 s | 2.53 s / 3.67 s | 1.80 s / 2.00 s | 8.43x slower | 11.89x slower |
| resistor-mesh-op | 1,024 | 48.4 ms / 78.0 ms | 30.2 ms / 32.6 ms | 40.6 ms / 44.0 ms | 1.61x slower | 1.19x slower |
| resistor-mesh-op | 10,000 | 9.03 s / 17.71 s | 329 ms / 562 ms | 8.07 s / 11.53 s | 27.40x slower | 1.12x slower |
| resistor-mesh-op | 50,176 | 114.24 s / 166.59 s | 1.26 s / 1.83 s | 70.70 s / 130.22 s | 90.59x slower | 1.62x slower |
| cmos-inverter-chain-tran | 1,000 | **FAILED** | 179 ms / 242 ms | 362 ms / 496 ms | - | - |
| cmos-inverter-chain-tran | 10,000 | **FAILED** | 8.06 s / 15.37 s | 8.44 s / 13.17 s | - | - |
| cmos-inverter-chain-tran | 50,000 | **FAILED** | 64.45 s / 68.50 s | 73.47 s / 118.37 s | - | - |

## Results: phase split, step counts, memory

| Circuit | Nodes | spice-ts parse | spice-ts compile+analysis | ngspice KLU load | ngspice KLU analysis | ngspice Sparse analysis | spice-ts analysis vs KLU analysis | timepoints spice-ts / ngspice | peak RSS spice-ts / KLU / Sparse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 1.77 ms | 369 ms | 3.85 ms | 34.6 ms | 18.7 ms | 10.68x slower | 235 / 120 | 243 / 13 / 12 MiB |
| rc-ladder-tran | 10,000 | 32.4 ms | 3.58 s | 32.5 ms | 247 ms | 185 ms | 14.47x slower | 235 / 120 | 424 / 35 / 30 MiB |
| rc-ladder-tran | 50,000 | 169 ms | 21.17 s | 195 ms | 2.11 s | 1.52 s | 10.04x slower | 235 / 120 | 958 / 137 / 106 MiB |
| resistor-mesh-op | 1,024 | 1.59 ms | 46.9 ms | 3.34 ms | 3.76 ms | 14.4 ms | 12.49x slower | op | 182 / 14 / 13 MiB |
| resistor-mesh-op | 10,000 | 27.5 ms | 8.97 s | 63.8 ms | 113 ms | 7.81 s | 79.58x slower | op | 316 / 49 / 49 MiB |
| resistor-mesh-op | 50,176 | 102 ms | 114.12 s | 192 ms | 676 ms | 70.29 s | 168.79x slower | op | 1503 / 222 / 244 MiB |
| cmos-inverter-chain-tran | 1,000 | failed | failed | 4.93 ms | 155 ms | 316 ms | - | - / 214 | - / 20 / 18 MiB |
| cmos-inverter-chain-tran | 10,000 | failed | failed | 94.0 ms | 7.67 s | 8.21 s | - | - / 214 | - / 105 / 75 MiB |
| cmos-inverter-chain-tran | 50,000 | failed | failed | 264 ms | 63.68 s | 72.83 s | - | - / 214 | - / 473 / 333 MiB |

spice-ts "timepoints" counts returned output points, and ngspice's counts its "Accepted timepoints". The two are related but not the same quantity.

## Wins and losses

- **No category is a spice-ts win at these sizes.** Against ngspice with KLU, spice-ts loses every completed cell end-to-end, even though ngspice's wall time includes native process start and deck loading.
- **Linear transient (RC ladder):** about 3.4x slower than KLU wall time at 1k and 8–11x slower at 10k–50k. Comparing analysis time only, the gap is 10–14x. spice-ts also takes about 2x the output timepoints for the same `.tran 1n 100n`, and its final value matches ngspice to 1.1e-4 relative.
- **Linear OP (2-D mesh):** this is the scaling problem. spice-ts grows from 48 ms (1k) to 9.0 s (10k) to 114 s (50k). ngspice KLU stays at 0.33 s and 1.26 s wall, so spice-ts is 90.6x slower at 50k (168.8x in analysis time). Against ngspice's default Sparse 1.3 the gap is only 1.1–1.6x, because Sparse 1.3 shows the same super-linear blow-up. Most of ngspice's lead comes from KLU's ordering, not from a faster language.
- **Nonlinear transient (MOS1 inverter chain):** spice-ts **fails at every size**. The DC operating point that seeds the transient throws `SingularMatrixError` at the second-to-last stage. A bisection shows chains of 90 stages solve and 91+ stages fail. ngspice solves all sizes with both solvers. Filed as [#428](https://github.com/mfiumara/spice-ts/issues/428) (correctness bug, measurement-only here). No nonlinear runtime comparison exists until it is fixed.
- **Memory:** a loss everywhere. At the largest completed sizes spice-ts peaks at 958 MiB (RC 50k) and 1,503 MiB (mesh 50k), against 137 MiB and 222 MiB for ngspice KLU. That is 7.0x and 6.8x, including Node's roughly 120 MiB baseline.
- **Parsing is not the problem.** spice-ts parses 50k-node decks in 102–169 ms, on par with ngspice's netlist loading (192–195 ms).

## Measured bottleneck (CPU profiles)

Both profiles are committed under `benchmarks/performance/results/profiles/`. Each covers 1 warmup plus 3 measured `simulate()` calls at 10k nodes. Summaries come from `profile-summary.mjs`.

- `resistor-mesh-op-10000.cpuprofile` (2,390 samples, 10.14 s): **`GilbertPeierlsSolver.factorize` is 96.9% of self time (9.83 s).** Parse, compile, topology lock and stamping together are under 1%. This is the top measured bottleneck of M2. Source inspection of `packages/core/src/solver/gilbert-peierls.ts` finds threshold row pivoting but no fill-reducing column ordering (AMD/COLAMD). The working hypothesis is fill-in along the grid bandwidth, which matches ngspice Sparse 1.3 behaving similarly while KLU (AMD-ordered) does not. Follow-up: [#444](https://github.com/mfiumara/spice-ts/issues/444).
- `rc-ladder-tran-10000.cpuprofile` (1,530 samples, 6.24 s): the cost is spread across per-step assembly rather than LU. Self time is `stampG` closure 25.4%, `factorize` 15.4%, `buildCompanionSystem` 12.3%, `buildStep` 11.6%, `attemptStep` 7.3%, `stampC` 5.2% and GC 4.7%. Inclusive, `attemptStep` is 61.7% and `buildCompanionSystem` 38.4%. This is the second target after ordering: per-step re-stamping of a linear circuit, plus spice-ts taking about 2x ngspice's step count. It is listed in #444 as a separate track.

The raw JSON and CPU profiles are the evidence of record. Rounded values here are rendered by `scaling-m2-report.mjs` and are summaries only.
