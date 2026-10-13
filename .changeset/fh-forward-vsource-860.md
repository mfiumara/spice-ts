---
"@spice-ts/core": patch
---

A linear F (CCCS) or H (CCVS) card whose controlling voltage source appears later in the deck, at top level or inside a subcircuit (TI OPA690.LIB `F_F1 3 4 VF_F1 2.574605` before `VF_F1 1 2 0V`, the Boyle `hlim` before `vlim`), now binds that source after every device exists, like ngspice-47 CCCSsetup/CCVSsetup. It no longer fails with `references unknown or branchless source`. A controlling source that does not exist still fails, now as an `InvalidCircuitError` (#860).
