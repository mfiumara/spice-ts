---
"@spice-ts/core": minor
---

`.control` scripts can now run the `sp` and `sens` analysis commands (#750), with the same arguments as the `.sp` and `.sens` dot cards. Each run creates an ngspice plot, `sp<n>` or `sens<n>`. In `sp<n>`, the S/Y/Z (and noise) vectors are readable as `s_1_1`, `y_2_1`, ... (case-insensitive) over a `frequency` scale (#751). This also covers a deck `.sp` card run with `run`. `sens<n>` names its vectors like ngspice-47: `r1` (and `r1_ac` in AC), `c1`, `l1`, `v1`/`i1`, `v1_acmag`, `e1_gain`. `result.sParameters` now holds the latest S-parameter run of a control script, like every other analysis field (#751).

`.sens` accepts `ac lin` and `ac oct` sweeps and the explicit `.sens v(node) dc` form. The sweeps follow ngspice-47 cktsens.c, including its LIN stepping, which multiplies by `(stop - start) / N`. DC sensitivity now also accepts a current source given as `dc=... ac=...`. The ngspice regression decks sens-ac-1, sens-ac-2 and sens-dc-2 pass against their golden values. sens-dc-1 still stops at `i1_m`, because multiplier and scale sensitivities are not produced yet (#760).
