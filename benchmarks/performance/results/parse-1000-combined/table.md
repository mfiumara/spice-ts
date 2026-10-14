# Combined parse preparation comparison

Ten interleaved cold rounds. Times in ms, median / IQR. No samples removed.

| Deck | Before parse | Candidate parse | Reduction | IQR disjoint | Before cold wall | Candidate cold wall | Wall reduction | Before / native | Candidate / native |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 22.655 / 4.220 | 16.627 / 3.825 | 26.607% | true | 240.942 / 32.378 | 226.581 / 56.442 | 5.960% | 4.691x | 4.412x |
| resistor-mesh-op-1000 | 22.868 / 3.353 | 16.055 / 2.603 | 29.792% | true | 199.024 / 29.329 | 187.234 / 28.894 | 5.924% | 6.432x | 6.051x |
| rc-ladder-tran-10000 | 120.640 / 21.844 | 82.524 / 17.923 | 31.595% | true | 693.369 / 105.638 | 654.086 / 100.386 | 5.666% | 2.356x | 2.222x |
| resistor-mesh-op-10000 | 119.169 / 33.386 | 88.445 / 11.176 | 25.782% | true | 502.964 / 66.238 | 496.981 / 54.466 | 1.190% | 3.405x | 3.365x |
| rc-ladder-tran-50000 | 395.191 / 98.777 | 257.332 / 60.064 | 34.884% | true | 2319.293 / 787.712 | 2257.033 / 301.256 | 2.684% | 1.313x | 1.278x |
| resistor-mesh-op-50000 | 379.125 / 56.472 | 249.256 / 59.701 | 34.255% | true | 1557.504 / 253.694 | 1415.657 / 272.886 | 9.107% | 1.792x | 1.629x |

Gate met: true. Native ratios are cold TS wall including equality/output hashing divided by direct ngspice wall including raw emission, not native superiority claims.

## Shared-host losses and spread

All six median cold-wall changes improve, but individual rotating-round cells lose. Paired counts below are descriptive, not a paired causal estimate.

| Deck | Rounds with candidate cold wall slower | Before worst wall | Candidate worst wall | Worst-wall change |
|---|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 3/10 | 304.314 | 294.568 | -9.746 ms |
| resistor-mesh-op-1000 | 2/10 | 220.683 | 218.678 | -2.005 ms |
| rc-ladder-tran-10000 | 4/10 | 920.335 | 1014.878 | 94.543 ms |
| resistor-mesh-op-10000 | 1/10 | 582.627 | 565.263 | -17.364 ms |
| rc-ladder-tran-50000 | 2/10 | 4051.110 | 2590.367 | -1460.744 ms |
| resistor-mesh-op-50000 | 1/10 | 1945.133 | 2341.368 | 396.234 ms |

## Current baseline exclusive attribution

Instrumented built copies only. Instrumentation overhead is retained, not subtracted from uninstrumented gate measurements.

| Phase | RC10k | Mesh10k |
|---|---:|---:|
| parse | 130.055 / 13.645 | 130.537 / 20.836 |
| preprocess | 29.811 / 3.446 | 30.910 / 2.426 |
| numparam.braceBareParameters | 26.786 / 4.347 | 30.572 / 4.464 |
| numparam.substituteStatement | 8.536 / 1.604 | 9.999 / 0.788 |
| tokenize | 11.494 / 2.137 | 8.907 / 1.869 |
| cardParse | 31.529 / 5.712 | 27.183 / 7.055 |
| assembly | 8.531 / 3.389 | 10.712 / 2.540 |
| parseResidual | 5.731 / 0.823 | 5.810 / 0.754 |

Corpus equality: {"successfulParses":951,"uniqueStates":771,"sha256":"fe6b2d01637f62bf5de89813c1de493c384340fc2d1d9e7cb63acbf9d7cb5c5f"}
