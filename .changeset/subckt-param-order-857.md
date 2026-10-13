---
"@spice-ts/core": patch
---

A `.param` card inside a `.subckt` is now evaluated before the body's elements, whatever its position, and in dependency order, like ngspice-47 inpcom.c `inp_reorder_params_subckt`/`inp_sort_params`. A `.param` below the element that uses it, or one that references a later `.param`, no longer fails with `Undefined variable`. A nested subcircuit definition now also sees the parameters of the enclosing instance it is defined in (its `.subckt` defaults, X-line overrides and body `.param`s), as in ngspice numparam (#857).
