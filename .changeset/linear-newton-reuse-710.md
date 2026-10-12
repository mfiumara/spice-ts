---
"@spice-ts/core": patch
---

Transient speed on linear circuits (#710): when every device is a plain resistor, capacitor or non-noise independent source, the second Newton iteration of a timestep is no longer rebuilt and re-solved, because it reproduces the first iterate exactly; the companion-system build also fuses its column passes into one. Results are bit-identical (paired A/B on the M2 RC ladder: about 1.15x faster at 10k/50k nodes).
