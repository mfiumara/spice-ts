---
"@spice-ts/core": patch
---

Support ngspice `.options rshunt=R` (#824): a noiseless resistor R from every node, device-internal nodes included, to ground in every analysis, as ngspice-47 loads it (cktsetup.c, cktload.c, acan.c). An RSHUNT of at most 1e-30 is ignored with a warning like ngspice; decks with T or O (LTRA) lines are rejected with RSHUNT because ngspice also shunts their internal rows.
