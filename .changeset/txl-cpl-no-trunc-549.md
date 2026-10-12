---
"@spice-ts/core": patch
---

TXL (Y) and CPL (P) lines no longer put their port nodes under the node-voltage LTE. ngspice-47 TXL/CPL have no DEVtrunc and only lower CKTmaxStep, so spice-ts now does the same. Resistively terminated lines take ngspice's grid (cpl_ibm2 216 vs ngspice's 217 points, was 1168), `cpl3_4_line` runs instead of stopping with `TimestepTooSmallError`, cpl_ibm1 goes from 32.1% to 15.1% of swing, and `cpl4_txl_2_line` from 11137 to 1908 points (#549).
