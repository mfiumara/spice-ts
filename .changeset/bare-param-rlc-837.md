---
"@spice-ts/core": patch
---

A bare `.param` or subcircuit parameter name as the value of an R, C or L card (`R1 in o rv`, `C1 o 0 cval`, `L1 o 0 lval`, also inside a `.subckt` with an X-line override) is now substituted like ngspice-47, which wraps such names in braces before numparam runs (inpcom.c `inp_quote_params`). It no longer fails with `references unknown model`. As in ngspice, the parameter wins over a `.model` of the same name. An unlabeled number after a resistor value (`R1 a b 3k 2k`) is now the resistance, as in ngspice-47 inp2r.c, instead of a parse error (#837).
