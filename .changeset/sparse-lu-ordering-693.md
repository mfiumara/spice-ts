---
"@spice-ts/core": patch
---

Faster sparse LU setup on large linear operating points: the AMD fill-reducing ordering no longer allocates per pivot, and the Gilbert-Peierls update loop reads the row state only for rows that were exactly zero. The ordering and factors are bit-identical. On the 50k-node resistor-mesh OP, simulate() is about 1.17x faster (#693).
