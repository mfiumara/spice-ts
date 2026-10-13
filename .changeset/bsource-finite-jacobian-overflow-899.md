---
"@spice-ts/core": patch
---

Allow a finite-Jacobian B-source solve overflow when the expression itself evaluates to signed infinity at finite control values, matching ngspice-47 operating-point output for `V(in)*1e307`. Preserve singular-matrix and uncertified finite-overflow guards. On this certified nonfinite path only, retain the converging linearisation point rather than the subsequent `inf - inf` NaN solve. Fixes #899.
