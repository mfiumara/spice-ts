---
"@spice-ts/core": patch
---

Evaluate bare parameter names and expressions as X-card parameter values like ngspice-47 numparam (#788): `X1 a b res R=R1` (and `R = RB*2`, also on `+` continuation lines) reads as `R={R1}` against the visible `.param` and subcircuit parameters instead of failing with `Cannot parse number: 'R1'`.
