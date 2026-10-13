---
"@spice-ts/core": patch
---

A `.param` card whose first token holds `(` now defines a function, like ngspice-47 (inpcom.c turns `.param f(a, b) = 'expr'` into `.func f(a, b) 'expr'`), at the top level and inside a `.subckt`. Formal arguments shadow a global or subcircuit parameter of the same name, also when ngspice-47 gets it wrong (ngspice bug #871: a `temper`-dependent or random global captures the argument). `limit(x, lo, hi)` is now a built-in clamp with the bounds in either order (ngspice-47's PSpice-compatibility `.func limit`); the random two-argument `limit(nominal, variation)` is reported instead of drawing a value. An undelimited single-assignment `.param` expression inside a `.subckt` (`.param w=limit(wiper, 0, 1)`) is read whole, as at the top level, instead of failing with `Cannot parse number` (#870).
