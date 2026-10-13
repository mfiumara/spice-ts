---
"@spice-ts/core": patch
---

Faster DC operating points on MOS1-heavy circuits: the per-MOSFET Newton step limit (terminal-step cap plus DEVfetlim gate limiting) now runs as one allocation-free loop over a typed-array batch, with no per-device closures. Step scales and solutions are bit-identical; the cmos-chain OP is 1.15x faster at 10k nodes and 1.42x at 50k (#830).
