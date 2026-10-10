# /poteto-mode receipt

Scope: issue #287 bounded linear VCCS operating-point numeric WASM slice.

Data shape first: one existing compiled circuit with an `op` analysis, a fixed-order real MNA matrix and RHS, protocol-native scalar OP voltage/current maps, and one six-token linear `G` card. The ABI and public simulation request/result shapes stay unchanged.

Two designs considered:

1. Reuse the core parser and compiled `VCCS` data shape, then pass each validated four-node stamp to a bounded ABI-v2 WASM entry point before solving through the same artifact. Chosen because parsing stays authoritative while the new numeric operation and solve have no TypeScript fallback.
2. Invoke the core TypeScript `VCCS.stamp()` and send only the finished matrix to WASM. Rejected because the issue requires the VCCS stamp itself to execute through the verified artifact.

Blocking steps: inspect the manifest and numeric boundary, add failing facade tests for capability, solve, and rejection behavior, then admit the exact linear OP form. Implementation and benchmark share the same bounded contract and fixtures, so they are serial. There is no safe implementation fan-out inside this small slice.

Ceilings remain 64 numeric unknowns, 256 components, three fixed WASM memory pages, exactly one unstepped `.op`, and R/I/V/G only. `G` requires `name out+ out- control+ control- transconductance` with finite transconductance. Other controlled-source forms, G elements in AC/TRAN, nonlinear devices, and unsupported analyses return structured errors. Singular topology remains a structured `SINGULAR_MATRIX`. Every VCCS stamp uses `stamp_vccs_f64`, and every solve uses `solve_f64`, in the verified WASM artifact.

RED receipt: `pnpm -C packages/wasm test -- --run src/numeric-wasm.test.ts` reported 3 focused failures. Capability metadata omitted `G`, the bounded VCCS fixture returned `UNSUPPORTED_FEATURE`, and the polynomial form hit the generic rejection instead of the dedicated `vccs-form` boundary.
