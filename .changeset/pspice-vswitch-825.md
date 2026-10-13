---
'@spice-ts/core': patch
---

Accept the PSpice switch model type `.model <name> VSWITCH(...)` used by vendor libraries, translated as ngspice-47's PSpice compatibility mode does (inpcompat.c): a `VT`/`VH` model is a native `SW` switch, and a `VON`/`VOFF` model turns each S instance into the XSPICE `pswitch` code model, which spice-ts now implements (log and linear transition, auto-partial Jacobian) and which A cards can also use directly (#825).
