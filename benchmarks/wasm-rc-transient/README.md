# Bounded passive RC transient WASM benchmark

Run from the repository root after building the workspace:

    pnpm exec tsx benchmarks/wasm-rc-transient/compare.ts

The command runs the committed fixture unchanged through the explicit `spice-ts-wasm` backend and native ngspice. It writes `report.json` with convergence, point counts, matched-timepoint waveform errors, five fresh-process runtime and peak-RSS samples, versions, machine data, commands, artifact sizes, and retained losses. This is a correctness and embeddability check, not a speed claim.
