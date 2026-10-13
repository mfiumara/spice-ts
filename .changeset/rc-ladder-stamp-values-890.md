---
"@spice-ts/core": patch
---

Faster transient stamping on large linear decks: the resistor and capacitor stamp kernels now read conductances and capacitances from a typed array per run, refreshed whenever any resistor conductance or capacitor capacitance is written, instead of loading one device object per entry every Newton iteration. Results are bit-identical. On the M2 `rc-ladder-tran` 50k-node deck this is 1.12x faster in fresh processes (1.26x to 1.14x of ngspice-47 KLU wall time) and cuts `stampStaticDevices` self time 3.1x (#890).
