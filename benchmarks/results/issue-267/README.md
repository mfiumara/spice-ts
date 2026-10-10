# Issue 267 sparse numeric heap receipts

Measurements ran on Apple M5 Pro with 18 logical CPUs and 48 GiB RAM, macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs used the same worktree and consecutive builds. The JSON and profile files beside this receipt retain every sample, peak RSS, machine metadata, versions, commands, hashes, correctness summaries, wins, and regressions.

## Change and RED receipt

The performance playbook was loaded before implementation. Source inspection found that `activeFlag` retained one `Int32Array(n)` solely to mark pivot columns already queued in the current sparse triangular solve. `pinv` already owns the pivot state and is otherwise stable during that solve. Active pivot `k` is now encoded temporarily as `-k - 2`, preserving `-1` as the unused-row sentinel, then restored from `activeK` before pivot selection.

The RED test `uses pivot state to track active factor columns` was committed at `a4992a8`. It reported 24 passed and 1 failed because `activeFlag` was still present. GREEN reports 25 passed. The exact pivoted 3x3 solution remains `[1, 2, 3]`. Existing exhaustive solution and singular classification, threshold pivoting, dynamic fill growth, repeated factorization, and singular recovery tests remain green.

The change removes one retained `Int32Array(n)` per analyzed topology, exactly `4 * n` payload bytes. The 10k ladder has 10,001 unknowns, so the deterministic retained reduction is 40,004 bytes, or 0.0382 MiB. Pivot choice, factor values, dynamic factor growth, singular thresholds, and public APIs are unchanged.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=benchmarks/results/issue-267/scaling-{before,after}.json
node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs benchmarks/results/issue-267/dc-sweep-{before,after}.json
pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=smoke --runs=5 --output=benchmarks/results/issue-267/transient-{before,after}.json
node --cpu-prof --cpu-prof-name=numeric-{before,after}.cpuprofile --cpu-prof-dir=benchmarks/results/issue-267/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20
node --heap-prof --heap-prof-interval=1024 --heap-prof-name=numeric-{before,after}.heapprofile --heap-prof-dir=benchmarks/results/issue-267/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20
```

Tables use the requested upper median, sorted sample index 5 of 10. Raw arrays and full ranges remain in the JSON.

## Operating-point scaling

| Nodes | spice-ts upper median before to after | Change | spice-ts RSS before to after | ngspice internal after | ngspice CLI after | ngspice RSS after | after / internal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.845 to 2.410 ms | +30.61% | 175.250 to 156.203 MiB | 1.068 ms | 20.653 ms | 11.766 MiB | 2.26x slower |
| 5,000 | 7.025 to 11.287 ms | +60.67% | 184.281 to 200.672 MiB | 3.325 ms | 41.952 ms | 17.594 MiB | 3.39x slower |
| 10,000 | 16.755 to 25.117 ms | +49.91% | 209.609 to 228.266 MiB | 6.017 ms | 66.708 ms | 24.531 MiB | 4.17x slower |

The after run was system-noisy. Independent ngspice upper medians rose from 0.786 to 1.068 ms at 1k, 2.110 to 3.325 ms at 5k, and 3.921 to 6.017 ms at 10k. The spice-ts timing and RSS regressions are retained rather than filtered or attributed to the code change. After the change, spice-ts still uses 13.28x, 11.41x, and 9.31x ngspice's reported peak RSS. Every paired and before/after netlist hash matches. No speed or RSS superiority claim is made.

## DC sweep

The existing focused harness runs a 1,001-point linear resistor-divider sweep with byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Upper median before to after | Change | Peak RSS before to after |
| --- | ---: | ---: | ---: |
| spice-ts | 0.704 to 1.223 ms | +73.68% | 58.188 to 58.719 MiB |
| ngspice fresh CLI | 13.857 to 24.339 ms | +75.64% | 10.266 to 10.312 MiB |

Both engines slowed by similar amounts in this paired run. This is evidence of machine contention, not evidence that the solver change caused or prevented the regression.

## Transient smoke

| Engine | Upper median before to after | Change | Peak RSS before to after |
| --- | ---: | ---: | ---: |
| spice-ts | 24.934 to 39.962 ms | +60.27% | 171.172 to 152.734 MiB |
| ngspice fresh CLI | 22.582 to 29.321 ms | +29.84% | 10.375 to 10.359 MiB |

The spice-ts before and after output summaries and accepted-step counts are exactly identical across all five runs. The known correctness loss remains visible. Neither engine reaches the expected -12 V rail in smoke mode, and their output summaries and step counts differ. Both use netlist hash `6d83ff4648cbedd66a6053458c45eafa7907d27514790ce17b8ec8e0db925b0b`.

## Profiles

The 1 KiB-interval sampled whole-program heap total moved from 3,422,176 to 3,415,712 bytes, a 0.19% reduction. This statistical sample is directional and smaller than the deterministic 40,004-byte retained typed-array reduction. CPU profile samples moved from 208 to 151. Numeric factorization self samples moved from 19 to 13, solve stayed at 3, and garbage-collection samples moved from 32 to 17. Raw profiles are the evidence of record.
