# Issue #308 pre-change LTRA baseline

This receipt captures the four unchanged O/LTRA transient fixtures identified by issue #308 at spice-ts commit `cefd1bfdff1fd4b72649dd63fd3696260b65d7b2`.

## Environment

- ngspice: `ngspice-47` (KLU build)
- spice-ts: `0.3.0`
- Node.js: `v22.23.1`
- pnpm: `10.28.1`
- host: Apple M5 Pro (18 logical CPUs), arm64
- OS: macOS 27.0.1 (build 26A434; Darwin 27.0.0)
- capture time: `2026-10-10T12:34:13.813Z`

`baseline.json` is the machine-readable source of truth. It retains the full ngspice time grid and the complete waveform arrays for every probe compared by the dedicated #308 harness. It also records fixture hashes, commands, runtimes, status/error details, point counts, alignment policy, and an explicit per-signal loss entry.

## Commands

The frozen install and current pre-change core were built with:

    pnpm install --frozen-lockfile
    pnpm -C packages/core build

The capture used the repository's `benchmarks/comparison-harness.ts` exports with the same four fixture definitions and probe lists as the dedicated #308 runner. The orchestration command was:

    pnpm exec tsx benchmarks/capture-ltra-baseline.ts benchmarks/results/issue-308/baseline.json

Because wall-clock runtimes and capture metadata vary by host, reproduce and verify the committed fixture hashes, engine outcomes, complete ngspice grids/waveforms, and all per-signal loss records with:

    pnpm exec tsx benchmarks/capture-ltra-baseline.ts --verify benchmarks/results/issue-308/baseline.json

For each fixture, that harness invokes ngspice exactly as follows in an isolated temporary directory with `HOME` set to that directory and `.spiceinit` containing `set filetype=ascii`:

    ngspice -b -r <temporary-rawfile> <fixture.cir>

The corresponding spice-ts command recorded by the harness is:

    @spice-ts/core simulate <fixture.cir>

The dedicated implementation runner uses the same harness path and definitions:

    pnpm -C packages/core build
    npx tsx benchmarks/ltra/compare.ts --output benchmarks/ltra/receipt.json

Runtimes below are single wall-clock samples from this host, not performance claims.

## Results

| Fixture | SHA-256 | Probes | ngspice status / points / runtime | spice-ts pre-change result |
|---|---|---|---|---|
| `ngspice-ltra-line-transient` | `4e7cf33648f6d6039772716720afce93dfd5e44c9ad7eaf40eb7347b6c03b7d4` | `v(2)`, `v(3)` | success / 497 / 16.237291 ms | failed in 58.517417 ms: O/LTRA card unsupported at line 6 |
| `classic-lossy-line-24-inch` | `53e333e9629c3e3c4e839c4b72c9a512a220dec4baf0536e36626f290d240cd6` | `v(1)`, `v(2)`, `v(3)` | success / 728 / 23.422500 ms | failed in 25.366500 ms: O/LTRA card unsupported at line 23 |
| `classic-lossy-line-aluminium` | `4b5bacda04d9c528d4c88d58d211114cb53edbc213c34a62a8c6b2379958db97` | `v(1)`, `v(2)`, `v(3)` | success / 940 / 110.839667 ms | failed in 178.180875 ms: LTRA model unsupported at line 48 |
| `classic-coupled-lossy-lines` | `1927a2a547342e6c60ab1e0489c26d5ca7e92f36d5b08f6a03690b95aa7448b3` | `v(1)`, `v(2)`, `v(3)`, `v(4)`, `v(5)` | success / 739 / 46.707417 ms | failed in 57.952833 ms: LTRA model unsupported at line 249 |

ngspice reported no transient errors for any fixture. All four spice-ts executions failed before producing a transient waveform, so matched-grid max/RMS absolute and relative losses cannot be computed in the pre-change state. `baseline.json` therefore records `metrics: null` and, for every requested probe, `status: "not-computed"` with null absolute/relative error values instead of inventing zero losses.

## Integrity and policy

- Fixture bytes were read directly from the recorded corpus paths without adaptation.
- The hashes above match the pinned corpus manifests.
- Both engines received the same fixture text.
- No per-circuit tolerance or circuit-value changes were made.
- The ngspice waveform arrays in `baseline.json` include only the probes the #308 benchmark compares; unrelated internal ngspice vectors are intentionally omitted.
