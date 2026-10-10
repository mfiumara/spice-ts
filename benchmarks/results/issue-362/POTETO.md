# /poteto-mode receipt

Scope: issue #362 bounded linear CCVS operating-point numeric WASM slice.

Data shape first: one compiled circuit with exactly one unstepped `op` analysis, a fixed-order real MNA matrix and RHS, protocol-native scalar OP voltage/current maps, and one five-token linear `H` card represented by core `CCVS` data as output nodes, control branch index, output branch index, and finite transresistance. The public request/result shapes, ABI version, 64-unknown limit, 256-component limit, and three fixed memory pages stay unchanged.

Two designs were compared. The chosen design adds `stamp_ccvs_f64(order, matrix, outP, outN, controlBranchColumn, branchColumn, transresistance)` to ABI v2. It is explicit, validates both branch columns, performs the complete CCVS stamp in the verified artifact, and follows the merged VCCS/CCCS/VCVS boundary. The rejected design lowered CCVS into existing VCVS and CCCS calls. That avoided artifact growth but relied on a node-named CCCS parameter as a branch-equation row and split one device stamp across two calls.

The accepted form is `name out+ out- controlling-voltage-source transresistance` in `.op`. The controller must be a preceding independent voltage source and is resolved case-insensitively. H cards in DC sweep, transient, or AC, malformed/POLY/behavioral forms, nonlinear companions, and unsupported analyses return structured errors. Each CCVS adds one branch unknown. Singular topology remains `SINGULAR_MATRIX`; caller and fixed backend ceilings remain enforced. There is no TypeScript numeric fallback.

Blocking work was code-path and design inspection, then a failing end-to-end CCVS polarity/control-branch/result-order test. Native ABI, capability, unsupported/error, browser, packed-consumer, and receipt surfaces followed after the bounded path was green. They share the same artifact and package manifest, so implementation and receipt generation are serial.

RED receipt: `pnpm -C packages/wasm exec vitest run src/numeric-wasm.test.ts -t 'solves bounded CCVS OP with control-branch polarity and deterministic result ordering'` failed because the backend returned `ok: false` for H. GREEN used the same command after the native stamp and bounded validation path were implemented.
