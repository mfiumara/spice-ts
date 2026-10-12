---
"@spice-ts/core": patch
---

BJT fixes for ngspice-47 parity (#767):
- On an `NPN`/`PNP` card that selects the level-1/2 BJT, a name that ngspice-47 has in neither its BJT model table nor its BJT instance table (for example the MEXTRAM `DTA`, `VEF` or `TAUB` on a `LEVEL=504` card) is now ignored with ngspice's `unrecognized parameter (dta) - ignored` parse warning. It no longer fails with `Unsupported bounded BJT model parameter`. Names that ngspice-47 implements and spice-ts does not (for example `RCO`, `IBE`, or `AREA` on the model card) are still rejected.
- AC, noise and pole-zero no longer stamp the BJT substrate diode conductance, since ngspice-47 bjtacld.c/bjtpzld.c do not. The substrate terminal sees only the substrate capacitance there, while the operating point keeps the diode.
- `.noise` input-referred noise divides by max(|gain|², 1e-20), as ngspice-47 noisean.c (N_MINGAIN) does.
- `.noise` accepts BJT `TNOM`/`TREF` and the substrate parameters `ISS`, `NS`, `CJS`, `VJS`, `MJS` and `SUBS`.
