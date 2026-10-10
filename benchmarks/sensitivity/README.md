# Bounded sensitivity parity receipt

Run:

    pnpm exec tsx benchmarks/sensitivity/compare.ts

Pinned receipt environment: ngspice-47; darwin arm64; Node v22.23.1. The comparison supplies each committed netlist byte-for-byte to both engines. Sources, revisions, licences, and adaptations are recorded in `benchmarks/SOURCES.md`.

The reported derivative is absolute change in output per unit change in a primary device value. Relative error uses `max(abs(ngspice), 1e-12)` as its denominator. Results are reordered by the typed spice-ts device order before matched-point comparison; the JSON command output also publishes ngspice's native primary-vector order.

| Fixture | Samples | Max absolute | RMS absolute | Max relative | RMS relative |
|---|---:|---:|---:|---:|---:|
| `passive-rlc-dc` | 3 | 2.2220566432327137e-10 | 1.4745222297048314e-10 | 9.999764494111983e-7 | 8.164569576978552e-7 |
| `passive-rlc-ac` | 25 | 4.475909205007808e-5 | 1.1641398558867747e-5 | 1.0000394308909735e-6 | 6.418041908645612e-7 |
| `active-vcvs-ac` | 25 | 9.999837763396968e-10 | 6.365635844627285e-10 | 9.999847762683923e-7 | 6.324459059026921e-7 |

All three ngspice and spice-ts runs converged. The non-zero residuals above are retained losses, not rounded away: the largest absolute loss is the passive capacitor derivative (4.475909205007808e-5), while the largest aggregate relative loss is the passive AC fixture (1.0000394308909735e-6). The comparison command prints per-parameter metrics and exits non-zero on any missing vector, point-count mismatch, or engine failure.

The project-authored `multi-source-ac` and `zero-first-multi-source-ac` regressions are also supplied byte-for-byte to both engines. For both, ngspice-47 succeeds at 1 Hz and 10 Hz, reporting `v(v2_acmag) = 0.9999999999177334` at both points. It reports `v(v1_acmag) = 0` for the two-active-source fixture and numerical zero (`-1.058791184067875e-16`) for the zero-first fixture. spice-ts rejects the two-active-source circuit with `.sens AC supports at most one non-zero AC excitation; found V1, V2`, preserving its existing typed rejection. It rejects the zero-first ordering with `.sens AC supports only one AC-form voltage source; found V1, V2`, rather than silently selecting the first, zero-magnitude source. The comparison command verifies both reference vectors and both exact `InvalidCircuitError` messages.

Deterministic spice-ts order:

- DC passive: `R1`, `R2`, `V1`.
- AC passive: `C1`, `L1`, `R1`, `R2`, `V1`.
- AC active: `E1`, `R1`, `R2`, `R3`, `V1`.

Explicitly unsupported forms:

- differential voltage and branch-current outputs;
- AC LIN and OCT sweeps, and transient sensitivity;
- `.step` combined with `.sens`;
- multiple `.sens` directives;
- multiple AC-form voltage sources;
- nonlinear and unrecognized devices outside the bounded RLC/source/linear-controlled-source slice;
- ngspice-WASM sensitivity result mapping.
