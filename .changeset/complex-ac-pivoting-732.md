---
'@spice-ts/core': patch
---

Complex AC LU now uses ngspice-47 Sparse pivot acceptance (|re| + |im| above 1e-13 and above 1e-3 of the column maximum) instead of keeping any diagonal >= 1e-18, and its factor buffers grow when row pivoting adds fill. AC and noise results no longer depend on card order when a diagonal collapses by cancellation (#732).
