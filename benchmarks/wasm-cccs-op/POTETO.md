# /poteto-mode receipt

Scope: issue #309 bounded linear CCCS operating-point numeric WASM slice.

Data shape first: one existing compiled circuit with an `op` analysis, a fixed-order real MNA matrix and RHS, protocol-native scalar OP voltage/current maps, and one five-token linear `F` card whose controlling voltage source resolves to an existing MNA branch. The public simulation request/result shapes and ABI version stay unchanged.

Two designs considered:

1. Reuse the core parser and compiled `CCCS` data shape, then pass each validated output-node, controlling-branch-column, and gain tuple to an additive ABI-v2 WASM entry point before solving through the same artifact. Chosen because parsing and branch resolution stay authoritative while the new numeric operation and solve have no TypeScript fallback.
2. Invoke the core TypeScript `CCCS.stamp()` and send only the finished matrix to WASM. Rejected because the issue requires the CCCS stamp itself to execute through the verified artifact.

Blocking steps: inspect the manifest and numeric boundary, add failing facade tests for capability, ABI export, solve, and rejection behavior, then admit the exact linear OP form. Implementation and benchmark share the same bounded contract and fixtures, so they are serial. There is no safe implementation fan-out inside this small slice.

Ceilings remain 64 numeric unknowns, 256 components, three fixed WASM memory pages, and exactly one unstepped `.op`. `F` requires `name out+ out- controlling-voltage-source current-gain`, an already resolvable voltage-source branch, and finite gain. Other CCCS forms, F elements in AC/TRAN/DC, other controlled-source types, nonlinear devices, and unsupported analyses return structured errors. Singular topology remains a structured `SINGULAR_MATRIX`. Every CCCS stamp uses `stamp_cccs_f64`, and every solve uses `solve_f64`, in the verified WASM artifact.

RED receipt: `pnpm -C packages/wasm exec vitest run src/numeric-wasm.test.ts` reported 5 focused failures. Capability metadata omitted `F`, the ABI omitted `stamp_cccs_f64`, the bounded fixture returned `UNSUPPORTED_FEATURE`, the polynomial form hit the generic rejection instead of `cccs-form`, and non-finite gain was rejected as unsupported instead of invalid numeric input.
