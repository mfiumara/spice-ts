---
"@spice-ts/core": patch
---

BJT `VAF`, `IKF`, `VAR` and `IKR` given as `0` now mean infinite (no Early effect / no high-injection roll-off), as in ngspice-47 bjttemp.c, instead of failing with `Invalid bounded BJT model parameter value` (#844). Vendor cards such as Fairchild's `PN2222.mod` (`Isc=0 Ikr=0`) now simulate and match ngspice-47. Negative values are still rejected.
