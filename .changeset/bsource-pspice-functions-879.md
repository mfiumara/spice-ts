---
"@spice-ts/core": patch
---

B-source expressions accept the PSpice functions `IF(c, a, b)`, `LIMIT(x, a, b)`, `PWRS(x, a)`, `STP(x)` and `INT(x)` that ngspice-47 defines in PSpice compatibility mode (frontend/inpcompat.c `.func` set), as used by vendor op-amp libraries (`bE1 ... IF(...)` in AD620, `bG1 ... LIMIT(...)` in OPA818). Each expands into the same `ternary_fcn`/`min`/`max`/`sgn`/`pow`/`u`/`floor` tree as in ngspice-47, so values and Newton derivatives match `ngbehavior=psa`; `LIMIT` takes its bounds in either order. `pwr` keeps the native ngspice meaning (#879).
