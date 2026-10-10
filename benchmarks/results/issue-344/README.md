# Issue 344 sparse workspace-clear receipts

Measurements ran consecutively in one worktree on Apple M5 Pro (18 logical CPUs, 48 GiB RAM), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. The JSON and profiles beside this receipt retain every runtime sample, process peak RSS, versions, machine metadata, commands, and byte-identical netlist hashes. Timings are noisy wall-clock observations, not a superiority claim.

## Profile and bounded change

The before 10k operating-point CPU profile contained 132 samples over 669.458 ms: garbage collection had 30 self samples, sparse numeric `factorize` had 6, topology locking had 6, and sparse `solve` had 1. Source inspection of the numeric path found that every first factorization called `workspace.fill(0)` even though `analyzePattern()` had just allocated an already-zero typed array. Successful factorization also clears every touched entry, so an immediate re-factorization repeated the full clear unnecessarily.

The one bounded optimization tracks whether `solve()` or an interrupted factorization may have left workspace values. `factorize()` now performs the full clear only in that dirty state. Singular recovery remains covered by the existing test, and repeated factorization after a successful pass skips the redundant O(n) clear. No pivoting, factor values, fill growth, singular thresholds, or public APIs changed.

The RED test `skips a redundant full workspace clear after successful factorization` reported 25 passed and 1 failed because the second successful factorization still called `fill()` once. GREEN reported 26 passed. A sabotage comparison built the pre-change and changed solver and produced byte-identical public `simulate()` JSON hashes:

| Fixture | Before and after SHA-256 | JSON bytes |
| --- | --- | ---: |
| 1k OP | `528b99b1c33d15ddaf2cc6e85540be9c0e3c5624e07f0bf71878741588c22094` | 385 |
| 5k OP | `528b99b1c33d15ddaf2cc6e85540be9c0e3c5624e07f0bf71878741588c22094` | 385 |
| 10k OP | `528b99b1c33d15ddaf2cc6e85540be9c0e3c5624e07f0bf71878741588c22094` | 385 |
| 1,001-point DC sweep | `7bea0bb1327f368daaea21cb426ac8045210a266ee31ea76d88ccfcc6ec399d1` | 12,993 |

## Commands and process boundaries

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=benchmarks/results/issue-344/scaling-{before,after}.json
node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs benchmarks/results/issue-344/dc-sweep-{before,after}.json
node --cpu-prof --cpu-prof-name=numeric-{before,after}.cpuprofile --cpu-prof-dir=benchmarks/results/issue-344/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20
node --heap-prof --heap-prof-interval=1024 --heap-prof-name=numeric-{before,after}.heapprofile --heap-prof-dir=benchmarks/results/issue-344/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20
```

Each scaling size runs in its own spice-ts process with three in-process warmups and ten public `simulate()` samples. spice-ts time includes parse, compile, and solve. Each ngspice wall sample is a fresh native CLI process; ngspice internal analysis time is reported separately. RSS is whole-process peak memory including runtime startup, not incremental solver heap. Scaling medians are the conventional median of ten samples retained by the public harness. The older focused DC harness reports its documented upper median (sorted index 5 of 10) and compares warm spice-ts calls with fresh ngspice CLI processes.

## Operating-point scaling

| Nodes | spice-ts median before to after | Change | spice-ts RSS before to after | ngspice internal before to after | ngspice CLI before to after | ngspice RSS before to after |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.924 to 2.473 ms | -15.44% | 182.719 to 160.641 MiB (-12.08%) | 1.039 to 1.141 ms (+9.76%) | 20.548 to 22.990 ms (+11.88%) | 11.656 to 11.703 MiB (+0.40%) |
| 5,000 | 10.253 to 10.234 ms | -0.19% | 187.484 to 186.641 MiB (-0.45%) | 3.158 to 3.096 ms (-1.95%) | 42.063 to 39.064 ms (-7.13%) | 17.484 to 17.484 MiB (0.00%) |
| 10,000 | 25.481 to 24.171 ms | -5.14% | 222.688 to 255.438 MiB (+14.71%) | 5.720 to 5.441 ms (-4.89%) | 67.293 to 60.217 ms (-10.52%) | 24.516 to 24.547 MiB (+0.13%) |

The 10k spice-ts RSS regression is retained. After the change, spice-ts remains 4.44x slower than ngspice internal analysis at 10k and uses 10.41x ngspice's reported peak RSS. The process boundaries are not equivalent, so neither the lower spice-ts end-to-end wall time nor any paired change supports a solver-superiority claim. Every before/after and cross-engine netlist hash matches at each size.

## DC sweep

The focused fixture is a 1,001-point linear resistor-divider sweep with byte-identical netlist hash `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Upper median before to after | Change | Peak RSS before to after |
| --- | ---: | ---: | ---: |
| spice-ts warm public API | 1.361 to 1.195 ms | -12.18% | 59.594 to 58.656 MiB (-1.57%) |
| ngspice fresh CLI | 22.221 to 22.312 ms | +0.41% | 10.266 to 10.313 MiB (+0.46%) |

This workload mostly re-enters factorization after `solve()`, where the clear remains required, so its observed improvement should be treated as noisy paired evidence rather than attributed wholly to the one skipped initial clear.

## Profiles and retained caveats

The after CPU profile contained 135 samples over 655.334 ms: sparse numeric `factorize` remained at 6 self samples, garbage collection moved from 30 to 21, and topology locking remained at 6. The sampled whole-process heap total regressed from 3,044,856 to 3,086,936 bytes (+1.38%). Sampling profiles are directional and include parsing, compilation, module loading, and GC; they do not isolate the skipped typed-array clear. The raw profiles are the evidence of record.

The optimization removes no retained allocation and does not address the dominant whole-program parsing, topology-locking, or garbage-collection costs visible in the profile. It only avoids an unnecessary full clear when the solver can prove the workspace is already zero. All wins and regressions above are published without filtering.
