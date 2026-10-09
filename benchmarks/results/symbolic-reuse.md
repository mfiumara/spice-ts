# Sparse symbolic reuse evidence

## Method

Before is detached `ab3670a732654f7e165b8aef8524a5930882df15`; after is this change. Both were built and measured on the same Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. No tolerances or circuit values changed.

The public scaling command used three warmups and ten measured runs:

`pnpm bench:scaling -- --sizes=10000 --warmups=3 --runs=10`

The transient command was:

`pnpm -C packages/core exec vitest bench --config vitest.bench.config.ts transient --run`

The symbolic-reuse workload replaces the 10,000-node ladder's `.op` with `.dc V1 0 5 0.5`, runs one warmup, then ten measured public `simulate()` calls. Its CPU profiles each cover one cold public `simulate()` call.

## Topology

| Circuit | Nodes | Branches | Matrix dimension | Structural nonzeros |
| --- | ---: | ---: | ---: | ---: |
| 10,000-node DC ladder / sweep | 10,000 | 1 | 10,001 | 30,000 |
| 100-stage RC transient | 101 | 1 | 102 | 303 |
| 50-section LC transient | 52 | 51 | 103 | 306 |

## Results

Lower is better. The 10,000-node one-shot `.op` result is intentionally reported as a small loss: it creates one assembler and therefore has no cross-solve symbolic work to reuse.

| Workload | Before | After | Change |
| --- | ---: | ---: | ---: |
| 10k-node `.op`, median of 10 | 21.107 ms | 21.377 ms | +1.28% slower |
| 10k-node 11-point DC sweep, median of 10 | 155.410 ms | 80.912 ms | 47.94% faster |
| 100-stage RC transient, mean | 27.891 ms | 26.668 ms | 4.39% faster |
| 50-section LC transient, mean | 26.163 ms | 26.621 ms | +1.75% slower |

The scaling run retained the byte-identical netlist hash `f79c1097da2768fcea75811a686a80f5ef0a90c0bae25241bb4e5786a0832327`. Its paired ngspice medians were 41.713 ms before and 42.619 ms after, showing normal run-to-run machine variance; no superiority claim is made from these samples.

## CPU profiles

- `profiles/symbolic-reuse-before.cpuprofile`: 170.792 ms profile duration, 82 samples, 10 `analyzePattern` self-samples.
- `profiles/symbolic-reuse-after.cpuprofile`: 105.916 ms profile duration, 74 samples, 1 `analyzePattern` self-sample.

Sampling counts are not invocation counts. The focused lifecycle test deterministically asserts one symbolic analysis across changing values, numeric factorization on every solve, and a new symbolic analysis after explicit topology invalidation.
