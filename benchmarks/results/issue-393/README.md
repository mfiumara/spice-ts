# Issue 393: MOS1 bulk-junction diode currents vs ngspice-47

The level-1 MOSFET class (`packages/core/src/devices/mosfet.ts`) now stamps the bulk-source and bulk-drain
junctions from ngspice `mos1load.c`:

- `v <= -3*vt`: `g = GMIN`, `i = GMIN*v - Isat`
- otherwise: `g = Isat*exp(v/vt)/vt + GMIN`, `i = Isat*(exp(v/vt) - 1) + GMIN*v`
- `Isat = IS` (default 1e-14), or `JS*AD` / `JS*AS` when JS, AD and AS are all non-zero.

The same stamp feeds DC/OP, the transient companion and AC linearisation (fast batch path included).
Limiting follows `mos1load.c`. DEVpnjlim runs on vbs (vds >= 0) or vbd against the previous stamp's
voltage, so converged points are exact. DEVfetlim runs on the gate voltage. spice-ts applies it as a
Newton-step scale, because without it the newly constrained mosmem/mosamp2 classics stop converging.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/results/issue-393/compare.ts --label after
    pnpm exec tsx benchmarks/results/issue-393/summarize.ts

`before.json` was measured at base `edb7c05` and `after.json` at `f6275cb`. The runtime code is identical in
later commits on this branch; they only add evidence files. Both runs use ngspice-47 and feed byte-identical
inputs to both engines. `SUMMARY.md` is the full before/after table: every changed signal, with max/RMS
absolute and relative errors. Fixture hashes are checked against the manifests and recorded in the JSONs.
No fixture, tolerance or per-circuit setting changed.

## Wins (issue fixtures, after → ngspice-47)

| fixture | signal | before abs / rel max | after abs max / rel max |
|---|---|---|---|
| cutoff-leakage (OP) | v(2) | 9.0e-9 V / 1.0 | 1.7e-24 V / 1.8e-16 |
| js-area (OP) | v(2) | 9.1e-9 V / 1.0 | 1.7e-24 V / 1.8e-16 |
| nmos-forward-bulk (DC) | v(bi) | 0.503 V / 1.0 | 1.6e-5 V / 2.3e-5 |
| nmos-forward-bulk (AC) | v(bi) | 0.788 / 3.71 | 5.5e-10 / 2.6e-9 |
| pmos-forward-bulk (DC) | v(bi) | 0.503 V / 1.0 | 1.5e-5 V / 2.3e-5 |
| bulk-transient | v(bi) | 0.096 V / 1.0 | 3.2e-5 V / 5.3e-5 |
| body-diode-high-current (DC, up to 3.3 A) | i(vd) | 3.35 A / 1.0 | 9.4e-5 A / 1.8e-4 |

On the corpus, the `corpus-e/mos1-inverter-sweep` OP goes from v(4) 4.58 V / 1.0 to 0.214 V / 0.047. In
`classic/mos-memory-cell`, v(8) goes from 9.91 V to 1.91 V abs max. On `classic/bsim1|2-device-sweep`, the
i(vbs*) relative max goes from 1.0 to about 0.5.

## Losses and residuals (published, not hidden)

1. `xyce/nmos-level1-dc` v(2)/i(vgg) rel max is still 1.0, and `xyce/pmos-level1-dc` v(3) rel max is still
   1.0. These come from ngspice's Newton tolerance, not from the model. At VGG=0 an ngspice-47 standalone `.op`
   returns v(2) = 5.0e-12 V (= RS*IS). The exact fixed point is about 0 V, and spice-ts returns -8e-28 V.
   The difference is far below VNTOL = 1 µV. At VGG=1, VDD=2 the ngspice sweep gives 6.93e-10 V, while
   ngspice's own `.op` of that point gives 5.05e-10 V = RS*(GMIN*VDS + IS), which is exactly what spice-ts
   returns. The rel RMS improves from 0.611 to 0.101. The abs max of 0.68 mV (saturation, RELTOL-level) is
   unchanged; see #384.
2. `corpus-e/mos1-inverter-sweep` DC/TRAN and `ngspice/mos6-simple-inverter-transient` get worse. Examples:
   TRAN i(vdd) abs max goes from 3.6 mA to 9.9 A (a single spike), and simple-inverter i(vin) goes from
   9.5e-6 to 3.0e-4 A. Root cause is #414: `.model` names are looked up case-sensitively, so `PMOS` vs
   `.model pmos` (and `p12l5` vs `P12L5`) silently become default NMOS devices. With bulk tied to VDD, the
   new junctions of those mis-typed devices forward-bias. Both fixtures were already wrong before this
   change for the same reason. ngspice resolves the PMOS models.
3. `classic/mos-memory-cell` i(vs) abs max goes from 3.67 mA to 11.3 mA, and i(vwb) from 0.52 mA to 1.04 mA
   (gate-drive current spikes at edges). v(3)/v(5) stay about 1.8 V off, because GAMMA/PHI body effect is not
   modelled (#3).
4. `issue-393/bulk-transient` i(vb) rel max is 0.32, at a near-zero current sample (abs 3.2e-7 A, rel RMS
   0.019).
5. Not modelled in this slice: M multiplier, temperature scaling of IS/JS (TEMP/TNOM), `.options` GMIN and
   DEFAD/DEFAS, DEVlimvds, and junction capacitances (CJ/CJSW/PB/MJ). spice-ts uses fixed GMIN = 1e-12 and
   vt at 27 C.

## Gates

`pnpm bench:accuracy` output is identical before and after at printed precision (8/8 circuits).
`pnpm exec tsx benchmarks/aggregate-report.ts --check` fails identically on base `edb7c05` and on this
branch. The failure is a provenance hash check: `SOURCES.md` is out of sync with the constant, tracked in
#406. The aggregate files were not regenerated.
