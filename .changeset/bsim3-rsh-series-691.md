---
"@spice-ts/core": patch
---

BSIM3 (LEVEL=8/49, every VERSION): model the `RSH × NRD` / `RSH × NRS` drain and source series resistances like ngspice-47 b3set.c/b3v32set.c, with `NRD = NRS = 1` square by default, prime nodes only for non-zero values and `M` dividing the resistance (#691). Before, they were silently dropped (a 9.7% drain-current error on the corpus-f TSMC 0.25u card). A card with `ACM` other than 0 is now rejected with `UNSUPPORTED_MODEL_PARAMETER` instead of being simulated as ACM = 0.
