---
'@spice-ts/core': patch
---

Accept the PSpice current-controlled switch model type `.model <name> ISWITCH(...)`, translated as ngspice-47's PSpice compatibility mode does (inpcompat.c): an `IT`/`IH` model is a native `CSW` switch, and an `ION`/`IOFF` model turns each W instance into the XSPICE `aswitch` code model controlled by the `%vnam` current of its voltage source. spice-ts now implements `aswitch` (log/linear, `limit`), which A cards can also use directly (#848).
