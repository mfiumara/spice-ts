# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 240.942 / 32.378 | 226.581 / 56.442 | 159.570 / 35.259 |
| import | 33.729 / 6.592 | 34.535 / 6.636 | 5.807 / 1.532 |
| deckRead | 0.619 / 0.154 | 0.607 / 0.159 | 0.472 / 0.096 |
| parse | 22.655 / 4.220 | 16.627 / 3.825 | 3.573 / 0.595 |
| parseEqualityHash | 1.920 / 0.398 | 1.928 / 0.492 | not separately available |
| simulate | 87.144 / 16.536 | 84.237 / 17.993 | not separately available |
| outputHash | 6.993 / 1.998 | 6.894 / 2.069 | 0.818 / 0.149 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.170 / 0.025 |
| loadStamp | not separately available | not separately available | 5.452 / 0.989 |
| factor | not separately available | not separately available | 4.513 / 0.786 |
| solve | not separately available | not separately available | 4.027 / 0.832 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 60.857 / 10.262 | 61.689 / 12.552 | 63.874 / 9.472 |
| exit | 29.162 / 25.616 | 32.710 / 34.521 | 33.271 / 18.002 |
| nativeWall | not separately available | not separately available | 51.358 / 9.362 |

Control parent wall / direct native wall = 4.691x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 4.412x. Candidate parse reduction = 26.607%.


## resistor-mesh-op-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 199.024 / 29.329 | 187.234 / 28.894 | 138.896 / 37.830 |
| import | 34.573 / 4.270 | 35.299 / 4.022 | 5.532 / 1.289 |
| deckRead | 0.658 / 0.156 | 0.682 / 0.226 | 0.454 / 0.101 |
| parse | 22.868 / 3.353 | 16.055 / 2.603 | 3.883 / 1.131 |
| parseEqualityHash | 1.873 / 0.210 | 1.896 / 0.313 | not separately available |
| simulate | 43.502 / 4.793 | 45.645 / 6.293 | not separately available |
| outputHash | 1.882 / 0.269 | 1.970 / 0.283 | 0.146 / 0.031 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.931 / 0.231 |
| loadStamp | not separately available | not separately available | 0.085 / 0.011 |
| factor | not separately available | not separately available | 0.208 / 0.047 |
| solve | not separately available | not separately available | 0.074 / 0.019 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 62.899 / 8.491 | 62.439 / 11.766 | 62.116 / 10.687 |
| exit | 23.692 / 16.562 | 21.705 / 19.441 | 26.518 / 25.101 |
| nativeWall | not separately available | not separately available | 30.941 / 7.312 |

Control parent wall / direct native wall = 6.432x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 6.051x. Candidate parse reduction = 29.792%.


## rc-ladder-tran-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 693.369 / 105.638 | 654.086 / 100.386 | 400.356 / 73.675 |
| import | 34.333 / 6.010 | 34.946 / 7.217 | 5.888 / 1.155 |
| deckRead | 1.073 / 0.272 | 1.038 / 0.226 | 0.925 / 0.202 |
| parse | 120.640 / 21.844 | 82.524 / 17.923 | 34.361 / 3.295 |
| parseEqualityHash | 15.786 / 1.860 | 14.792 / 2.000 | not separately available |
| simulate | 405.269 / 43.970 | 398.900 / 85.743 | not separately available |
| outputHash | 34.220 / 6.170 | 34.389 / 6.305 | 6.648 / 1.658 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.581 / 0.357 |
| loadStamp | not separately available | not separately available | 59.007 / 21.749 |
| factor | not separately available | not separately available | 44.981 / 10.812 |
| solve | not separately available | not separately available | 41.403 / 8.739 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 60.605 / 10.078 | 64.284 / 9.922 | 62.328 / 9.944 |
| exit | 16.714 / 13.504 | 21.898 / 15.867 | 22.253 / 6.428 |
| nativeWall | not separately available | not separately available | 294.342 / 74.415 |

Control parent wall / direct native wall = 2.356x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 2.222x. Candidate parse reduction = 31.595%.


## resistor-mesh-op-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 502.964 / 66.238 | 496.981 / 54.466 | 241.379 / 39.890 |
| import | 33.424 / 7.777 | 35.460 / 4.435 | 6.420 / 1.162 |
| deckRead | 1.160 / 0.257 | 1.271 / 0.224 | 1.051 / 0.090 |
| parse | 119.169 / 33.386 | 88.445 / 11.176 | 38.228 / 4.143 |
| parseEqualityHash | 15.567 / 3.450 | 15.643 / 2.101 | not separately available |
| simulate | 240.304 / 37.113 | 229.015 / 19.327 | not separately available |
| outputHash | 9.545 / 1.725 | 9.745 / 0.900 | 0.220 / 0.055 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 25.620 / 5.702 |
| loadStamp | not separately available | not separately available | 0.978 / 0.468 |
| factor | not separately available | not separately available | 8.397 / 1.777 |
| solve | not separately available | not separately available | 1.214 / 0.145 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 62.271 / 11.890 | 69.787 / 9.528 | 65.311 / 7.746 |
| exit | 28.715 / 15.469 | 36.064 / 22.645 | 25.637 / 24.802 |
| nativeWall | not separately available | not separately available | 147.694 / 16.386 |

Control parent wall / direct native wall = 3.405x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 3.365x. Candidate parse reduction = 25.782%.


## rc-ladder-tran-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 2319.293 / 787.712 | 2257.033 / 301.256 | 1893.038 / 481.557 |
| import | 31.759 / 6.378 | 34.187 / 8.909 | 6.148 / 1.164 |
| deckRead | 3.027 / 0.279 | 3.123 / 0.861 | 3.096 / 0.400 |
| parse | 395.191 / 98.777 | 257.332 / 60.064 | 172.209 / 18.152 |
| parseEqualityHash | 66.526 / 7.433 | 72.659 / 11.482 | not separately available |
| simulate | 1562.556 / 543.811 | 1590.240 / 181.211 | not separately available |
| outputHash | 149.380 / 47.699 | 153.618 / 30.183 | 35.165 / 5.878 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 7.863 / 1.369 |
| loadStamp | not separately available | not separately available | 366.597 / 85.607 |
| factor | not separately available | not separately available | 223.578 / 23.387 |
| solve | not separately available | not separately available | 152.186 / 28.922 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 60.065 / 14.148 | 66.341 / 14.153 | 66.012 / 9.260 |
| exit | 32.859 / 24.310 | 30.198 / 12.520 | 31.279 / 25.856 |
| nativeWall | not separately available | not separately available | 1766.217 / 477.649 |

Control parent wall / direct native wall = 1.313x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.278x. Candidate parse reduction = 34.884%.


## resistor-mesh-op-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1557.504 / 253.694 | 1415.657 / 272.886 | 959.557 / 185.488 |
| import | 32.029 / 6.403 | 31.514 / 7.153 | 5.870 / 1.100 |
| deckRead | 3.679 / 0.801 | 3.684 / 0.780 | 3.732 / 0.560 |
| parse | 379.125 / 56.472 | 249.256 / 59.701 | 182.419 / 25.803 |
| parseEqualityHash | 66.583 / 14.406 | 63.211 / 11.040 | not separately available |
| simulate | 949.559 / 168.561 | 930.485 / 178.098 | not separately available |
| outputHash | 39.480 / 7.123 | 42.928 / 10.251 | 0.620 / 0.111 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 297.519 / 60.220 |
| loadStamp | not separately available | not separately available | 5.255 / 1.506 |
| factor | not separately available | not separately available | 123.374 / 30.189 |
| solve | not separately available | not separately available | 9.357 / 1.439 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 59.478 / 11.385 | 60.585 / 9.343 | 63.451 / 11.743 |
| exit | 32.785 / 9.647 | 38.826 / 14.930 | 16.277 / 23.805 |
| nativeWall | not separately available | not separately available | 869.008 / 181.259 |

Control parent wall / direct native wall = 1.792x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.629x. Candidate parse reduction = 34.255%.
