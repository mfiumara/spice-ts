---
"@spice-ts/core": patch
---

`.noise` now accepts Gummel-Poon BJTs whose model sets junction capacitances (CJE/VJE/MJE, CJC/VJC/MJC, XCJC, FC), transit times (TF/XTF/VTF/ITF, TR), VAR, IKR, ISC/NC, NKF or the XTI/XTB/EG temperature inputs (and their ngspice aliases). These only change the operating point and the bjtacld.c small-signal transfer, which the DC solve and AC stamp already model, not the bjtnoise.c sources. Onoise/inoise match ngspice-47 within 1.5e-6 on a CJE/CJC/TF/TR/VAF/VAR deck, and the corpus-g decks MULTIPLICITY_FACTOR/bjt_diffpair_noise_baseline.net and NOISE/cascodeBjtNOISE.cir now run. RBM/IRB, the substrate diode (ISS) and TNOM are still rejected (#736).
