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
