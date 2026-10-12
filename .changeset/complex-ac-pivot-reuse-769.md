---
'@spice-ts/core': patch
---

The complex AC LU (AC, noise, distortion) now reuses the pivot sequence and L/U pattern of its last full factorization at the next frequency point, as ngspice-47 does between AC points and KLU does with `klu_refactor` (#769). Reuse is accepted only when the full factorization would make exactly the same pivot and fill decisions; otherwise it falls back to the full factorization, so results are bit-identical. The RC mesh AC sweep runs 2.2x faster at 10k nodes and 2.7x faster at 50k nodes.
