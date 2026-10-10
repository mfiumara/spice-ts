# /poteto-mode receipt

Scope: issue #368, linear inductors in the bounded passive transient numeric WASM slice.

Data shape first: the prepared `tran` case is unchanged — one compiled circuit, fixed-order dense G/C matrices and RHS vectors, protocol-native transient series. An inductor is one extra branch unknown: its static stamp is the KCL/branch incidence (a DC short at t=0), and its dynamic stamp is `C[branch][branch] = -L`. The existing fixed-step trapezoidal transition `(G + 2C/dt) x(n+1) = b(n+1) + b(n) + (2C/dt - G) x(n)` is exact for that shape, so no new kernel, ABI entry, or memory is needed.

Two designs considered:

1. Add a dedicated `stamp_inductor_f64` ABI-v3 entry and stamp companion models in C. Rejected: the transient path already assembles G and C in TypeScript and solves every step through the verified fixed-memory `solve_f64`; a new ABI would grow the artifact and the compatibility surface without changing any number.
2. Admit four-token constant-value `L` cards in `.tran`, keep stamping in TypeScript, and route every DC and trapezoidal solve through the unchanged three-page WASM kernel. Chosen: no core engine change, no fallback, artifact unchanged.

Unsupported forms are classified before core parsing so the error is deterministic and LLM-actionable: `K` → `inductor-coupling`, any `IC=` → `inductor-initial-condition`, models, instance parameters, `{expr}` or `L='...'` values → `inductor-form`. Non-positive values remain `INVALID_CIRCUIT` (compile) and voltage-source/inductor loops remain `SINGULAR_MATRIX` (solve). Inductor branches count toward the 64-unknown ceiling.

Blocking steps: failing facade tests (capabilities, analytic RL step, RLC vs TypeScript engine, unsupported-form errors), then the validation change, then the three-engine receipt.

Parallel checkpoint: the implementation is a few lines in one file and the receipt depends on it, so the work is serial; no safe fan-out exists.
