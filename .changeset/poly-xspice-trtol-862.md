---
"@spice-ts/core": patch
---

SPICE2 `POLY(n)` E/F/G/H sources now lower the transient `trtol` to 1 (or `.options xtrtol=<n>`) like ngspice-47, which runs them as XSPICE 'A' devices (cktdojob.c). Only POLY sources in the instantiated circuit count; translated B-sources serialize with the `spice2poly=1` marker (#862).
