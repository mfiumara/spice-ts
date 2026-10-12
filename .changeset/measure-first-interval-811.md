---
'@spice-ts/core': patch
---

`.meas` WHEN (and FIND ... WHEN, TRIG/TARG) now measures a crossing that lies between the first two points of the plot, e.g. `.dc v1 0 1 0.05` with `when v(1)=0.05` returns the analytic value instead of `out of interval`. This deliberately diverges from ngspice-47, which counts but drops that crossing (ngspice ticket #574).
