# Issue 446: bounded VBIC small-signal `.ac`/`.pz` receipt

Fixture: `benchmarks/corpus/ngspice/fixtures/tests/vbic/CEamp.cir` (`ngspice/vbic-common-emitter-ac`), SHA-256 `088d1ebede86588ff8b823ba45219006bfeec34939af69e10c176e23d8a020ab`. The fixture is unchanged and both engines got the same bytes. No tolerance changed and nothing is tuned per circuit.

Tools: ngspice-47 (Homebrew), Node v22.23.1, Apple M5 Pro, macOS 27.0.1 arm64. Base commit: `9b212389602a3909911fd43242a510a693e43860`.

Method: every one of the 100 aggregate fixtures was run on base and on head through the same adapters as `benchmarks/aggregate-report.ts` (`runNativeNgspice`, `runBoundedSpiceTs`, chunked `alignAndMeasure`). The committed aggregate artifacts were not regenerated here; the aggregate refresh lane owns them. Per-fixture data is in `fixture-metrics.json`.

## Status

- `ngspice/vbic-common-emitter-ac`: spice-ts goes from unsupported (`Unsupported bounded VBIC analysis: 'ac'`) to success.
- spice-ts totals over 100 fixtures: 61/1/38 → 62/1/37 (success/failed/unsupported).
- Only two fixtures produce any change. The other is `ngspice/vbic-fo`. TD > 0 now adds ngspice's excess-phase nodes there too, and its DC error metrics move only in the last digits (for example `i(vc)` max abs `6.71477496222081e-06` → `6.714774962206932e-06`).

## `.ac` vs ngspice-47 (501 points, absolute error)

| signal | max | RMS |
|---|---:|---:|
| i(vmeas) | 4.63052e-06 | 3.59646e-06 |
| i(vcc) | 7.36353e-08 | 1.55435e-08 |
| v(1) | 1.83913e-04 | 1.43213e-04 |
| v(2) | 7.36482e-05 | 1.55303e-05 |
| v(3) | 1.13847e-09 | 2.41475e-10 |
| v(4) | 7.36482e-05 | 1.55303e-05 |

|i(vmeas)| is about 43 A/A, so the error is about 1e-7 relative. At 100 kHz / 10 GHz spice-ts gives 32.679301 / -4.322201 dB, and ngspice prints 32.67930 / -4.32220 dB.

## `.pz`: published loss, tracked in #451

| signal | max abs error |
|---|---:|
| pole(1) | 1.14387e+12 |
| pole(2) | 5.41165e+11 |
| pole(3) | 8.65241e+10 |
| zero(1) | 1.25117e+12 |

spice-ts returns 3 poles and 1 zero. ngspice returns 7 poles and 6 zeros. The cause is the general trace/Laguerre root-finder in `analysis/pole-zero.ts`, which cannot handle this 8-decade spread. The VBIC linearization is not the problem. To check that, I exported the head G/C matrices at the operating point and solved them independently with numpy: `eig(G⁻¹C)` gives exactly ngspice's 7 finite poles (-1.861979e4, -1.054838e9, -5.920059e10, -7.246192e10 ± 4.728303e10j, -5.422208e11, -1.169140e12), and the bordered pencil gives all 6 of ngspice's zeros, including the real zero at -6.475462e10. `ngspice -b CEamp.cir` prints zero(1)…zero(6) as -1.32050e12, -2.99053e11, -8.81718e10 ± 1.565009e11j, -6.47546e10, 9.447173e10.

## Solver bug found on the way

`ComplexSparseSolver` skipped the update for an explicitly stamped (structural) zero that fills in during elimination. The real `GilbertPeierlsSolver` already handled this case. On the base, VBIC's full-pattern Jacobian therefore gave an AC gain of 43.1457 instead of 43.0693 (dense solve and ngspice agree on 43.069). The fix changes no other aggregate fixture.

## `bench:accuracy`

Identical on base and head for all 8 circuits (`npx tsx benchmarks/accuracy.ts` and `--ci`).
