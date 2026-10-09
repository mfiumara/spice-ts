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

- Date: 2026-10-09
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM
- OS: Darwin 27.0.0, arm64
- spice-ts: 0.3.0 at the PR head
- Node.js: v22.23.1
- pnpm: 10.28.1
- ngspice: ngspice-47, KLU direct linear solver build

## Results

| Nodes | spice-ts API median | ngspice CLI median | ngspice analysis median | spice-ts peak RSS | ngspice peak RSS |
|---:|---:|---:|---:|---:|---:|
| 100 | 1.31 ms | 19.11 ms | 0.67 ms | 129.08 MiB | 10.38 MiB |
| 1,000 | 4.87 ms | 29.20 ms | 1.25 ms | 140.61 MiB | 11.86 MiB |
| 5,000 | 27.34 ms | 65.09 ms | 4.21 ms | 325.11 MiB | 17.89 MiB |
| 10,000 | 68.45 ms | 87.74 ms | 7.66 ms | 916.55 MiB | 24.97 MiB |

No engine failed at any tested size through 10,000 nodes. Sizes above 10,000 were not tested in this slice, so this report makes no claim about the next failure point.

## Interpretation: wins and losses

- Against end-to-end native CLI wall time, the in-process spice-ts API is 14.55x faster at 100 nodes, narrowing to 1.28x at 10,000 nodes. This is an embedding/startup comparison, not a solver-superiority claim.
- Against ngspice's internal analysis timer, spice-ts is slower at every size: 1.95x at 100 nodes, 3.90x at 1,000, 6.49x at 5,000, and 8.94x at 10,000.
- Memory is the clearest loss. At 10,000 nodes spice-ts peaks at 916.55 MiB versus 24.97 MiB for ngspice, a 36.71x ratio.
- The raw samples contain scheduler/GC outliers (for example spice-ts 100-node max 22.19 ms versus 1.31 ms median). Medians are therefore the primary comparison; p95/max are retained rather than hidden.

## Profile findings

The committed 10,000-node V8 CPU profile is `benchmarks/results/profiles/spice-ts-10000.cpuprofile`. It profiles one warmup plus five measured runs without the TypeScript loader in the measured process.

The dominant spice-ts frame is `MNAAssembler.lockTopology`; garbage collection is the next major sampled bucket. Source inspection explains the memory curve: topology locking creates an `Int32Array(n * n)` position map even though this ladder has O(n) structural nonzeros. Sparse pattern analysis and numeric factorization are secondary sampled costs.

Focused follow-ups:

- [#69 — replace dense O(n²) MNA stamp position map](https://github.com/mfiumara/spice-ts/issues/69)
- [#70 — reuse sparse symbolic analysis across unchanged topology](https://github.com/mfiumara/spice-ts/issues/70)

The raw JSON and CPU profile are the evidence of record; rounded values in this report are summaries only.
