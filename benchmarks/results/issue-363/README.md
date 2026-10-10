# Issue #363 nonlinear diode distortion receipt

This receipt covers the bounded diode `.disto DEC` slice implemented for issue #363. It uses the unchanged Berkeley SPICE3f5 `diodisto.cir` fixture and does not claim broader nonlinear-device distortion support.

## Reproduce

```sh
pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-363/verify.ts --output benchmarks/results/issue-363/report.json
pnpm exec tsx --test benchmarks/results/issue-363/acceptance.test.ts
```

The verifier reads the fixture once, checks its SHA-256, supplies the same 292 bytes to spice-ts and ngspice-47, and compares every exported complex voltage and branch-current vector. The receipt records the complete 101-point swept-F1 grid for all three two-tone products. It rejects any signal whose maximum complex-vector relative error exceeds the shared 0.005 bound.

## Source and licence

- Fixture: `benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir`
- SHA-256: `912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8`
- Bytes: 292
- Source: Berkeley SPICE3f5 `examples/diodisto.cir`, mirrored at revision `3d9360bef370b432e473edb0c4333707d545a55f`
- Licence: Berkeley SPICE grant. The required notice is retained at `benchmarks/corpus/classic/COPYRIGHT.txt`.
- Provenance: `benchmarks/SOURCES.md`, Berkeley SPICE3f5 classic corpus B, `diode-distortion`
- Adaptation: none
- Per-circuit tolerance tuning: none

## Supported contract

The slice supports single-tone second and third harmonics and the fixture's two-tone `f1+f2`, `f1-f2`, and `2f1-f2` products on DEC grids. The fixed second tone is `f2overf1 * startFreq`; it is not moved with swept F1.

Supported devices are ideal R, L, C, independent voltage/current sources, and bounded two-terminal diodes. Supported diode model inputs are `IS`, `TT`, and `CJO`; `CJ0` is the programmatic alias. The other coefficient inputs remain fixed at the ngspice defaults used by the fixture: `N=1`, `VJ=1`, `M=0.5`, `FC=0.5`, and 27 C.

The solver uses the DC-linearized `G+jωC` system and analytic diode current/charge Taylor coefficients. Ideal-linear distortion keeps the exact-zero fast path.

## Explicitly unsupported

- LIN and OCT distortion sweeps
- stepped or multiple distortion analyses
- multiple active sources per tone
- diode instance geometry, series resistance, temperature overrides, breakdown, sidewall, or explicit model fields beyond `IS`, `TT`, `CJO`, and `CJ0`
- BJT, JFET, MOSFET, controlled, coupled, transmission-line, and custom-device distortion
- protocol-v1, streaming, and ngspice-WASM distortion transport
- normalized harmonic ratios, fundamental output, and coincident-product summation

Batch simulation succeeds. `simulateStream()` still returns the typed explicit error `simulateStream() does not support '.disto' analysis`; it does not silently emit an empty stream.

## Measured result

Measured on Apple M5 Pro with Node v22.23.1, spice-ts 0.3.0, and ngspice-47. The committed run measured 10.246 ms in-process for spice-ts and 189.765 ms for a fresh ngspice subprocess. Other benchmark workers were running on the same machine at the time, and an earlier run measured 17.311 ms and 38.03 ms. The process boundaries differ, so this is not a speed claim.

Each product has 101 matched points and five matched signals in native order: `V(2)`, `V(1)`, `V(3)`, `I(vcc2)`, and `I(vcc)`. Frequency residuals are retained rather than rounded away.

| Product | Signal | max absolute error | RMS absolute error | max relative error | RMS relative error |
|---|---|---:|---:|---:|---:|
| `f1+f2` | `V(2)` | 1.7715e-11 | 1.7711e-11 | 2.5879e-4 | 2.5878e-4 |
| `f1+f2` | `I(vcc2)`, `I(vcc)` | 1.7715e-14 | 1.7711e-14 | 2.5879e-4 | 2.5878e-4 |
| `f1-f2` | `V(2)` | 1.7715e-11 | 1.7711e-11 | 2.5879e-4 | 2.5878e-4 |
| `f1-f2` | `I(vcc2)`, `I(vcc)` | 1.7715e-14 | 1.7711e-14 | 2.5879e-4 | 2.5878e-4 |
| `2f1-f2` | `V(2)` | 3.0326e-14 | 3.0306e-14 | 3.8743e-4 | 3.8739e-4 |
| `2f1-f2` | `I(vcc2)`, `I(vcc)` | 3.0326e-17 | 3.0306e-17 | 3.8743e-4 | 3.8739e-4 |

`V(1)` and `V(3)` are zero-constrained source nodes. Their non-zero numerical residuals are also retained in `report.json`; the largest absolute error is 3.9739e-23.

Before this slice, spice-ts rejected the diode before analysis. After it, both engines converge on the same unchanged DEC input. No exact-value or speed superiority claim is made.

The retained ~2.6e-4 / ~3.9e-4 relative residual is consistent with the operating point. For an equivalent 5 V / 1k / `IS=1e-14` deck, ngspice-47 `.op` reports a diode voltage of 0.6928910 V, while bisection of the exact DC equation with ngspice's 27 C thermal voltage gives 0.6928876 V. The 3.4 uV offset is within ngspice's own convergence tolerance. It explains a relative change of about 1.3e-4 in the exponential conductance. This is an attribution, not a claim that spice-ts is more accurate.

## Single-tone harmonics

The fixture is two-tone. Single-tone `HD2`/`HD3` support is covered by `packages/core/src/analysis/distortion.test.ts` against ngspice-47 values from byte-identical decks, with the same shared 0.005 bound:

- 5 V, 1k, `IS=1e-14 TT=0.1n CJO=2p`, `.disto dec 2 1k 1e8`: 11 points, max relative error 2.588e-4 (`HD2`) and 3.874e-4 (`HD3`)
- 0.6 V, 100 ohm || 1 nF, `IS=1e-14 TT=1n CJO=5p`, `.disto dec 2 1k 1e8`: 11 points, max relative error 1.7e-9 (`HD2`) and 3.8e-9 (`HD3`)

Sabotage checks run before commit: removing the slice fails 8 focused tests. Halving the `HD3` output scale fails 2. Dropping the depletion-charge second-order term fails the reactive-load test.

## Related defects found, not fixed here

- #365: outside `.disto`, the standard `CJO` spelling is silently ignored by AC/transient diode stamping; only `CJ0` is honored. This slice reads both spellings. The global fix changes corpus-wide AC/transient results, so it is out of scope here.
- #365 also records that the global diode `VT = 0.02585` differs from ngspice's 27 C value of 0.0258646. This slice uses the ngspice constant only inside the bounded `.disto` operating point and coefficient path.
