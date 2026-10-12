# BSIM1 / BSIM2 (MOSFET LEVEL=4/5) vs ngspice-47 (issue #657)

Reproducible parity evidence for the classic Berkeley short-channel IGFET
models, ported from ngspice-47 `src/spicelib/devices/bsim1` and `bsim2`
(`packages/core/src/devices/bsim1.ts`, `bsim2.ts`, shared load in
`bsim12-load.ts`). Sources and licences: `benchmarks/SOURCES.md`, section
"BSIM1/BSIM2 MOSFETs, issue #657".

    pnpm exec tsx benchmarks/bsim12-657/compare.ts

The script needs `ngspice` on PATH (ngspice-47 was used). Each deck is run
through both engines on the same netlist text; ngspice additionally gets a
`.control` block that runs the deck and writes the compared vectors with
`wrdata`. It writes `report.json`.

## Decks

| Deck | Analysis | What it covers |
|---|---|---|
| `benchmarks/corpus/classic/fixtures/spice3f5/bsim1tst.cir` | `.dc` | Aggregate fixture classic/bsim1-device-sweep (SPICE3F5 test deck): five NMOS at VBS = 0..-4 V, VGS 0..5 V, VDS = 50 mV, RSH = 35 ohm series resistances, XPART = 1. |
| `benchmarks/corpus/classic/fixtures/spice3f5/bsim2tst.cir` | `.dc` | Aggregate fixture classic/bsim2-device-sweep, the same sweep with the SPICE3F5 BSIM2 card (AI0/BI0 output-resistance terms, VGHIGH/VGLOW subthreshold interpolation). |
| `fixtures/bsim1-output-inverse.cir` | `.dc` | BSIM1 output curves from VDS = -1.01 V to 5 V: inverse mode (drain and source interchanged), plus NRD/NRS = 3 series resistance on a second device. |
| `fixtures/bsim2-pmos-output.cir` | `.dc` | BSIM2 card declared PMOS, VDS 0 to -5 V, forward (+1 V) and reverse (-0.3 V) body bias. |
| `fixtures/bsim1-rload-tran.cir` | `.tran` | BSIM1 resistor-load inverter, 0.5 pF load: the charge model (B1mosCap, junction charges) under NIintegrate. |
| `fixtures/bsim2-inverter-tran.cir` | `.tran` | BSIM2 CMOS inverter (NMOS + the same card as PMOS), 0.5 pF load. |
| `fixtures/bsim1-cs-ac.cir`, `fixtures/bsim2-cs-ac.cir` | `.ac` | Common-source stage 1 kHz to 10 GHz: the b1acld.c / b2acld.c capacitance matrix. |

## Results (ngspice-47, from `report.json`)

DC, max |spice-ts - ngspice| over all sweep points:

| Deck | Points | Worst vector | Max abs error | / ngspice peak |
|---|---|---|---|---|
| bsim1tst.cir | 501 | i(vds) | 4.99e-13 A | 2.2e-9 |
| bsim2tst.cir | 501 | i(vds) | 4.98e-13 A | 1.5e-9 |
| bsim1-output-inverse.cir | 301 | i(v2) | 6.25e-7 A | 2.4e-4 |
| bsim2-pmos-output.cir | 250 | i(v2) | 5.00e-12 A | 1.4e-9 |

The two aggregate fixtures agree to the 9-10 significant digits `wrdata`
prints. Through the aggregate harness itself (`compareExecutions` on the
native ngspice raw data, 24 signals each) the worst absolute error is
4.12e-13 A (bsim1, i(v2)) and 6.2e-16 A (bsim2, i(vds)). Before this change
both fixtures were `unsupported` (typed UnsupportedModelLevelError, #530);
before #552 they ran Level-1 equations with worst errors of 1.31e-4 A and
2.40e-4 A.

Residual (published, not tuned away): bsim1-output-inverse differs by up to
2.4e-4 of peak at a few inverse-mode points (VDS = -0.99 V and -0.81 to
-0.61 V). There ngspice stops Newton at its RELTOL = 1e-3 criterion: rerun
with `.options reltol=1e-7 abstol=1e-15 vntol=1e-9`, ngspice moves onto the
spice-ts value (the -0.99 V difference of 7.17e-8 A and 6.26e-7 A is exactly
the shift of ngspice itself between the two tolerances).

Transient, spice-ts interpolated onto every ngspice timepoint:

| Deck | Points (ngspice / spice-ts) | v(out) max abs | i(vdd) max abs |
|---|---|---|---|
| bsim1-rload-tran.cir | 1032 / 1334 | 2.19e-3 V (4.3e-4 of peak) | 2.19e-7 A (4.6e-4 of peak) |
| bsim2-inverter-tran.cir | 1036 / 1152 | 2.50e-2 V (4.4e-3 of peak) | 1.62e-3 A (0.19 of peak) |

Loss: the BSIM2 inverter differs by 25 mV on v(out) at 4.85 ns, on the
falling edge, and its supply current by up to 1.6 mA. Both engines pick
different steps there. With `.options reltol=1e-6 abstol=1e-15 vntol=1e-9
chgtol=1e-18` and a 10 ps TMAX in both engines, v(out) agrees to 3.4e-5 V,
so the device equations and charges match; the remaining i(vdd) difference
is trapezoidal ringing, which ngspice shows too (its own i(vdd) alternates
between about +1.1 mA and -5.4 mA on consecutive steps near 4.89 ns).

AC: v(out) magnitude within 2.9e-9 (BSIM1) and 5.7e-7 (BSIM2) relative,
phase within 1.6e-5 degrees, at all 71 frequencies.

## Behaviour carried over from ngspice-47

- No circuit-temperature law: BSIM1 junctions use CONSTvt0 (27 C) and BSIM2's
  thermal voltage comes from the model card's TEMP. `.temp`/`.options TEMP`
  change nothing, as in ngspice.
- The B1/B2 convergence test (`b1cvtest.c`) evaluates the predicted currents
  at the iterate the last load used, so it only fails after limiting. BSIM1's
  subthreshold current is discontinuous at VDS = 0 (it saturates at Ilimit
  for any VDS > 0), so a CMOS inverter at rest ends Newton in a 2-cycle around
  the supply. ngspice accepts that within RELTOL, giving v(out) = 5.000874 V
  for a 5 V supply; spice-ts does the same. For the same reason ngspice aborts
  a BSIM1 CMOS inverter transient with "timestep too small" at 0.45 ns, so no
  BSIM1 CMOS transient is compared here.
- The load uses the drawn W (and effective L) for the overlap charges, while
  the AC load uses the temp-routine overlaps (effective W; BSIM1 drawn L for
  CGBO).

## Not ported (typed errors)

- `.noise` with a BSIM1/BSIM2 instance (b1noi.c/b2noi.c): rejected with
  InvalidCircuitError instead of treating the channel as noiseless. KF/AF are
  accepted on the card because they only enter `.noise`.
- Any model or instance parameter outside the ngspice-47 b1.c/b2.c tables:
  UnsupportedModelParameterError (`UNSUPPORTED_MODEL_PARAMETER`).
- A BSIM1 card without TOX (b1set.c defaults it to 0, an infinite Cox):
  InvalidCircuitError.
- AC in inverse mode: ngspice's AC load reads drain-row charge capacitances
  that its inverse-mode load never sets (stale values); spice-ts uses zero.
- `.disto` rejects BSIM1/BSIM2 instances (b1disto.c is not ported), as it does
  every MOSFET. `.sens` and `.pz` with these models are not compared here.
