# Rust sparse LU spike (#802)

Proof of concept only. Nothing here is wired into `@spice-ts/core`, its runtime, CI required checks or any
published package. Findings and the go/no-go recommendation: [`docs/spikes/rust-lu.md`](../../docs/spikes/rust-lu.md).

## Contents

| file | what |
|---|---|
| `dump-matrices.ts` | Runs the DC OP of the M2 scaling decks (`benchmarks/performance/scaling-m2-fixture.mjs`, `.tran` replaced by `.op`) through the unchanged TS solver and writes the first/last Newton systems to `matrices/*.mtx` (gitignored) plus an OP profile (`matrices/<deck>.json`). |
| `build.sh` | Builds `rust/` (pure binary, napi-rs addon, wasm-bindgen WASM with `+simd128`). |
| `bench.ts` | Per deck and backend (TS, Rust native, Rust WASM, pure Rust): symbolic / factor / solve / refactor medians, residual, bit-identity vs TS, memory; ngspice-47 OP timings for context. Writes `results/rust-lu-spike.json`. |
| `op-swap.ts` | End-to-end DC OP with `GilbertPeierlsSolver` routed to the Rust backends (prototype patched in a child process only). Writes `results/rust-lu-op-swap.json`. |
| `report.ts` | Renders the markdown tables in the doc from the two JSON files (`--dir=results/base-45d6ea7` for the equal-algorithm run). |
| `results/` | Run against current `main`'s TS solver (`versions.gitHead`). `results/base-45d6ea7/` is the equal-algorithm run against the TS solver the Rust port was taken from. |
| `fill-reference.py` | Optional context: SciPy SuperLU fill and factor time on the same matrices (needs a local `pip install scipy`; nothing is vendored). Output in `results/fill-reference.jsonl`. |

## Reproduce

```sh
pnpm install --frozen-lockfile
bash benchmarks/rust-lu-spike/build.sh                      # needs rustup target wasm32-unknown-unknown, wasm-bindgen-cli 0.2.128
spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/dump-matrices.ts
spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/bench.ts
spice-heavy pnpm exec tsx benchmarks/rust-lu-spike/op-swap.ts
pnpm exec tsx benchmarks/rust-lu-spike/report.ts
(cd rust && cargo test -p spice-lu)
```

## Sources and licence

All matrices are generated at run time from the project-authored M2 scaling decks (MIT, this repository).
No third-party circuit, matrix or solver code is copied. The Rust crate is an original port of spice-ts' own
TypeScript solver (MIT). KLU/SuiteSparse are not used or vendored; SciPy is an optional, local-only
reference for `fill-reference.py`.
