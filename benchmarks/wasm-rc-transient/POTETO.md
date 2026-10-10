# /poteto-mode receipt

Scope: issue #259 bounded passive R/C/I/V transient numeric WASM slice.

Data shape first: one prepared compiled circuit, one `op | tran` analysis, fixed-order G/C matrices, RHS vectors, and protocol-native transient series. The public facade stays unchanged.

Two designs considered:

1. Reuse the core transient driver and replace only its linear solve. Rejected because that seam is not public and would edit core paths outside this card.
2. Keep parsing and passive-device stamping in TypeScript, then run every DC and trapezoidal transient linear solve through the verified fixed-memory WASM kernel. Chosen because it preserves the existing backend boundary, adds no fallback, and touches only `packages/wasm`.

Blocking steps: confirm the existing manifest/integrity boundary, write failing facade tests, then implement the fixed-step trapezoidal state transition.

Parallel checkpoint: implementation and benchmark share the backend contract and fixture, so they are serial. Provenance and report text follow measured output. No safe implementation fan-out exists inside this small slice.

Ceilings: 64 numeric unknowns, 256 components, 4,096 result points, three fixed WASM memory pages, one unstepped `.op` or `.tran`, trapezoidal integration, and R/C/I/V only. Unsupported controls and devices return structured errors. There is no TypeScript simulation fallback.

## Rejection remediation

RED receipt: `pnpm -C packages/wasm test -- --run src/numeric-wasm.test.ts` failed three focused facade tests at commit `8da7343`: `.tran 1u 1m` returned a numeric failure, transient `maxSerializedResultBytes: 1` returned success, and `PULSE(...) AC 2` returned success.

Data shapes remain unchanged. The remediation operates on the existing compiled transient interval count, protocol-native `SimulationResultV1`, and source-card string before parsing.

Two interval-grid fixes were considered. Building an explicit time array before solving was rejected because it allocates before the result-point ceiling is enforced. Normalizing a quotient only when it is within floating-point error of an integer was chosen because it preserves a final short interval for genuinely non-integral stop times and keeps the pre-allocation limit check.

The existing AC serialization guard was moved behind one private result-limit helper and reused by transient. Full-card PULSE matching was chosen over accepting any `PULSE(` substring, so compound trailing clauses are rejected at the WASM validation boundary without changing the core parser.
