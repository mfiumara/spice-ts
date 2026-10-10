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

- Captured: 2026-10-10T12:08:50.380Z
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM
- OS: Darwin 27.0.0, arm64
- spice-ts: 0.3.0 at source head `7846a9cad753578e26a6e8de47bdadaafe760d3c`
- Node.js: v22.23.1
- pnpm: 10.28.1
- ngspice: ngspice-47, KLU direct linear solver build

## Results

| Nodes | spice-ts API median | ngspice fresh-process median | ngspice internal-analysis median | spice-ts peak RSS | ngspice peak RSS |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 2.552 ms | 18.770 ms | 0.951 ms | 181.250 MiB | 11.703 MiB |
| 5,000 | 10.284 ms | 35.226 ms | 2.792 ms | 186.891 MiB | 17.516 MiB |
| 10,000 | 21.843 ms | 58.157 ms | 5.317 ms | 218.422 MiB | 24.500 MiB |

Both engines completed every sample. The identical-netlist hashes matched at every size.

## Wins and regressions

The nearest prior same-size receipt is `benchmarks/results/issue-267/scaling-after.json`, captured on the same machine and tool versions. Negative percentages are lower measurements. For runtime and RSS, lower is favorable.

| Nodes | spice-ts median change | spice-ts RSS change | ngspice fresh-process change | ngspice analysis change | ngspice RSS change |
|---:|---:|---:|---:|---:|---:|
| 1,000 | +8.03% regression | +16.03% regression | -9.00% win | -10.50% win | -0.54% win |
| 5,000 | -8.72% win | -6.87% win | -16.01% win | -15.91% win | -0.44% win |
| 10,000 | -12.17% win | -4.31% win | -12.39% win | -11.26% win | -0.13% win |

For continuity, relative to the older canonical `benchmarks/results/scaling-baseline.json`, every measured median is higher: spice-ts runtime by 37.68%, 6.27%, and 4.62% at 1k, 5k, and 10k; ngspice fresh-process runtime by 44.21%, 43.29%, and 44.53%; and ngspice internal-analysis time by 47.02%, 47.35%, and 49.59%. spice-ts peak RSS is also higher by 37.96%, 1.76%, and 4.54%. ngspice peak RSS is effectively flat but higher by 0.13%, 0.18%, and 0.13%. Raw samples are retained so this scheduler/runtime variation remains visible rather than hidden.

At 10,000 nodes:

- spice-ts API median is 2.663x lower than fresh-process ngspice wall time. This is an embedding/startup comparison, not a solver-superiority claim.
- spice-ts API median is 4.108x higher than ngspice's internal analysis time.
- spice-ts peak RSS is 8.915x ngspice peak RSS.

## Correctness boundary

This ladder is a linear DC operating-point fixture. It does not test transient integration, nonlinear convergence, device-model behavior, or waveform parity. It neither exercises nor clears known transient correctness gaps, including classic-corpus execution failures tracked by #280, disabled `NEWBPSTEPPING` handling tracked by #322, and lossy LTRA transient support tracked by #226. These measurements do not imply transient correctness parity.

## `/poteto-mode` receipt

The performance playbook started with the fresh reproducible measurement above. This issue is explicitly measurement-only, so no implementation hypothesis, profile-driven optimization, or solver change was attempted. The raw JSON is the evidence of record; rounded values in this document are summaries only.
