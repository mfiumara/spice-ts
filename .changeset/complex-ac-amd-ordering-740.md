---
'@spice-ts/core': patch
---

The complex AC LU (AC, noise, distortion) now orders columns with the same fill-reducing AMD ordering as the real sparse LU, computed once per topology on the union pattern of G and C, with structural column singletons first and the permuted diagonal as preferred pivot (#740). Results agree with the previous natural-order factorization within round-off; mesh-like AC decks factor with far less fill (1k-node RC mesh: L+U 105,472 to 23,088 non-zeros).
