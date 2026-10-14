# #991 fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 473.313 / 60.924 | 483.588 / 36.045 | 300.830 / 45.403 |
| import | 20.476 / 1.042 | 20.774 / 1.418 | 3.440 / 0.140 |
| deckRead | 0.690 / 0.055 | 0.682 / 0.077 | 0.620 / 0.047 |
| parse | 71.753 / 4.454 | 71.962 / 6.156 | 24.276 / 1.030 |
| simulate | 260.153 / 15.645 | 252.588 / 16.401 | not separately available |
| outputHash | 22.950 / 0.719 | 23.707 / 1.520 | 4.710 / 0.261 |
| compile | not separately available | 31.558 / 3.674 | not separately available |
| matrixBuild | not separately available | 17.497 / 0.965 | not separately available |
| ordering | not separately available | 20.158 / 1.267 | 1.064 / 0.065 |
| loadStamp | not separately available | 54.749 / 2.608 | 38.697 / 1.622 |
| factor | not separately available | 21.817 / 1.424 | 30.088 / 1.660 |
| solve | not separately available | 12.673 / 1.003 | 27.575 / 1.701 |
| outputMaterialization | not separately available | 20.965 / 3.273 | not separately available |
| spawnFirstUserCode | 47.993 / 3.617 | 49.083 / 3.394 | 48.100 / 1.530 |
| exit | 39.677 / 28.267 | 54.110 / 28.164 | 44.337 / 51.309 |
| simulateResidual | not separately available | 75.281 / 5.177 | not separately available |
| nativeWall | not separately available | not separately available | 192.556 / 9.549 |

Control parent wall / direct native wall = 2.458x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| parse | 14.88% |
| compile | 6.53% |
| matrixBuild | 3.62% |
| ordering | 4.17% |
| loadStamp | 11.32% |
| factor | 4.51% |
| solve | 2.62% |
| outputMaterialization | 4.34% |
| simulateResidual | 15.57% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 357.610 / 49.799 | 348.613 / 32.014 | 166.736 / 34.946 |
| import | 21.401 / 2.595 | 20.242 / 2.819 | 3.446 / 0.549 |
| deckRead | 0.754 / 0.055 | 0.725 / 0.115 | 0.690 / 0.128 |
| parse | 77.662 / 7.426 | 73.397 / 9.465 | 25.576 / 4.300 |
| simulate | 150.460 / 15.979 | 149.357 / 16.192 | not separately available |
| outputHash | 6.535 / 0.934 | 6.878 / 0.492 | 0.160 / 0.019 |
| compile | not separately available | 25.120 / 3.361 | not separately available |
| matrixBuild | not separately available | 10.853 / 1.189 | not separately available |
| ordering | not separately available | 33.964 / 3.999 | 17.190 / 1.974 |
| loadStamp | not separately available | 10.366 / 1.022 | 0.690 / 0.318 |
| factor | not separately available | 57.756 / 6.021 | 5.898 / 0.884 |
| solve | not separately available | 4.003 / 0.408 | 0.776 / 0.129 |
| outputMaterialization | not separately available | 0.002 / 0.000 | not separately available |
| spawnFirstUserCode | 49.318 / 5.400 | 48.382 / 3.979 | 50.028 / 4.794 |
| exit | 19.662 / 57.446 | 31.764 / 48.832 | 15.903 / 16.952 |
| simulateResidual | not separately available | 8.960 / 0.940 | not separately available |
| nativeWall | not separately available | not separately available | 98.672 / 10.558 |

Control parent wall / direct native wall = 3.624x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| parse | 21.05% |
| compile | 7.21% |
| matrixBuild | 3.11% |
| ordering | 9.74% |
| loadStamp | 2.97% |
| factor | 16.57% |
| solve | 1.15% |
| outputMaterialization | 0.00% |
| simulateResidual | 2.57% |
