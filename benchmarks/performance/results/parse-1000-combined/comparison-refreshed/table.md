# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 263.215 / 39.299 | 252.831 / 41.440 | 145.517 / 32.739 |
| import | 35.046 / 7.985 | 35.024 / 8.306 | 6.031 / 1.501 |
| deckRead | 0.628 / 0.125 | 0.611 / 0.055 | 0.502 / 0.110 |
| parse | 23.136 / 5.463 | 17.476 / 4.269 | 3.497 / 0.761 |
| parseEqualityHash | 1.896 / 0.313 | 2.110 / 0.507 | not separately available |
| simulate | 90.142 / 8.480 | 83.967 / 19.672 | not separately available |
| outputHash | 5.853 / 1.878 | 6.974 / 2.566 | 0.834 / 0.195 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.167 / 0.056 |
| loadStamp | not separately available | not separately available | 5.277 / 0.989 |
| factor | not separately available | not separately available | 4.478 / 0.936 |
| solve | not separately available | not separately available | 3.921 / 0.642 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 64.723 / 8.500 | 64.669 / 9.879 | 61.524 / 10.805 |
| exit | 27.555 / 33.315 | 36.648 / 15.694 | 27.527 / 25.872 |
| nativeWall | not separately available | not separately available | 50.934 / 12.534 |

Control parent wall / direct native wall = 5.168x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 4.964x. Candidate parse reduction = 24.464%.


## resistor-mesh-op-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 202.961 / 30.138 | 211.704 / 64.828 | 129.796 / 20.184 |
| import | 34.078 / 7.506 | 33.874 / 10.242 | 6.429 / 1.824 |
| deckRead | 0.569 / 0.100 | 0.587 / 0.174 | 0.524 / 0.146 |
| parse | 23.891 / 3.486 | 15.950 / 5.009 | 3.873 / 1.128 |
| parseEqualityHash | 2.077 / 0.575 | 1.967 / 0.602 | not separately available |
| simulate | 48.451 / 9.445 | 46.792 / 12.115 | not separately available |
| outputHash | 1.898 / 0.467 | 1.808 / 0.185 | 0.154 / 0.054 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.990 / 0.256 |
| loadStamp | not separately available | not separately available | 0.087 / 0.022 |
| factor | not separately available | not separately available | 0.220 / 0.057 |
| solve | not separately available | not separately available | 0.081 / 0.021 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 62.711 / 11.032 | 65.873 / 16.951 | 68.747 / 13.500 |
| exit | 22.264 / 6.582 | 43.830 / 23.625 | 21.257 / 12.076 |
| nativeWall | not separately available | not separately available | 33.919 / 11.171 |

Control parent wall / direct native wall = 5.984x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 6.242x. Candidate parse reduction = 33.240%.


## rc-ladder-tran-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 727.312 / 220.367 | 671.856 / 82.224 | 442.766 / 128.783 |
| import | 33.734 / 9.165 | 35.364 / 4.226 | 5.829 / 1.313 |
| deckRead | 1.173 / 0.353 | 1.160 / 0.359 | 0.939 / 0.133 |
| parse | 121.122 / 61.101 | 84.605 / 12.713 | 35.848 / 6.052 |
| parseEqualityHash | 15.063 / 3.188 | 15.692 / 1.812 | not separately available |
| simulate | 418.430 / 87.844 | 409.447 / 45.996 | not separately available |
| outputHash | 35.245 / 8.587 | 35.063 / 5.488 | 6.701 / 1.872 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.566 / 0.453 |
| loadStamp | not separately available | not separately available | 66.854 / 15.096 |
| factor | not separately available | not separately available | 43.100 / 6.177 |
| solve | not separately available | not separately available | 38.043 / 5.964 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 61.998 / 16.366 | 65.442 / 13.603 | 66.747 / 28.952 |
| exit | 24.482 / 22.750 | 23.631 / 13.784 | 28.823 / 21.916 |
| nativeWall | not separately available | not separately available | 335.894 / 100.859 |

Control parent wall / direct native wall = 2.165x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 2.000x. Candidate parse reduction = 30.149%.


## resistor-mesh-op-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 502.303 / 123.122 | 464.411 / 150.170 | 243.641 / 74.858 |
| import | 35.648 / 7.041 | 32.700 / 8.727 | 5.893 / 2.522 |
| deckRead | 1.162 / 0.265 | 1.119 / 0.410 | 1.054 / 0.248 |
| parse | 116.793 / 23.390 | 83.396 / 34.762 | 37.905 / 7.601 |
| parseEqualityHash | 16.010 / 3.200 | 14.906 / 1.800 | not separately available |
| simulate | 230.964 / 37.814 | 239.035 / 69.594 | not separately available |
| outputHash | 9.581 / 2.588 | 9.234 / 1.062 | 0.224 / 0.055 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 26.619 / 7.978 |
| loadStamp | not separately available | not separately available | 0.932 / 0.396 |
| factor | not separately available | not separately available | 8.669 / 1.201 |
| solve | not separately available | not separately available | 1.316 / 0.418 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 66.233 / 19.375 | 63.135 / 11.673 | 65.270 / 22.107 |
| exit | 22.208 / 14.308 | 19.754 / 11.345 | 15.247 / 11.682 |
| nativeWall | not separately available | not separately available | 151.604 / 33.533 |

Control parent wall / direct native wall = 3.313x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 3.063x. Candidate parse reduction = 28.594%.


## rc-ladder-tran-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 2401.105 / 567.006 | 2282.090 / 167.207 | 1958.083 / 194.966 |
| import | 31.599 / 6.696 | 35.241 / 4.552 | 5.673 / 1.865 |
| deckRead | 2.936 / 0.589 | 3.110 / 0.458 | 2.957 / 0.857 |
| parse | 366.576 / 34.940 | 257.111 / 25.431 | 175.004 / 33.308 |
| parseEqualityHash | 66.529 / 7.246 | 67.937 / 14.744 | not separately available |
| simulate | 1674.580 / 383.658 | 1669.385 / 162.058 | not separately available |
| outputHash | 153.417 / 22.362 | 143.452 / 24.007 | 30.608 / 6.495 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 8.153 / 1.457 |
| loadStamp | not separately available | not separately available | 402.876 / 42.510 |
| factor | not separately available | not separately available | 218.721 / 23.278 |
| solve | not separately available | not separately available | 165.668 / 18.500 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 58.044 / 10.500 | 61.999 / 10.533 | 72.275 / 16.782 |
| exit | 33.715 / 16.225 | 26.224 / 17.785 | 26.451 / 20.636 |
| nativeWall | not separately available | not separately available | 1803.079 / 153.194 |

Control parent wall / direct native wall = 1.332x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.266x. Candidate parse reduction = 29.861%.


## resistor-mesh-op-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1874.837 / 566.482 | 1558.667 / 282.141 | 1031.141 / 342.472 |
| import | 36.999 / 10.975 | 35.881 / 8.840 | 6.565 / 2.650 |
| deckRead | 3.787 / 1.033 | 3.867 / 0.752 | 3.795 / 1.113 |
| parse | 450.571 / 155.158 | 259.323 / 68.074 | 190.560 / 39.027 |
| parseEqualityHash | 74.379 / 18.715 | 69.214 / 14.640 | not separately available |
| simulate | 1056.719 / 349.449 | 1009.015 / 194.766 | not separately available |
| outputHash | 47.274 / 7.285 | 47.082 / 9.717 | 0.694 / 0.173 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 305.940 / 138.002 |
| loadStamp | not separately available | not separately available | 5.579 / 0.850 |
| factor | not separately available | not separately available | 143.525 / 53.043 |
| solve | not separately available | not separately available | 10.371 / 2.410 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 61.216 / 18.094 | 61.587 / 12.805 | 64.864 / 19.758 |
| exit | 31.192 / 14.626 | 42.907 / 15.595 | 13.919 / 7.565 |
| nativeWall | not separately available | not separately available | 920.263 / 328.921 |

Control parent wall / direct native wall = 2.037x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.694x. Candidate parse reduction = 42.446%.
