---
'@spice-ts/core': patch
---

Accept parenthesised subcircuit port lists like ngspice-47 (`inpcom.c` `inp_fix_macro_param_func_paren_io`): `.subckt name (a b c)` and `x1 (n1 n2 n3) name` now drop the `(`/`)` around the ports. Previously `(a` and `c)` became port names, so those ports were left as floating internal nodes (#864, VACASK bjtring ring oscillator never started).
