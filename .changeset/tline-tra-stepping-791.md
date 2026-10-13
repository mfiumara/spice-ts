---
"@spice-ts/core": patch
---

The lossless `T` transmission line now steps and interpolates like ngspice-47 `tra/`. The delayed waves use traload.c's three-point (quadratic) interpolation of the history. TRAaccept slope-change breakpoints and TRAtrunc bound the timestep. The line no longer adds a breakpoint at TD and no longer puts its port nodes under node-voltage truncation, which ngspice-47 does not have. spice-ts now writes ngspice's timepoints on T-line decks. The corpus-h `transmission-line-termination.cir` and `tlines.spice` decks go from 0.0625 and 0.0453 to matched (below 1e-12) (#791).
