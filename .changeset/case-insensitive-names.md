---
'@spice-ts/core': patch
---

Fold node and element names case-insensitively, as ngspice does: `F` and `f` are now one node (also inside `.subckt` expansion and B-source `v()` references), K cards couple `l1`/`L2`, and F/H/W/`i()` control-source lookups ignore case. Result lookups (`voltage()`, `current()`) also match case-insensitively; each node keeps the first spelling in the netlist as its display name (#728, #754).
