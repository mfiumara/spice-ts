# Issue #323 sparse-solver scaling refresh

This is a measurement-only refresh of the deterministic 1k/5k/10k DC operating-point ladder benchmark. It changes no fixture values, tolerances, solver code, or runtime code.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=benchmarks/results/issue-323/scaling.json
```

The generated resistor ladder is supplied byte-identically to both engines. The raw receipt records each netlist SHA-256, every timing sample, min/median/p95/max statistics, process peak RSS, tool versions, and machine metadata.

Each size runs in an isolated spice-ts process. Three warmups precede ten recorded samples. The primary statistic is the median.

The timing boundaries are intentionally different and must not be conflated:

- spice-ts API time includes parsing, compilation, topology construction, and solving through public `simulate()`.
- ngspice wall time starts a fresh native CLI process for each warmup and recorded sample.
- ngspice analysis time is ngspice's internal analysis timer. It excludes CLI startup and netlist loading.
- Peak RSS includes each runtime's baseline. spice-ts uses Node `process.resourceUsage().maxRSS`; ngspice reports maximum program size from `.options acct`.

## Environment

- Captured: 2026-10-10T12:19:28.945Z
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM
- OS: Darwin 27.0.0, arm64
- spice-ts: 0.3.0 at source head `6b2f7b280658abeae71e874372db20b9f190b4f1`
- Node.js: v22.23.1
- pnpm: 10.28.1
- ngspice: ngspice-47, KLU direct linear solver build

## Results

| Nodes | spice-ts API median | ngspice fresh-process median | ngspice internal-analysis median | spice-ts peak RSS | ngspice peak RSS |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 2.010 ms | 16.510 ms | 0.865 ms | 160.328 MiB | 11.688 MiB |
| 5,000 | 8.518 ms | 30.338 ms | 2.317 ms | 186.234 MiB | 17.469 MiB |
| 10,000 | 18.623 ms | 46.352 ms | 4.061 ms | 294.531 MiB | 24.531 MiB |

Both engines completed every sample. The identical-netlist hashes matched at every size.

## Wins and regressions

The nearest prior same-size receipt is `benchmarks/results/issue-267/scaling-after.json`, captured on the same machine and tool versions. Negative percentages are lower measurements. For runtime and RSS, lower is favorable.

| Nodes | spice-ts median change | spice-ts RSS change | ngspice fresh-process change | ngspice analysis change | ngspice RSS change |
|---:|---:|---:|---:|---:|---:|
| 1,000 | -14.92% win | +2.64% regression | -19.96% win | -18.50% win | -0.66% win |
| 5,000 | -24.40% win | -7.19% win | -27.66% win | -30.20% win | -0.71% win |
| 10,000 | -25.12% win | +29.03% regression | -30.17% win | -32.21% win | 0.00% unchanged |

For continuity, relative to the older canonical `benchmarks/results/scaling-baseline.json`, spice-ts runtime is 8.44% higher at 1k but 11.98% and 10.80% lower at 5k and 10k. spice-ts peak RSS is higher by 22.04%, 1.40%, and 40.97%. ngspice fresh-process runtime is higher by 26.85%, 23.41%, and 15.20%; internal-analysis time is higher by 33.87%, 22.30%, and 14.27%. ngspice peak RSS is unchanged at 1k, 0.09% lower at 5k, and 0.25% higher at 10k. Raw samples are retained so this scheduler/runtime variation remains visible rather than hidden.

At 10,000 nodes:

- spice-ts API median is 2.489x lower than fresh-process ngspice wall time. This is an embedding/startup comparison, not a solver-superiority claim.
- spice-ts API median is 4.586x higher than ngspice's internal analysis time.
- spice-ts peak RSS is 12.006x ngspice peak RSS.

## Correctness boundary

This ladder is a linear DC operating-point fixture. It does not test transient integration, nonlinear convergence, device-model behavior, or waveform parity. It neither exercises nor clears known transient correctness gaps, including classic-corpus execution failures tracked by #280, disabled `NEWBPSTEPPING` handling tracked by #322, and lossy LTRA transient support tracked by #226. These measurements do not imply transient correctness parity.

## `/poteto-mode` receipt

The performance playbook started with the fresh reproducible measurement above. This issue is explicitly measurement-only, so no implementation hypothesis, profile-driven optimization, or solver change was attempted. The raw JSON is the evidence of record; rounded values in this document are summaries only.
