---
"@spice-ts/core": patch
---

`Circuit.toNetlist()` now writes every number as a literal that reads back to the same double under ngspice-47 INPevaluate, including the about 0.017% of arbitrary doubles that came back one ulp off (#806). When the 17-digit mantissa search misses, the writer tries every decimal exponent with the mantissa doubles next to `value / pow(10, E)` and builds a digit string that INPevaluate accumulates to exactly that mantissa. Some values below 1e-297 have no INPevaluate literal at all (for example odd multiples of 2^-1074 below 2^-1021); these are written as the nearest double that has one, one ulp away, instead of a `toString()` text that could be far off.
