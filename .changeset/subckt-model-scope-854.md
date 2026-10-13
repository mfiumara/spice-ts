---
"@spice-ts/core": patch
---

A `.model` card inside a `.subckt` body is now local to that subcircuit, like ngspice-47 (`subckt.c` modtranslate): each instance gets its own copy, a local model shadows a top-level one of the same name, sibling subcircuits that define the same model name no longer collide (previously the last definition in the deck won for every instance), and lookup is lexical (own body, then the bodies the definition is nested in, then the top level). A top-level device, or a top-level subcircuit called from another one, can no longer use a subcircuit-local model; ngspice-47 rejects those too. ngspice bug #745 (vendor IGBT.LIB and DiodesInc_FET.lib, which both define local DSUB/DCGD/SW/PMOS models) now matches ngspice-47's i(V1) to 0.18% instead of 2.1% (#854).
