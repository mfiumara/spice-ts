# Bounded linear VCCS OP WASM benchmark

Run from the repository root after building the workspace:

    pnpm --filter @spice-ts/wasm bench:vccs-op

The command runs all three MIT-licensed, project-authored fixtures byte-for-byte through the explicit `spice-ts-wasm` backend and native ngspice-47. It writes `report.json` with fixture hashes, convergence, point and vector counts, scalar OP errors, five fresh-process suite runtime samples, exact-base artifact-size deltas, exclusions, and every measured loss.

This is a correctness and embeddability receipt. It is not a speed claim. TypeScript performs bounded parsing and stamps the existing R/I/V primitives. Every VCCS stamp and numeric solve runs through the fixed-memory ABI-v2 WASM artifact.
