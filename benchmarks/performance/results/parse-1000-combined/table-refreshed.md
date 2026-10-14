# Combined parse preparation comparison

Ten interleaved cold rounds. Times in ms, median / IQR. No samples removed.

| Deck | Before parse | Candidate parse | Reduction | IQR disjoint | Before cold wall | Candidate cold wall | Wall reduction | Before / native | Candidate / native |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 23.136 / 5.463 | 17.476 / 4.269 | 24.464% | true | 263.215 / 39.299 | 252.831 / 41.440 | 3.945% | 5.168x | 4.964x |
| resistor-mesh-op-1000 | 23.891 / 3.486 | 15.950 / 5.009 | 33.240% | true | 202.961 / 30.138 | 211.704 / 64.828 | -4.308% | 5.984x | 6.242x |
| rc-ladder-tran-10000 | 121.122 / 61.101 | 84.605 / 12.713 | 30.149% | true | 727.312 / 220.367 | 671.856 / 82.224 | 7.625% | 2.165x | 2.000x |
| resistor-mesh-op-10000 | 116.793 / 23.390 | 83.396 / 34.762 | 28.594% | false | 502.303 / 123.122 | 464.411 / 150.170 | 7.544% | 3.313x | 3.063x |
| rc-ladder-tran-50000 | 366.576 / 34.940 | 257.111 / 25.431 | 29.861% | true | 2401.105 / 567.006 | 2282.090 / 167.207 | 4.957% | 1.332x | 1.266x |
| resistor-mesh-op-50000 | 450.571 / 155.158 | 259.323 / 68.074 | 42.446% | true | 1874.837 / 566.482 | 1558.667 / 282.141 | 16.864% | 2.037x | 1.694x |

Gate met: false. Native ratios are cold TS wall including equality/output hashing divided by direct ngspice wall including raw emission, not native superiority claims.

## Shared-host losses and spread

Median cold-wall losses, when present, are negative reductions in the table above. Individual rotating-round cells also lose. Paired counts below are descriptive, not a paired causal estimate.

| Deck | Rounds with candidate cold wall slower | Before worst wall | Candidate worst wall | Worst-wall change |
|---|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 5/10 | 336.031 | 320.142 | -15.889 ms |
| resistor-mesh-op-1000 | 6/10 | 249.156 | 256.882 | 7.726 ms |
| rc-ladder-tran-10000 | 3/10 | 929.731 | 1048.562 | 118.831 ms |
| resistor-mesh-op-10000 | 3/10 | 678.329 | 683.225 | 4.896 ms |
| rc-ladder-tran-50000 | 2/10 | 3119.140 | 2505.033 | -614.107 ms |
| resistor-mesh-op-50000 | 0/10 | 2388.761 | 1853.534 | -535.226 ms |

## Current baseline exclusive attribution

Instrumented built copies only. Instrumentation overhead is retained, not subtracted from uninstrumented gate measurements.

| Phase | RC10k | Mesh10k |
|---|---:|---:|
| parse | 106.620 / 7.049 | 107.115 / 7.118 |
| preprocess | 26.180 / 3.128 | 25.434 / 1.456 |
| numparam.braceBareParameters | 22.923 / 2.154 | 25.033 / 0.508 |
| numparam.substituteStatement | 7.992 / 0.749 | 8.944 / 1.009 |
| tokenize | 8.786 / 1.083 | 9.235 / 1.267 |
| cardParse | 26.027 / 2.209 | 24.691 / 3.314 |
| assembly | 5.856 / 0.707 | 5.188 / 1.008 |
| parseResidual | 5.067 / 0.649 | 4.846 / 0.334 |

Corpus equality: {"successfulParses":968,"uniqueStates":770,"sha256":"4dfeeee6b31e9d292d0c08b1cecaa755c2c43b7387b622877c809be1c5610984"}
