# spice-ts Roadmap

This document tracks planned enhancements. Each item links to a GitHub Issue for discussion and tracking.

## Device Models

| Feature | Issue | Notes |
|---------|-------|-------|
| BSIM3v3 MOSFET model | [#TBD](#) | Industry-standard deep-submicron model |
| BSIM4 MOSFET model | [#TBD](#) | State-of-the-art bulk MOSFET model |
| EKV compact MOSFET model | [#TBD](#) | Low-power/analog design; charge-based |
| Gummel-Poon BJT model | [#TBD](#) | Full GP model replacing Ebers-Moll |
| Voltage/current controlled sources (VCVS, VCCS, CCVS, CCCS) | [#TBD](#) | Essential for amplifier modelling |
| Lossless transmission line | [#TBD](#) | High-speed interconnect simulation |

## Solver & Analysis

| Feature | Issue | Notes |
|---------|-------|-------|
| Sparse LU solver (replace dense O(n³)) | [#TBD](#) | KLU-style; enables >300-node circuits |
| DC sweep analysis (.dc command) | [#TBD](#) | Transfer curves, I-V characteristics |

## Language

| Feature | Issue | Notes |
|---------|-------|-------|
| .subckt subcircuit support | [#TBD](#) | Hierarchical netlists |

## Packages

| Feature | Issue | Notes |
|---------|-------|-------|
| `@spice-ts/ui` — waveform viewer | [#TBD](#) | React component for voltage/current plots |
| `@spice-ts/designer` — visual schematic editor | [#TBD](#) | Drag-and-drop circuit builder (LTspice-style) |

---

Issue links will be updated once GitHub Issues are created. See [Contributing](README.md) for how to get involved.
