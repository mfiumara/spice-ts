# Issue 180 sparse numeric-storage receipts

These measurements compare base commit `62c812bedf3b78391cd7df7c823b0cea39024efc` with this change on the same Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Runs were consecutive in the same worktree. The JSON receipts retain every sample, peak RSS, commands, versions, machine metadata, and byte-identical netlist hashes.

## Change and deterministic allocation bound

`GilbertPeierlsSolver` now stores temporary original L row indices directly in the final `lRows` array and converts them in place after pivot selection. The already-maintained permutation supplies each prior pivot row, so the duplicate `pivotOrigRow` array is also removed. This eliminates two retained `Int32Array` allocations per analyzed topology: `4 * n` bytes plus `4 * L capacity` bytes. For the 10,001-unknown ladder shape (`L capacity = 10,000`) that is 80,004 bytes (0.0763 MiB). Dynamic pivot/fill growth remains general; each L growth now allocates and copies two buffers instead of three.

The focused regression fails on base because both duplicate arrays exist. It passes after the change while solving the existing pivot-growth reproducer:

`pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts`

RED: 21 passed, 1 failed (`does not retain duplicate row-index workspaces for numeric factors`).
GREEN: 22 passed.

## OP scaling: upper medians and peak RSS

Command: `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=<receipt>`

The table recalculates the requested upper median (sorted sample index 5 of 10) from the committed raw arrays. ngspice internal time excludes fresh-process CLI startup.

| Nodes | spice-ts base | spice-ts after | Change | spice-ts range base → after | RSS base → after | ngspice-47 internal after | ngspice CLI after | ngspice RSS after |
| ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | 1.715 ms | 1.630 ms | -4.97% | 1.371–2.998 → 1.245–2.802 ms | 166.266 → 145.125 MiB | 0.699 ms | 14.022 ms | 11.688 MiB |
| 5,000 | 7.200 ms | 16.185 ms | +124.81% | 6.780–7.892 → 10.398–28.935 ms | 175.984 → 180.000 MiB | 2.965 ms | 37.430 ms | 17.625 MiB |
| 10,000 | 15.299 ms | 14.486 ms | -5.32% | 14.072–18.077 → 13.319–17.780 ms | 223.563 → 225.641 MiB | 3.412 ms | 39.543 ms | 24.484 MiB |

The 5k after run was system-noisy for both engines: spice-ts upper-median time rose 124.81%, while the independent ngspice CLI upper median rose 46.90% and its internal upper median rose from 1.946 to 2.965 ms. That regression and the full ranges are retained rather than filtered. At 10k, peak RSS regressed 0.93% despite the deterministic 0.0763 MiB solver-storage reduction; process-level Node RSS is too coarse and variable to isolate such a small backing-store change. The after run remains 2.33x/5.46x/4.25x slower than ngspice internal analysis at 1k/5k/10k and uses 12.42x/10.21x/9.22x its reported peak RSS. No solver-superiority claim is made.

## DC sweep: upper medians and peak RSS

Command: `node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs <receipt>`

The existing focused harness runs a 1,001-point resistor-divider DC sweep with byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Base upper median | After upper median | Change | Range base → after | RSS base → after |
| --- | ---: | ---: | ---: | --- | ---: |
| spice-ts | 0.816 ms | 0.716 ms | -12.27% | 0.681–1.064 → 0.636–1.010 ms | 58.906 → 58.297 MiB |
| ngspice fresh CLI | 17.360 ms | 12.152 ms | -30.00% | 15.506–19.479 → 11.679–12.489 ms | 10.328 → 10.250 MiB |

The simultaneous ngspice change shows run-to-run environmental variation. After the change, spice-ts still uses 5.69x ngspice's peak RSS. Its lower in-process API wall time is not an internal-solver comparison.

## Correctness coverage

The focused solver suite retains exhaustive dense-reference/singularity classification for all 81 2x2 matrices over `{-1, 0, 1}`, explicit pivot-growth and structurally-zero activation reproducers, refactorization, singular recovery, and topology reuse. The new regression couples the removed storage invariant to the pivot-growth solution. The repository accuracy benchmark provides the unchanged public benchmark comparison receipt.
