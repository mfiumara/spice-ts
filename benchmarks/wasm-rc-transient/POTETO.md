# /poteto-mode receipt

Scope: issue #259 bounded passive R/C/I/V transient numeric WASM slice.

Data shape first: one prepared compiled circuit, one `op | tran` analysis, fixed-order G/C matrices, RHS vectors, and protocol-native transient series. The public facade stays unchanged.

Two designs considered:

1. Reuse the core transient driver and replace only its linear solve. Rejected because that seam is not public and would edit core paths outside this card.
2. Keep parsing and passive-device stamping in TypeScript, then run every DC and trapezoidal transient linear solve through the verified fixed-memory WASM kernel. Chosen because it preserves the existing backend boundary, adds no fallback, and touches only `packages/wasm`.

Blocking steps: confirm the existing manifest/integrity boundary, write failing facade tests, then implement the fixed-step trapezoidal state transition.

Parallel checkpoint: implementation and benchmark share the backend contract and fixture, so they are serial. Provenance and report text follow measured output. No safe implementation fan-out exists inside this small slice.

Ceilings: 64 numeric unknowns, 256 components, 4,096 result points, three fixed WASM memory pages, one unstepped `.op` or `.tran`, trapezoidal integration, and R/C/I/V only. Unsupported controls and devices return structured errors. There is no TypeScript simulation fallback.
