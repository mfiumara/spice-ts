---
'@spice-ts/core': patch
---

The real sparse LU's supernodal block update skips the zero-activation test once every row of a block group is settled and computes the members' own U entries row by row (#779). Every entry receives the same operations in the same order, so results are bit-identical; a full factorization of the 50k-node resistor mesh is about 1.4x faster (1.14x end to end on that deck).
