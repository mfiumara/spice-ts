# /poteto-mode receipt

Scope: issue #355 bounded linear VCVS operating-point numeric WASM slice.

Data shape first: one compiled circuit with exactly one unstepped `op` analysis, a fixed-order real MNA matrix and RHS, protocol-native scalar OP voltage/current maps, and one six-token linear `E` card represented by core `VCVS` data as output nodes, control nodes, branch index, and finite gain. The public request/result shapes, ABI version, 64-unknown limit, 256-component limit, and three fixed memory pages stay unchanged.

Two designs considered:

1. Reuse the core parser and compiled `VCVS` shape, then pass each validated output-node, control-node, branch-column, and gain tuple to an additive ABI-v2 `stamp_vcvs_f64` entry point before solving in the same artifact. Chosen because parsing remains authoritative while VCVS stamping and solving have no TypeScript numeric fallback. It follows the merged VCCS and CCCS boundary.
2. Invoke core `VCVS.stamp()` in TypeScript and send only the finished matrix to the existing WASM solver. Rejected because it would move the new E-card numeric stamp outside the verified artifact and would not match the accepted controlled-source pattern.

Blocking steps were current-main sync, code-path and design inspection, then failing capability, ABI, stamping, ordering, polarity, rejection, singular, finite-value, and resource tests. Implementation and benchmark fixtures share the same bounded contract, so they are serial. Browser and packed-consumer checks are independent integration surfaces after the core behavior is green.

The accepted form is `name out+ out- control+ control- voltage-gain` in `.op`. E cards in DC, transient, or AC, malformed/POLY/behavioral forms, nonlinear companions, and unsupported analyses return structured errors. Each VCVS adds one branch unknown. Singular topology remains `SINGULAR_MATRIX`; caller and fixed backend ceilings remain enforced.

RED receipt: after building current main dependencies and the baseline WASM package, `pnpm -C packages/wasm exec vitest run src/numeric-wasm.test.ts` reported six focused failures. Capability metadata omitted `E`, ABI v2 omitted `stamp_vcvs_f64`, two valid polarity/ordering circuits were rejected, POLY reached the generic rejection rather than `vcvs-form`, and the singular boundary was rejected before solve.

Receipt revision contract: generation records `HEAD` unless the checkout is a sole-parent commit that changes only `report.json`. A receipt-only checkout records its parent implementation SHA. The non-writing `bench:vcvs-op:check` command validates this relation, so a stale base SHA or the receipt commit's own SHA is rejected deterministically.
