# Issue 210 sparse numeric solve allocation receipts

Same-machine measurements on Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs were consecutive in this worktree from base commit `7f8d211`. Raw samples, peak RSS, machine metadata, versions, commands, hashes, correctness summaries, and losses are retained in the JSON and profile files beside this receipt.

## `/poteto-mode` receipt

The performance playbook was used before implementation. The required 1k/5k/10k operating-point scaling run, 1,001-point DC sweep, transient smoke run, CPU profile, and sampled heap profile were captured before changing solver code. The profile and source inspection identified two sequential dense workspaces in `GilbertPeierlsSolver`: `workspace` for numeric factorization and `workY` for substitution. Two designs were considered: reuse the factor workspace after factorization, or permute/solve directly in the caller RHS. Reusing the factor workspace was selected because the phases do not overlap, every solve entry is initialized, and `factorize()` already clears the workspace before reuse. It removes storage without changing the public API or adding in-place permutation complexity.

A benchmark-first regression asserts that `workY` is absent and verifies two consecutive solutions from one factorization. RED was 22 passed and 1 failed because the old `Float64Array` existed. GREEN was 23 passed. Pivot selection, dynamic fill growth, factor storage, singular thresholds, and tolerances are unchanged.

The change removes one retained `Float64Array(n)` per analyzed topology, exactly `8 * n` payload bytes. The 10k ladder has 10,001 unknowns, so the deterministic reduction is 80,008 bytes (0.0763 MiB). Process RSS and sampled whole-program heap profiles are coarser and noisy; their losses are reported below.

## OP scaling

Command: `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

Medians are the harness medians of 10 samples after 3 warmups. spice-ts includes parse, compile, and solve. ngspice fresh-process time includes CLI startup; internal analysis excludes it.

| Nodes | spice-ts before → after | Change | spice-ts RSS before → after | ngspice-47 internal after | ngspice fresh after | ngspice RSS after | after / internal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.526 → 1.565 ms | +2.55% | 171.266 → 148.891 MiB | 0.589 ms | 12.613 ms | 11.688 MiB | 2.66x slower |
| 5,000 | 7.126 → 6.914 ms | -2.98% | 195.563 → 197.266 MiB | 1.873 ms | 24.897 ms | 17.484 MiB | 3.69x slower |
| 10,000 | 15.322 → 13.946 ms | -8.98% | 219.125 → 221.547 MiB | 3.399 ms | 38.907 ms | 24.469 MiB | 4.10x slower |

Losses are retained: 1k runtime regressed 2.55%; 5k and 10k peak RSS regressed 0.87% and 1.11%. After the change, spice-ts uses 12.74x, 11.28x, and 9.05x ngspice's reported peak RSS. Every paired netlist hash matches.

## 1,001-point DC sweep

Command: `node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs <receipt>`

| Engine | Before → after median | Change | Peak RSS before → after |
| --- | ---: | ---: | ---: |
| spice-ts | 0.717 → 0.709 ms | -1.19% | 58.703 → 58.625 MiB |
| ngspice fresh CLI | 12.968 → 13.896 ms | +7.16% | 10.250 → 10.250 MiB |

The simultaneous ngspice regression shows the environmental noise floor. After the change, spice-ts uses 5.72x ngspice's peak RSS. Its lower in-process wall time is not an internal-solver comparison. Both receipts retain the byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

## Transient smoke

Command: `pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=smoke --runs=5 --output=<receipt>`

| Engine | Before → after median | Change | Peak RSS before → after |
| --- | ---: | ---: | ---: |
| spice-ts | 25.898 → 23.736 ms | -8.35% | 169.281 → 146.828 MiB |
| ngspice fresh CLI | 18.582 → 18.901 ms | +1.71% | 10.281 → 10.297 MiB |

spice-ts remains 1.26x slower and uses 14.26x the peak RSS of the ngspice fresh process. Both revisions are deterministic, have identical spice-ts waveform summaries and step counts, and use netlist hash `6d83ff4648cbedd66a6053458c45eafa7907d27514790ce17b8ec8e0db925b0b`. The known correctness loss remains visible: neither engine reaches the expected -12 V rail in smoke mode.

## Profiles

Commands:

- `node --cpu-prof --cpu-prof-name=numeric-{before,after}.cpuprofile --cpu-prof-dir=benchmarks/results/issue-210/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`
- `node --heap-prof --heap-prof-name=numeric-{before,after}.heapprofile --heap-prof-dir=benchmarks/results/issue-210/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`

CPU profile samples fell from 116 to 82. Factorization self samples fell from 10 to 7; solve self samples remained 2; GC samples increased from 16 to 20. Sampled whole-program heap bytes increased from 2,621,680 to 4,193,520 (+59.96%). This sampled-profile loss is retained and does not contradict the deterministic removal of one 80,008-byte retained solver buffer. Raw profiles are primary evidence; no superiority claim is made.
