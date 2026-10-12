---
"@spice-ts/core": patch
---

An L or C card that ends at its second node (`L1 1a 0`, `C1 1 0`, or a card with fewer nodes) is now dropped with a `parse` warning `'L1 1a 0' is not a valid inductor instance line, ignored!`, as ngspice-47 inp2l.c/inp2c.c do, instead of silently becoming a 0 H short or a 0 F capacitor. The same applies to such cards inside a `.subckt`. Cards with a value, `L=`/`C=`, a model name or any parameter (e.g. `C1 1 0 IC=1`) are kept, as in ngspice (#733).
