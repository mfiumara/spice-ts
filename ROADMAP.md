# spice-ts Roadmap

This document tracks planned enhancements. Each item links to a GitHub Issue for discussion and tracking.

## Device Models

| Feature | Issue | Notes |
|---------|-------|-------|
| BSIM3v3 MOSFET model | [#2](https://github.com/mfiumara/spice-ts/issues/2) | Industry-standard deep-submicron model |
| BSIM4 MOSFET model | [#3](https://github.com/mfiumara/spice-ts/issues/3) | State-of-the-art bulk MOSFET model |
| EKV compact MOSFET model | [#4](https://github.com/mfiumara/spice-ts/issues/4) | Low-power/analog design; charge-based |
| Gummel-Poon BJT model | [#5](https://github.com/mfiumara/spice-ts/issues/5) | Full GP model replacing Ebers-Moll |
| Voltage/current controlled sources (VCVS, VCCS, CCVS, CCCS) | [#6](https://github.com/mfiumara/spice-ts/issues/6) | Essential for amplifier modelling |
| Lossless transmission line | [#7](https://github.com/mfiumara/spice-ts/issues/7) | High-speed interconnect simulation |
| Compiled model plugin API (WASM) | | Vendor-supplied binary models via plugin interface |

## Solver & Analysis

| Feature | Issue | Notes |
|---------|-------|-------|
| Sparse LU solver (replace dense O(n³)) | [#8](https://github.com/mfiumara/spice-ts/issues/8) | KLU-style; enables >300-node circuits |
| DC sweep analysis (.dc command) | [#9](https://github.com/mfiumara/spice-ts/issues/9) | Transfer curves, I-V characteristics |

## Language

| Feature | Issue | Notes |
|---------|-------|-------|
| .subckt subcircuit support | [#10](https://github.com/mfiumara/spice-ts/issues/10) | Hierarchical netlists |

## Packages

| Feature | Issue | Notes |
|---------|-------|-------|
| `@spice-ts/ui` — waveform viewer | [#11](https://github.com/mfiumara/spice-ts/issues/11) | React component for voltage/current plots |
| `@spice-ts/designer` — visual schematic editor | [#12](https://github.com/mfiumara/spice-ts/issues/12) | Drag-and-drop circuit builder (LTspice-style) |

---

See each issue for design notes and implementation approach. PRs welcome — check [Contributing](README.md) to get started.
