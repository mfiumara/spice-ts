# Issue 140 sparse numeric workspace receipts

Same-machine measurements on Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs were consecutive in this worktree. Raw samples, machine metadata, versions, commands, hashes, and losses are retained in the JSON files.

## Change

`GilbertPeierlsSolver.solve()` now consumes its caller-owned RHS as the solution vector instead of allocating a second `Float64Array(n)` on every solve. This removes one allocation and `8 * n` bytes of typed-array payload per solve (80,000 bytes at 10k unknowns). Numeric factorization now invalidates old factors before starting and clears its reusable dense workspace so a singular pass cannot expose stale factors or workspace values.

Focused tests cover repeated value changes, recovery after a singular factorization, topology-size changes, and RHS/output identity. The new allocation assertion failed against the prior implementation and passes after the change.

## OP scaling (3 warmups, 10 samples; medians)

Command: `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

| Nodes | spice-ts before | spice-ts after | Runtime change | RSS before | RSS after | RSS change | ngspice analysis after | spice-ts / ngspice analysis |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 4.318 ms | 2.425 ms | -43.84% | 158.33 MiB | 136.48 MiB | -13.80% | 0.760 ms | 3.19x slower |
| 5,000 | 19.284 ms | 12.624 ms | -34.54% | 188.61 MiB | 183.73 MiB | -2.58% | 2.445 ms | 5.16x slower |
| 10,000 | 29.455 ms | 27.843 ms | -5.47% | 215.16 MiB | 234.16 MiB | +8.83% | 4.830 ms | 5.76x slower |

The 10k RSS regression is retained rather than hidden. All paired spice-ts/ngspice netlist hashes match; see `before.json` and `after.json`.

## DC sweep (3 warmups, 10 samples; medians)

The committed harness runs a 1,001-point resistor-divider sweep with byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Before | After | RSS before | RSS after |
| --- | ---: | ---: | ---: | ---: |
| spice-ts | 0.782 ms | 0.965 ms | 57.33 MiB | 57.66 MiB |
| ngspice CLI | 13.179 ms | 16.957 ms | 10.27 MiB | 10.31 MiB |

This run is a measured spice-ts regression (+23.42% runtime, +0.57% RSS); the fresh-process ngspice wall-time variation shows the noise floor.

## Representative transient (buck-boost smoke, 5 isolated runs; medians)

| Engine | Before | After | Peak RSS before | Peak RSS after |
| --- | ---: | ---: | ---: | ---: |
| spice-ts | 27.388 ms | 33.678 ms | 154.36 MiB | 134.88 MiB |
| ngspice CLI | 20.460 ms | 23.972 ms | 10.30 MiB | 10.30 MiB |

spice-ts runtime regressed 22.97% while peak RSS improved 12.62%. Both revisions are deterministic and preserve the same spice-ts waveform summary and netlist hash. The known correctness loss remains visible: neither engine reaches the expected -12 V rail in smoke mode, and spice-ts/ngspice final-cycle means remain 0.95635 V / 0.81734 V.

## Profiles

Commands:

- `node --cpu-prof --cpu-prof-name=numeric-{before,after}.cpuprofile --cpu-prof-dir=benchmarks/results/issue-140/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`
- `node --heap-prof --heap-prof-name=numeric-{before,after}.heapprofile --heap-prof-dir=benchmarks/results/issue-140/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`

The before CPU profile sampled 36 GC, 6 symbolic-analysis, and 5 numeric-factorization self samples. Sampling heap totals increased from 3,015,448 to 3,514,624 bytes (+16.55%); this sampled whole-program loss is retained and does not contradict the deterministic source-level removal of one output allocation per solve. Profiles are directional; raw repeated timings are primary.
