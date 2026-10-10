# Bounded passive DC-sweep WASM benchmark

Run from the repository root after building the workspace:

    pnpm --filter @spice-ts/wasm bench:dc

The command runs the two committed, project-owned fixtures byte-for-byte through the explicit `spice-ts-wasm` backend and native ngspice. It writes `report.json` with versions, hashes, matched point counts, maximum/RMS absolute and relative errors, five fresh-process runtime samples and medians, the numeric artifact-size delta, exclusions, and retained losses. This is a correctness and embeddability check, not a speed claim.
