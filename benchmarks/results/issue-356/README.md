# Issue 356 sparse numeric profiling receipt

Measurements ran from merged-main commit `1c2c8985e47f3030396a1fc3da5fd47db50dc330` on Apple M5 Pro (18 logical CPUs, 48 GiB RAM), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. The raw JSON and profiles beside this receipt retain every runtime sample, process peak RSS, versions, machine metadata, commands, sampled heap/GC evidence, and byte-identical netlist hashes.

## Outcome

No sparse numeric code was changed. The 10k profile attributes only 5 of 134 CPU self samples to `factorize`, no self samples to `solve`, and 13,472 of 3,226,088 sampled heap bytes to `factorize`. Garbage collection (23 samples), parsing, compilation, and the enclosing Newton path remain larger whole-workload costs, but those paths are outside this card's sparse-numeric ownership.

Source inspection found no additional general numeric allocation or pass that could safely be removed while preserving pivot, singularity, dynamic-fill, and failed-factorization recovery invariants. The remaining dense solver arrays have simultaneously-live roles: permutation/pivot state, touched-row tracking, ordered active columns, and the shared factor/solve workspace. Changing or aliasing them without workload evidence would force an optimization rather than follow the profile. Therefore there is no artificial before/after pair and no RED/GREEN production-code cycle; the measurement-only outcome follows the issue's explicit fallback.

Focused invariant verification was retained: `pnpm -C packages/core test -- src/solver/gilbert-peierls.test.ts src/solver/sparse-matrix.test.ts src/solver/complex-sparse-solver.test.ts` completed with 85 files and 1,025 tests passing. That includes singular classification and recovery, threshold pivot behavior, dynamically grown numeric fill, workspace reuse, repeated factorization, and complex sparse solves.

## Commands and process boundaries

- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10 --output=benchmarks/results/issue-356/scaling-before.json`
- `node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs benchmarks/results/issue-356/dc-sweep-before.json`
- `node --cpu-prof --cpu-prof-name=numeric-before.cpuprofile --cpu-prof-dir=benchmarks/results/issue-356/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`
- `node --heap-prof --heap-prof-interval=1024 --heap-prof-name=numeric-before.heapprofile --heap-prof-dir=benchmarks/results/issue-356/profiles benchmarks/performance/profile-spice-ts.mjs 10000 20`

Each OP size runs in its own spice-ts process with three in-process warmups and ten public `simulate()` samples. spice-ts time includes parse, compile, and solve. Every ngspice wall sample is a fresh native CLI process; its internal analysis time is reported separately. RSS is whole-process peak memory including runtime startup, not incremental solver heap. The DC harness compares warm spice-ts public API calls against fresh ngspice CLI processes and reports its documented upper median (sorted index 5 of 10). These boundaries are not equivalent.

## Operating-point scaling

| Nodes | spice-ts median | spice-ts RSS | ngspice internal median | ngspice fresh CLI median | ngspice RSS | spice-ts / ngspice internal | RSS ratio |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.431 ms | 180.500 MiB | 0.964 ms | 19.367 ms | 11.688 MiB | 2.52x slower | 15.44x |
| 5,000 | 8.134 ms | 196.016 MiB | 3.161 ms | 40.575 ms | 17.500 MiB | 2.57x slower | 11.20x |
| 10,000 | 23.648 ms | 246.078 MiB | 5.274 ms | 59.171 ms | 24.469 MiB | 4.48x slower | 10.06x |

Every cross-engine netlist hash matches at each size. The lower spice-ts end-to-end wall time than the fresh ngspice CLI is a process-startup boundary, not evidence that the solver is faster. Against ngspice's internal analysis timing, spice-ts loses at all three sizes.

## 1,001-point DC sweep

The byte-identical netlist SHA-256 is `01f006d766bcdf66c8b592348bf4d789dbe5756846b0cacea5eb9646b76754c0`.

| Engine | Upper median | Peak RSS |
| --- | ---: | ---: |
| spice-ts warm public API | 1.117 ms | 58.859 MiB |
| ngspice fresh CLI | 19.161 ms | 10.266 MiB |

spice-ts used 5.73x the reported ngspice peak RSS. The timing boundary prevents an internal-solver comparison.

## Exact public output hashes

Complete `JSON.stringify(simulate(...))` results were hashed after the profile base build. The 1k, 5k, and 10k OP results each produced SHA-256 `528b99b1c33d15ddaf2cc6e85540be9c0e3c5624e07f0bf71878741588c22094` (385 bytes). The DC sweep produced `7bea0bb1327f368daaea21cb426ac8045210a266ee31ea76d88ccfcc6ec399d1` (12,993 bytes). `output-hashes.json` is the machine-readable receipt.

## CPU, heap, and caveats

The CPU profile covers 563.958 ms and 134 samples. Selected self samples were: GC 23, Newton-Raphson 8, tokenizer 7, number parsing 6, sparse `factorize` 5, topology lock 4, DC solve 3, and sparse `solve` 0. The sampled heap profile totals 3,226,088 bytes; selected self bytes were DC solve 203,568, `Float64Array` 35,808, Newton-Raphson 23,080, topology lock 20,696, and sparse `factorize` 13,472.

Profiles are directional samples of the whole public parse/compile/solve workload, not deterministic allocation accounting. The generated linear resistor ladder exercises OP scaling but not nonlinear/transient sparse behavior. No transient claim is made, no per-circuit tuning was performed, and no speed or superiority claim is made. Raw profiles are the evidence of record.
