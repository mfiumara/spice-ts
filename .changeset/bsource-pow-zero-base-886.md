---
"@spice-ts/core": patch
---

A B-source `pow(x, c)`, `x^c` or `x**c` with an exponent below 1 no longer fails with a singular matrix when `x` is 0 on a Newton iterate (every node starts at 0, so `pow(V(in), 0.5)` and PSpice `pwrs(V(in), 0.5)` failed for any input). The slope c*pwr(x, c-1) now moves a zero base to ngspice-47's PTfudge_factor (gmin*1e-20), the guard ngspice PTpwr applies in PSpice mode, so the Jacobian stays finite. A folded constant exponent such as `-0.5` or `(1/2)` now takes ngspice's literal-exponent derivative rule, as ngspice's parser folds it to one constant. Where default-mode ngspice-47 aborts (input held at exactly 0), spice-ts converges to the 0 that ngspice-47 PSpice mode returns (#886).
