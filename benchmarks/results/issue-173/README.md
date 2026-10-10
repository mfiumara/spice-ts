# Issue 173 sparse symbolic-storage receipts

Same-machine measurements on Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs were consecutive in this worktree. Raw timing samples, peak RSS, machine metadata, versions, commands, netlist hashes, and the measured DC-sweep RSS loss are retained in the JSON receipts.

## Change and allocation profile

`GilbertPeierlsSolver.analyzePattern()` now sizes the initial L/U typed-array buffers by scanning the input CSC lower and upper structures. Numeric fill and pivot-driven growth continue to use the existing general grow paths.

The removed fill predictor allocated, per analysis of an `n`-unknown system, `2n` JavaScript `Set` instances, `3n` per-column boxed-number arrays, four outer arrays, and two `Int32Array(n)` workspaces. At 10,001 unknowns this removes 20,002 Sets and 30,003 per-column arrays per simulation. The ladder's initial L/U capacities are unchanged; arbitrary fill remains correctness-preserving through dynamic growth.

Allocation-sampling profiles were captured with:

`node --heap-prof --heap-prof-interval=1024 --heap-prof-name=symbolic-{before,after}-1k.heapprofile --heap-prof-dir=benchmarks/results/issue-173/profiles benchmarks/performance/profile-spice-ts.mjs 10000 1`

Sampled symbolic-analysis self-allocation fell from 23,224 bytes (`analyzePattern` plus `buildSymmetricAdjacency`) to 5,952 bytes (`analyzePattern`), a 74.37% reduction. Profiles are directional samples; repeated runtime and peak RSS below are primary.

## OP scaling (3 warmups, 10 samples; medians)

Command: `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

| Nodes | spice-ts before | spice-ts after | Runtime change | RSS before | RSS after | RSS change | ngspice-47 internal after | ngspice fresh-process after | ngspice RSS after |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.913 ms | 1.626 ms | -44.2% | 168.641 MiB | 145.000 MiB | -14.0% | 0.592 ms | 12.494 ms | 11.688 MiB |
| 5,000 | 10.427 ms | 6.837 ms | -34.4% | 195.969 MiB | 187.859 MiB | -4.1% | 1.861 ms | 24.312 ms | 17.484 MiB |
| 10,000 | 20.853 ms | 14.628 ms | -29.9% | 220.766 MiB | 207.500 MiB | -6.0% | 3.443 ms | 40.505 ms | 24.484 MiB |

spice-ts remains 4.25x slower than ngspice's internal analysis at 10k and uses 8.48x its reported peak RSS; no superiority claim is made. The byte-identical spice-ts/ngspice hashes match at every size.

## DC sweep (3 warmups, 10 samples; medians)

The existing focused harness runs a 1,001-point resistor-divider sweep with byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Before | After | Runtime change | RSS before | RSS after | RSS change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| spice-ts | 0.765 ms | 0.732 ms | -4.3% | 58.188 MiB | 58.297 MiB | +0.2% |
| ngspice fresh CLI | 15.088 ms | 12.221 ms | -19.0% | 10.297 MiB | 10.250 MiB | -0.5% |

The small spice-ts DC-sweep RSS regression is retained rather than hidden; the fresh-process ngspice variation illustrates the noise floor.

## Correctness coverage

The focused solver suite exhaustively classifies all 81 matrices in the 2x2 coefficient domain `{-1, 0, 1}`: every nonsingular matrix recovers an exact pivot-sensitive solution, and every zero-determinant matrix throws `SingularMatrixError`. Existing pivot-growth, structurally-zero activation, singular recovery, topology reuse, and larger tridiagonal tests remain enabled.
