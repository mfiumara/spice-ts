---
"@spice-ts/core": patch
---

`.sens` and the control-language `sens` command now report the instance multiplier and scale sensitivities that ngspice-47 lists: `<dev>_m` and `<dev>_scale` for every resistor, capacitor and inductor, and `<dev>_m` for every current source (`SensitivityEntry.parameter` `'multiplier'` / `'scale'`). They also appear in the `sens<n>` plot, so `tests/regression/sens/sens-dc-1.cir` now passes (5 of 5 vectors). C and L sensitivities are exactly zero in DC, as in ngspice. For a capacitor with `m*scale != 1` or an inductor with `scale != 1`, spice-ts reports the exact derivative. ngspice-47 prints these vectors too large by that factor, because cktsens.c applies SCALE (and m, for C) twice (#760).
