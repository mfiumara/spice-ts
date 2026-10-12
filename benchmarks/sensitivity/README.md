# Bounded sensitivity parity receipt

Run:

    pnpm exec tsx benchmarks/sensitivity/compare.ts

Pinned receipt environment: ngspice-47; darwin arm64; Node v22.23.1. The comparison supplies each committed netlist byte-for-byte to both engines. Sources, revisions, licences, and adaptations are recorded in `benchmarks/SOURCES.md`.

The current-source slice reuses the already tracked Berkeley SPICE3f5 `simplepz.cir` source ([pinned revision `3d9360bef370b432e473edb0c4333707d545a55f`](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/simplepz.cir)) under the Berkeley SPICE grant retained at `benchmarks/corpus/classic/COPYRIGHT.txt`. `passive-current-rc-ac.cir` keeps its passive output branch, replaces the voltage excitation with one 1 mA AC current excitation, and uses the bounded DEC AC sensitivity directive. Its frozen SHA-256 is `e586a6ccd28680f5e8e60fb094756cc7fa939978cabea17f5bb921ab5f658ec6`.

The reported derivative is absolute change in output per unit change in a device parameter: a primary device value, or the instance multiplier `m` (ngspice `<dev>_m`, R/C/L/I) or `scale` (ngspice `<dev>_scale`, R/C/L) added by #760. Relative error uses `max(abs(ngspice), 1e-12)` as its denominator. Results are reordered by the typed spice-ts device order before matched-point comparison; the JSON command output also publishes ngspice's native primary-vector order.

| Fixture | Samples | Max absolute | RMS absolute | Max relative | RMS relative |
|---|---:|---:|---:|---:|---:|
| `passive-rlc-dc` | 11 | 2.2226495333121932e-07 | 9.477294293097337e-08 | 1.0001932903445673e-06 | 6.030663419416581e-07 |
| `passive-rlc-ac` | 65 | 4.433092815464653e-05 | 7.343006426919775e-06 | 1.1630695329220453e-06 | 6.352770789177703e-07 |
| `passive-current-rc-ac` | 40 | 9.629199700750626e-05 | 2.2804844608011138e-05 | 1.0002654688091747e-06 | 5.000439618045386e-07 |
| `active-vcvs-ac` | 55 | 1.0002339234649327e-06 | 4.264824611714254e-07 | 1.0002349238606532e-06 | 6.03068853491864e-07 |

All four ngspice and spice-ts comparison runs converged. The non-zero residuals above are retained losses, not rounded away. They are ngspice-47's one-sided finite difference (cktsens.c, relative step 1e-6) against spice-ts's symmetric difference, so they sit at about 1e-6 relative. The largest absolute loss is the current-excited passive capacitor derivative (9.629199700750626e-05); the largest relative loss is the inductor multiplier `l1_m` of the voltage-excited passive AC fixture (1.1630695329220453e-06). The `scale` vectors carry the largest absolute losses of the DC and active fixtures because they are the resistor derivative times its resistance. C and L `m`/`scale` derivatives are exactly zero in both engines in DC. The comparison command prints per-parameter metrics and exits non-zero on any missing vector, point-count mismatch, non-finite metric, or engine failure.

Known ngspice-47 divergence (not in these fixtures, which use the default `m=1 scale=1`): for a capacitor with `m*scale != 1` or an inductor with `scale != 1`, ngspice-47 prints `<dev>`, `<dev>_m` and `<dev>_scale` off by the factor `m*scale` (C) or `scale` (L). cktsens.c reads the primary value with CAPask/INDask, which return the effective value (CAPcapac times CAPm; INDinduct, both already times SCALE), and writes it back with CAPparam/INDparam as the instance value, so CAPtemp/INDtemp apply SCALE (and m for C) a second time. spice-ts reports the exact derivative; `packages/core/src/analysis/sensitivity-multiplier-760.test.ts` pins both values.

One wall-clock observation from the pinned environment (not a speed claim) was: `passive-rlc-dc` 31.383 ms ngspice / 15.928 ms spice-ts; `passive-rlc-ac` 22.907 / 3.774 ms; `passive-current-rc-ac` 19.436 / 0.706 ms; `active-vcvs-ac` 15.484 / 2.406 ms; `multi-source-ac` 21.449 / 0.588 ms; and `zero-first-multi-source-ac` 15.981 / 0.208 ms. The command emits unrounded per-run timings in `runtimeMs`; process startup is included for ngspice and these single observations are not statistically comparable.

The project-authored `multi-source-ac` and `zero-first-multi-source-ac` regressions are also supplied byte-for-byte to both engines. For both, ngspice-47 succeeds at 1 Hz and 10 Hz, reporting `v(v2_acmag) = 0.9999999999177334` at both points. It reports `v(v1_acmag) = 0` for the two-active-source fixture and numerical zero (`-1.058791184067875e-16`) for the zero-first fixture. spice-ts rejects the two-active-source circuit with `.sens AC supports at most one non-zero AC excitation; found V1, V2`, preserving its existing typed rejection. It rejects the zero-first ordering with `.sens AC supports only one AC-form voltage source; found V1, V2`, rather than silently selecting the first, zero-magnitude source. The comparison command verifies both reference vectors and both exact `InvalidCircuitError` messages.

Deterministic spice-ts order (device name, then primary value, `m`, `scale`):

- DC passive: `C1` (m, scale), `L1` (m, scale), `R1`, `R2` (value, m, scale), `V1`.
- AC passive: `C1`, `L1`, `R1`, `R2` (value, m, scale), `V1`.
- AC passive, current-excited: `C1` (value, m, scale), `I1` (acmag, m), `R1` (value, m, scale).
- AC active: `E1`, `R1`, `R2`, `R3` (value, m, scale), `V1`.

Explicitly unsupported forms:

- differential voltage and branch-current outputs;
- AC LIN and OCT sweeps, and transient sensitivity;
- `.step` combined with `.sens`;
- multiple `.sens` directives;
- multiple AC-form independent voltage/current sources, including zero-plus-active ambiguity;
- nonlinear and unrecognized devices outside the bounded RLC/source/linear-controlled-source slice;
- ngspice-WASM sensitivity result mapping.
