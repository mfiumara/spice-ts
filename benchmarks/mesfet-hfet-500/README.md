# MESFET/HFET Z-card levels vs ngspice-47 (issue #500)

Reproducible parity evidence for the NMF/NHFET Z-card levels added for
issue #500. Sources and licences: `benchmarks/SOURCES.md`, section
"MESFET/HFET Z-card levels, issue #500".

    pnpm exec tsx benchmarks/mesfet-hfet-500/compare.ts

The script needs `ngspice` on PATH (ngspice-47 was used). It runs every
fixture through both engines on the same netlist text and writes
`report.json`.

## What changed in spice-ts

Ported from ngspice-47 `src/spicelib/devices/{mes,mesa,hfet1}`:

- Z-card family selection by LEVEL as `INPdomodel` does: LEVEL 0/1 (also the
  default when LEVEL is absent) is MES, 2-4 MESA, 5 HFET1, 6 HFET2. Before,
  spice-ts treated an `nmf` card without LEVEL as MESA level 2.
- MES (`nmf` level 1, Statz model, `mesload.c`/`qggnew()`): DC, AC and
  transient gate charge; instance `AREA` (scales BETA, IS, CGS, CGD and the
  RD/RS conductances).
- MESA level 3 (`mesa2()`, delta-doped channel: BETA, DU, NDU, TH, NDELTA).
- MESA level 2/3: gate resistance RG, RI/RF (source''/drain'' charge nodes),
  instance TS/TD/DTEMP with the `mesatemp.c` mapping (PHIB1, XCHI, TVTO,
  TLAMBDA, TETA0/1, TMU, XTM0-2, MU1/MU2, RTC1/RTC2), and `.ac` with the
  `MESAacLoad` small-signal model, including the DELFO/FLO/TF/LAMBDAHF output
  conductance dispersion and ngspice's AC gm without the ALPHA term.
- HFET1 (`nhfet` level 5): intrinsic RDI/RSI.

Still rejected with a typed error (no fixture needs them): MESA LEVEL=4
(`mesa3()`), sidegating KS/VSG, the instance multiplier M, OFF/IC, PMF/PHFET
cards, HFET2 (LEVEL=6), `.noise`/`.tf`/`.pz` with NMF devices, and `.options
TEMP` other than 27 C with any Z-card.

## Results (ngspice-47, from `report.json`)

Metric: max |spice-ts - ngspice| over the ngspice points, divided by the
ngspice peak |value| of that vector (AC: complex difference). DC and AC use
identical grids; transient interpolates spice-ts onto the ngspice timepoints.

| Fixture | Analysis | Vector: error / peak (peak, ngspice/spice-ts points) |
|---|---|---|
| `hfet-id_vgs.cir` | dc | i(vds) 3.61e-08 (peak 0.0002108, 101/101 pts) |
| `mes-subth.cir` | dc | i(vids) 3.59e-08 (peak 0.0004575, 61/61 pts) |
| `mesa-mesa13.cir` | dc | i(vig) 3.62e-04 (peak 0.0007325, 69/69 pts) |
| `mesa-mesa15.cir` | dc | i(vids) 1.36e-04 (peak 0.004125, 61/61 pts) |
| `mesa-mesa21.cir` | dc | i(vids) 1.28e-16 (peak 0.2703, 405/405 pts) |
| `mesa-mesgout.cir` | ac | v(3) 1.85e-06 (peak 0.001797, 91/91 pts) |
| `mesa-mesinv.cir` | dc | v(70) 1.49e-05 (peak 0.5924, 101/101 pts) |
| `authored-hfet-rsi.cir` | dc | i(vds) 1.07e-08 (peak 0.0008649, 204/204 pts) |
| `authored-mes-inverse.cir` | dc | i(vds) 9.15e-06 (peak 0.4788, 1608/1608 pts), i(vgs) 9.54e-06 (peak 0.4719, 1608/1608 pts) |
| `authored-mes-ac.cir` | ac | v(d) 1.11e-10 (peak 1.171, 51/51 pts), v(gi) 5.85e-12 (peak 1, 51/51 pts) |
| `authored-mes-tran.cir` | tran | v(d) 1.28e-03 (peak 3.514, 638/877 pts), v(gi) 1.79e-03 (peak 2, 638/877 pts) |
| `authored-mesa-alpha-ac.cir` | ac | v(d) 7.24e-15 (peak 3.068, 81/81 pts) |
| `authored-mesa-rirf-tran.cir` | tran | v(d) 4.65e-04 (peak 1.601, 1238/1392 pts), i(vin) 2.86e-03 (peak 0.001767, 1238/1392 pts) |
| `authored-mesa3-ac.cir` | ac | v(d) 5.75e-14 (peak 3.509, 81/81 pts) |
| `authored-mesa3-tran.cir` | tran | v(d) 2.00e-02 (peak 2.01, 1032/1301 pts), **i(vin) 1.38e-01** (peak 0.001074, 1032/1301 pts) |

corpus-f outcome of the seven issue #500 decks
(`pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child <id>`,
1% threshold): before this change all seven were `spice-ts-loss`
(typed unsupported); after it all seven are `matched` (worst 4.8e-4,
`mesa-mesinv.cir` v(50)). The other corpus-f MESA decks keep their outcome
(`mesa.cir` matched 1.25e-4, `mesa11.cir` matched 1.8e-15, `mesa14.cir`
matched 5.64e-5).

## Residuals and losses

- DC residuals up to 3.6e-4 of peak (`mesa13`, forward-biased gate at
  vgs = 0.4 V; `mesa15`, 400 C gate leakage) are relative errors of about
  2e-4 to 4e-4 at single points. Both engines stop Newton at RELTOL = 1e-3,
  and spice-ts does not apply ngspice's DEVpnjlim/DEVfetlim to the Z-card
  junctions, so the converged iterates are not bit-identical.
- **Loss: `authored-mesa3-tran.cir` at default step control** (2.0% of peak
  on v(d) at the 7.75 ns output edge, 13.8% on the gate-current spike
  i(vin)). It is time-step placement, not the device model: with
  `.tran 0.01n 10n 0 0.5p` both engines agree to 8.5e-5 (v(d)) and 1.5%
  (i(vin), 0.32% at 0.1 ps), and against that fine-step ngspice reference the
  default-step spice-ts run is off by 0.45% (v(d)) / 10.7% (i(vin)) while
  default-step ngspice is off by 2.5% / 14.5%. The same comparison for
  `authored-mes-tran.cir` gives spice-ts 0.044% / ngspice 0.16% on v(d), and
  for `authored-mesa-rirf-tran.cir` 0.029% / 0.048%. Recorded on
  https://github.com/mfiumara/spice-ts/issues/592 (transient default-step
  grid sensitivity); no superiority is claimed from these single fine-step
  references.
