---
"@spice-ts/core": minor
---

MOSFET `LEVEL=3` (ngspice-47 mos3, semi-empirical short-channel model) and `LEVEL=9` (ngspice mos9) are now simulated instead of rejected with `UNSUPPORTED_MODEL_LEVEL` (#715): moseq3 drain current with NFS weak inversion, VMAX velocity saturation, THETA/ETA/KAPPA, XJ short-channel and DELTA narrow-width effects, DELVTO, LD/XL/WD/XW size adjustments, the mos3load.c cubic reverse bulk-junction tail, RD/RS (or RSH × NRD/NRS) series resistances divided by M, Meyer gate and depletion charges, the mos3conv.c device convergence test and MOS3trunc. LEVEL=9 follows mos9 exactly: a 1 µm minimum effective length/width and no `argb != 0` guard. `.noise` rejects both levels (mos3noi.c is not ported).
