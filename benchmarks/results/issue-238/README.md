# Issue 238 sparse numeric heap receipts

Same-machine measurements on Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs were consecutive in this worktree from base commit `e259c4d`. Raw samples, peak RSS, machine metadata, versions, commands, hashes, correctness summaries, and losses are retained in the JSON and profile files beside this receipt.

## `/poteto-mode` receipt

The performance playbook was loaded before implementation. The required 1k/5k/10k operating-point scaling run, 1,001-point DC sweep, transient smoke run, CPU profile, and sampled heap profile were captured before changing solver code. Source inspection identified `uDiagIdx`, a retained `Int32Array(n)` that duplicates information already encoded by `uColPtr`: numeric factorization always appends each U diagonal after every off-diagonal entry in its column, so its index is `uColPtr[j + 1] - 1`.

A RED test asserted that the duplicate workspace is absent while retaining an exact pivoted 3x3 solve. RED was 23 passed and 1 failed at commit `7648e19`, because `uDiagIdx` was present. GREEN was 24 passed. The implementation removes only that array and reads the existing column end during back substitution. Pivot selection, dynamic factor growth, factor values, singular classification and thresholds, tolerances, and public APIs are unchanged. Existing exhaustive singular/solution, pivoting, dynamic-fill, repeated-factorization, and singular-recovery tests remain green.

The change removes one retained `Int32Array(n)` per analyzed topology, exactly `4 * n` payload bytes. The 10k ladder has 10,001 unknowns, so the deterministic reduction is 40,004 bytes (0.0382 MiB). Process RSS and sampled whole-program profiles are coarser and noisy.

## OP scaling

Command: `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

Medians are the harness medians of 10 samples after 3 warmups. spice-ts includes parse, compile, and solve. ngspice fresh-process time includes CLI startup; internal analysis excludes it.

| Nodes | spice-ts before → after | Change | spice-ts RSS before → after | ngspice-47 internal after | ngspice fresh after | ngspice RSS after | after / internal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.105 → 1.672 ms | -20.57% | 175.797 → 155.047 MiB | 0.607 ms | 13.078 ms | 11.703 MiB | 2.76x slower |
| 5,000 | 7.568 → 6.839 ms | -9.63% | 182.469 → 178.781 MiB | 1.904 ms | 25.546 ms | 17.500 MiB | 3.59x slower |
| 10,000 | 15.425 → 14.915 ms | -3.30% | 211.063 → 211.063 MiB | 3.404 ms | 40.169 ms | 24.469 MiB | 4.38x slower |

Losses are retained: after the change, spice-ts remains 2.76x, 3.59x, and 4.38x slower than ngspice's internal analysis and uses 13.25x, 10.22x, and 8.63x its reported peak RSS. The 10k process peak RSS did not move despite the deterministic 0.0382 MiB solver-storage reduction. Every paired and before/after netlist hash matches. No runtime or RSS superiority claim is made.

## 1,001-point DC sweep

Command: `node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs <receipt>`

| Engine | Before → after median | Change | Peak RSS before → after |
| --- | ---: | ---: | ---: |
| spice-ts | 0.746 → 0.699 ms | -6.41% | 58.406 → 58.047 MiB |
| ngspice fresh CLI | 13.721 → 11.972 ms | -12.75% | 10.250 → 10.250 MiB |

The simultaneous ngspice improvement exposes environmental noise and prevents attributing the wall-time movement solely to this change. After the change, spice-ts uses 5.66x ngspice's peak RSS. Its lower in-process wall time is not an internal-solver comparison. Both receipts retain byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

## Transient smoke

Command: `pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=smoke --runs=5 --output=<receipt>`

| Engine | Before → after median | Change | Peak RSS before → after |
| --- | ---: | ---: | ---: |
| spice-ts | 24.080 → 23.819 ms | -1.08% | 169.219 → 151.391 MiB |
| ngspice fresh CLI | 17.680 → 17.527 ms | -0.86% | 10.297 → 10.297 MiB |

spice-ts remains 1.36x slower and uses 14.70x the peak RSS of the ngspice fresh process. Both spice-ts revisions are deterministic, with exactly identical output summaries and step counts, and use netlist hash `6d83ff4648cbedd66a6053458c45eafa7907d27514790ce17b8ec8e0db925b0b`. The known correctness loss remains visible: neither engine reaches the expected -12 V rail in smoke mode, and the two engines retain different output summaries and accepted-step counts.

## Profiles

Commands:

- `node --cpu-prof --cpu-prof-name=numeric-{before,after}.cpuprofile --cpu-prof-dir=benchmarks/results/issue-238/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`
- `node --heap-prof --heap-prof-name=numeric-{before,after}.heapprofile --heap-prof-dir=benchmarks/results/issue-238/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`

CPU profile samples fell from 80 to 77. Factorization self samples fell from 7 to 5 and solve self samples from 3 to 2. GC samples regressed from 16 to 18. Sampled whole-program heap bytes fell from 4,632,704 to 1,208,576 (-73.91%). These profiles are statistical whole-program samples, not deterministic byte accounting. The raw profiles are primary evidence; the only deterministic allocation claim is removal of the 40,004-byte 10k `Int32Array` payload.
