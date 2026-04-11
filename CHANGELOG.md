# Changelog

## [0.2.0] - 2026-04-11

### Device Models

- **BSIM3v3 MOSFET** (LEVEL=49) — industry-standard deep-submicron model with DC, capacitance, and transient support. Includes threshold voltage corrections (SCE, DIBL), field-dependent mobility, velocity saturation, and channel length modulation.
- **Controlled sources** — VCVS (E), VCCS (G), CCVS (H), CCCS (F) devices with full DC, AC, and subcircuit expansion support.

### Solver Performance

- **Sparse LU solver** — Gilbert-Peierls factorization with CSC matrix format and symbolic/numeric split. Replaces the dense O(n^3) solver. DC 500-node circuit: 179ms to 2.4ms (75x improvement).
- **Complex sparse LU** — native n*n complex factorization for AC analysis, eliminating the 2n*2n real matrix expansion. AC 100-node: 98ms to 3.3ms (30x improvement).
- **Typed-array stamping** — devices stamp directly into pre-allocated CSC buffers via `Float64Array` writes, bypassing Map-of-Maps overhead. 2x transient speedup.
- **Batch MOSFET evaluation** — all transistors in a model group evaluated in one tight loop with direct array writes, eliminating polymorphic dispatch and closure overhead.
- **Pattern caching** — symbolic factorization reused across Newton-Raphson iterations, transient timesteps, and AC frequency points.
- **`SparseSolver` interface** — abstraction boundary for future KLU WASM plugin.

### Performance vs ngspice-WASM (eecircuit-engine)

| Analysis | vs ngspice-WASM |
|---|---|
| DC (all sizes) | 1.2-5x faster |
| AC (all sizes) | 1.6-3x faster |
| Nonlinear CMOS | 1.1-1.3x faster |
| Transient (small-medium) | parity |

### Documentation

- **TSDoc comments** on all public API exports — IDE hover-docs for `simulate`, `parse`, `Circuit`, result types, error types, and all options.
- **7 runnable examples** in `examples/` — voltage divider, RC step response, AC Bode plot, CMOS inverter, programmatic API, subcircuit libraries, streaming API. Compiled and run on every CI build.

### Other

- 3-way benchmark comparison script: `pnpm bench:compare` (spice-ts vs eecircuit-engine vs ngspice)
- Source ramping for improved DC convergence on nonlinear circuits
- GMIN stepping for numerical stability

## [0.1.0] - 2026-04-10

Initial release.

- DC operating point, DC sweep, transient (Euler/trapezoidal), AC small-signal
- R, C, L, V, I, Diode, BJT (Ebers-Moll), MOSFET (Level 1)
- `.subckt`/`.ends`, `.include`, `.lib`/`.endl`, `.param` expressions
- `parseAsync()` with `IncludeResolver`
- `simulateStream()` async iterator
- Programmatic `Circuit` API
