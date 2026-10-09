# Buck-boost 5 ms resource baseline

This is the measurement-only buck-boost slice of [#40](https://github.com/mfiumara/spice-ts/issues/40). It changes no simulator implementation, parser behavior, tolerance, or package version.

## Circuit and comparison contract

The fixture is the project-authored inverting buck-boost from `examples/showcase/main.tsx` and issue #40, extended only from the showcase's 500 µs stop time to the requested 5 ms measurement interval. It is covered by the repository's MIT licence. The checked-in generator returns one deck for both engines; the two-run receipts record the same SHA-256 in every run:

    0a15a45049ecfb5c0b4e984c2d313d02dcfffe917cb811598225f11e1a171396

The deck itself declares `.options method=gear` and `.tran 50n 5m`. No engine-specific netlist rewrite, per-circuit tolerance, or hidden warmup is used. spice-ts runs through its public `simulate()` API. Native ngspice runs the byte-identical file with `-b -r`; a temporary user configuration changes only the raw-file encoding to ASCII so the harness can read the result.

## Reproduce

    pnpm install --frozen-lockfile
    pnpm -C packages/core build
    pnpm exec tsx --test benchmarks/performance/buck-boost.test.ts
    pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=full --runs=2 --output=benchmarks/results/buck-boost-baseline.json

The CI-safe smoke uses the same topology, values, method, and 50 ns print step with a bounded 50 µs stop time:

    pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=smoke --runs=2

Each measured run is a fresh process. Wall time includes parse, setup, and solve. Peak RSS includes the runtime baseline: Node's `process.resourceUsage().maxRSS` is used for spice-ts and `/usr/bin/time -l` for native ngspice. The output summary reports `V(neg)` at the final point, extrema over the run, and the arithmetic mean over the final 10 µs switching cycle. Accepted steps exclude the initial point.

## Environment

- Measurement time: 2026-10-09T23:46:31.661Z
- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB RAM
- OS: Darwin 27.0.0, arm64 (macOS 27.0.1 host)
- spice-ts: 0.3.0 at the measured branch head
- Node.js: v22.23.1
- pnpm: 10.28.1
- ngspice: ngspice-47, KLU direct linear solver build

Exact engine commands are retained in the JSON. The native command shape is:

    /usr/bin/time -l ngspice -b -r <raw> <identical-netlist>

## Two-run receipts

| Engine | Run | Final `V(neg)` | Final-cycle mean | Accepted steps | Output points | Wall | Peak RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| spice-ts | 1 | 0.206456400 V | 0.208176594 V | 114,370 | 114,371 | 246.997 ms | 154.250 MiB |
| spice-ts | 2 | 0.206456400 V | 0.208176594 V | 114,370 | 114,371 | 245.190 ms | 154.156 MiB |
| ngspice | 1 | 0.013093936 V | 0.013153286 V | 106,021 | 106,022 | 408.451 ms | 10.281 MiB |
| ngspice | 2 | 0.013093936 V | 0.013153286 V | 106,021 | 106,022 | 412.847 ms | 10.250 MiB |

Both engines reproduced their output summaries and accepted-step counts exactly across the two isolated runs. Raw unrounded values, commands, versions, machine metadata, extrema, and hashes are retained in `benchmarks/results/buck-boost-baseline.json`.

## Correctness and honest losses

The expected ideal 50% duty inverting rail is -12 V. The benchmark calls that rail reached only when the final-cycle mean is negative and within 10% of -12 V.

Neither engine reaches it on this identical deck:

- spice-ts settles to a positive 0.208176594 V final-cycle mean (relative error 1.0173480495), so `reachesExpectedNegativeRail` is `false`.
- ngspice settles to a positive 0.013153286 V final-cycle mean (relative error 1.0010961072), so `reachesExpectedNegativeRail` is `false`.

This means the run is a reproducible resource and cross-engine behavior baseline, not evidence that the circuit produces the intended negative rail. The shared deck itself needs separate topology/model investigation before either simulator can be used as a -12 V correctness reference; this measurement slice does not alter it.

For resources, spice-ts has lower end-to-end wall time on this machine (two-run median 246.094 ms versus 410.649 ms), but it uses substantially more peak RSS (154.250 MiB maximum versus 10.281 MiB, a 15.003 ratio). This is an in-process Node API versus fresh native CLI comparison, not a solver-superiority claim. ngspice also accepts fewer timesteps (106,021 versus 114,370), so the wall-time numbers do not represent equal internal work.
