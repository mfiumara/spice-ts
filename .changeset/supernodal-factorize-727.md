---
"@spice-ts/core": patch
---

Faster sparse LU on mesh-like circuits: a full factorization now packs runs of consecutive L columns with nested patterns (supernodes) into row-major blocks as they are produced and applies them to later columns a block at a time. The operations and their order are unchanged, so factors and results are bit-identical; the factorization kernel is about 1.5x faster on a 50k-node resistor grid (#727).
