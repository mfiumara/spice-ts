---
"@spice-ts/core": patch
---

A `.model` card with `LEVEL` above 99 or below 0 on an `NMOS`/`PMOS`/`NSOI`/`PSOI`, `NPN`/`PNP`, `NJF`/`PJF`, `NMF`/`PMF`/`NHFET`/`PHFET` or `R` model now selects level 1 with a parse warning, as ngspice-47 INPfindLev (inpfindl.c) does, instead of failing with `UNSUPPORTED_MODEL_LEVEL` (#747). The level is rounded like ngspice (`(int)(level + 0.5)`) and `LEVEL=0` selects level 1. This is what ngspice-47 simulates for Xyce's `LEVEL=260` (EKV 2.6), `LEVEL=102/103` (PSP) and `LEVEL=504` (MEXTRAM) cards: it has no such models, so those decks run level 1 in both engines. In-range levels that spice-ts does not implement (for example MOSFET `LEVEL=7`, `10` or `99`) still raise `UnsupportedModelLevelError`.
