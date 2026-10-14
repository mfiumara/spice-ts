# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 207.527 / 22.263 | 207.930 / 43.850 | 125.957 / 27.229 |
| import | 23.937 / 2.027 | 23.642 / 3.659 | 4.371 / 0.589 |
| deckRead | 0.491 / 0.089 | 0.452 / 0.069 | 0.353 / 0.052 |
| parse | 16.538 / 2.151 | 13.399 / 1.484 | 2.837 / 0.471 |
| parseEqualityHash | 1.436 / 0.181 | 1.422 / 0.133 | not separately available |
| simulate | 63.916 / 9.073 | 63.987 / 5.284 | not separately available |
| outputHash | 4.870 / 1.086 | 5.013 / 0.367 | 0.616 / 0.078 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.122 / 0.021 |
| loadStamp | not separately available | not separately available | 3.977 / 0.443 |
| factor | not separately available | not separately available | 3.385 / 0.504 |
| solve | not separately available | not separately available | 3.005 / 0.444 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 56.188 / 4.528 | 53.915 / 7.996 | 53.809 / 5.548 |
| exit | 29.693 / 11.379 | 49.823 / 41.769 | 22.323 / 8.641 |
| nativeWall | not separately available | not separately available | 37.084 / 4.005 |

Control parent wall / direct native wall = 5.596x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 5.607x. Candidate parse reduction = 18.981%.


## resistor-mesh-op-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 176.741 / 33.888 | 175.696 / 53.199 | 131.029 / 46.477 |
| import | 23.801 / 2.302 | 24.032 / 1.697 | 4.424 / 0.462 |
| deckRead | 0.465 / 0.058 | 0.481 / 0.045 | 0.376 / 0.042 |
| parse | 16.450 / 2.051 | 13.091 / 0.829 | 2.992 / 0.339 |
| parseEqualityHash | 1.376 / 0.188 | 1.421 / 0.081 | not separately available |
| simulate | 34.266 / 4.276 | 35.431 / 2.056 | not separately available |
| outputHash | 1.599 / 0.113 | 1.424 / 0.098 | 0.117 / 0.023 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.732 / 0.059 |
| loadStamp | not separately available | not separately available | 0.069 / 0.008 |
| factor | not separately available | not separately available | 0.162 / 0.019 |
| solve | not separately available | not separately available | 0.061 / 0.007 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 53.562 / 4.271 | 55.470 / 4.529 | 55.045 / 6.413 |
| exit | 43.695 / 29.317 | 45.705 / 40.652 | 40.903 / 34.451 |
| nativeWall | not separately available | not separately available | 24.708 / 1.852 |

Control parent wall / direct native wall = 7.153x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 7.111x. Candidate parse reduction = 20.417%.


## rc-ladder-tran-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 574.088 / 103.564 | 537.312 / 71.163 | 310.640 / 21.550 |
| import | 24.130 / 2.023 | 23.780 / 3.183 | 4.165 / 0.425 |
| deckRead | 0.801 / 0.085 | 0.797 / 0.075 | 0.671 / 0.141 |
| parse | 84.591 / 6.930 | 66.997 / 8.474 | 26.655 / 2.127 |
| parseEqualityHash | 11.077 / 1.853 | 11.045 / 1.028 | not separately available |
| simulate | 292.923 / 50.169 | 292.654 / 50.528 | not separately available |
| outputHash | 25.196 / 5.612 | 25.130 / 5.461 | 5.173 / 0.711 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.159 / 0.031 |
| loadStamp | not separately available | not separately available | 45.657 / 2.598 |
| factor | not separately available | not separately available | 33.887 / 3.967 |
| solve | not separately available | not separately available | 31.380 / 3.386 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 53.838 / 7.165 | 54.964 / 5.760 | 53.511 / 2.762 |
| exit | 44.965 / 46.378 | 39.516 / 21.992 | 23.654 / 21.419 |
| nativeWall | not separately available | not separately available | 214.969 / 16.554 |

Control parent wall / direct native wall = 2.671x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 2.499x. Candidate parse reduction = 20.799%.


## resistor-mesh-op-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 413.987 / 70.455 | 420.892 / 67.282 | 217.611 / 33.901 |
| import | 23.885 / 3.294 | 25.040 / 4.014 | 4.298 / 0.956 |
| deckRead | 0.893 / 0.091 | 0.906 / 0.147 | 0.853 / 0.152 |
| parse | 86.193 / 12.690 | 67.604 / 10.848 | 29.180 / 4.588 |
| parseEqualityHash | 11.667 / 1.774 | 11.433 / 2.371 | not separately available |
| simulate | 172.188 / 22.837 | 171.795 / 32.814 | not separately available |
| outputHash | 7.446 / 0.945 | 7.175 / 1.230 | 0.184 / 0.021 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 19.276 / 3.587 |
| loadStamp | not separately available | not separately available | 0.790 / 0.187 |
| factor | not separately available | not separately available | 6.418 / 1.148 |
| solve | not separately available | not separately available | 0.937 / 0.215 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 53.290 / 8.035 | 57.311 / 7.634 | 55.160 / 11.664 |
| exit | 30.861 / 56.048 | 42.941 / 54.897 | 24.278 / 44.312 |
| nativeWall | not separately available | not separately available | 110.872 / 20.674 |

Control parent wall / direct native wall = 3.734x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 3.796x. Candidate parse reduction = 21.567%.


## rc-ladder-tran-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1825.184 / 125.440 | 1705.521 / 150.375 | 1516.795 / 422.803 |
| import | 23.340 / 3.406 | 23.863 / 1.779 | 4.425 / 0.464 |
| deckRead | 2.302 / 0.195 | 2.395 / 0.251 | 2.395 / 0.251 |
| parse | 297.695 / 38.522 | 219.354 / 12.167 | 140.036 / 14.603 |
| parseEqualityHash | 55.647 / 6.224 | 53.287 / 4.891 | not separately available |
| simulate | 1197.386 / 75.492 | 1186.234 / 93.159 | not separately available |
| outputHash | 117.653 / 12.473 | 116.745 / 10.628 | 25.324 / 3.290 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 6.236 / 0.793 |
| loadStamp | not separately available | not separately available | 287.810 / 107.473 |
| factor | not separately available | not separately available | 178.582 / 25.049 |
| solve | not separately available | not separately available | 137.722 / 16.601 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 52.633 / 6.322 | 54.915 / 3.537 | 55.696 / 6.895 |
| exit | 43.479 / 60.842 | 48.883 / 25.042 | 20.596 / 21.191 |
| nativeWall | not separately available | not separately available | 1380.895 / 400.355 |

Control parent wall / direct native wall = 1.322x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.235x. Candidate parse reduction = 26.316%.


## resistor-mesh-op-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1179.252 / 107.964 | 1109.182 / 179.921 | 805.487 / 43.903 |
| import | 23.690 / 2.772 | 23.893 / 4.929 | 4.275 / 0.504 |
| deckRead | 2.923 / 0.122 | 2.969 / 0.547 | 2.858 / 0.341 |
| parse | 305.297 / 21.811 | 217.558 / 33.460 | 142.483 / 10.076 |
| parseEqualityHash | 55.274 / 4.428 | 51.810 / 4.954 | not separately available |
| simulate | 668.899 / 64.515 | 684.975 / 137.865 | not separately available |
| outputHash | 32.521 / 4.245 | 34.105 / 5.195 | 0.495 / 0.046 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 232.828 / 18.734 |
| loadStamp | not separately available | not separately available | 4.753 / 1.347 |
| factor | not separately available | not separately available | 91.183 / 8.117 |
| solve | not separately available | not separately available | 8.198 / 0.281 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 54.083 / 4.922 | 53.936 / 10.255 | 53.441 / 4.407 |
| exit | 29.210 / 24.662 | 39.471 / 23.079 | 43.921 / 12.281 |
| nativeWall | not separately available | not separately available | 693.658 / 49.838 |

Control parent wall / direct native wall = 1.700x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.599x. Candidate parse reduction = 28.739%.
