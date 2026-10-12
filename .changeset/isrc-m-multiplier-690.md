---
"@spice-ts/core": patch
---

Apply the `m` multiplier of independent current sources like ngspice-47 (isrcload.c/isrcacld.c): `I1 a b DC 1m m=2` now drives 2 mA in DC, `.dc` sweeps, transient waveforms and the AC magnitude, also inside subcircuits, with `@I1[m]` readout and `alter I1 m=...`. DISTOF terms stay unscaled, as in ngspice. `m` on a voltage source is now a ParseError ("Unsupported voltage source parameter 'm'"), matching ngspice-47's "unknown parameter (m)", instead of being silently ignored (#690).
