# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 200.719 / 26.929 | 199.748 / 34.372 | 113.726 / 33.779 |
| import | 25.365 / 2.719 | 24.683 / 2.491 | 3.860 / 0.652 |
| deckRead | 0.443 / 0.084 | 0.444 / 0.051 | 0.317 / 0.050 |
| parse | 16.292 / 1.804 | 16.121 / 1.687 | 2.672 / 0.486 |
| parseEqualityHash | 1.406 / 0.162 | 1.415 / 0.167 | not separately available |
| simulate | 61.858 / 6.213 | 63.038 / 6.083 | not separately available |
| outputHash | 4.387 / 2.188 | 4.218 / 1.001 | 0.587 / 0.043 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.122 / 0.007 |
| loadStamp | not separately available | not separately available | 3.811 / 0.270 |
| factor | not separately available | not separately available | 3.208 / 0.200 |
| solve | not separately available | not separately available | 2.860 / 0.222 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 48.221 / 3.478 | 47.553 / 3.629 | 47.145 / 4.377 |
| exit | 31.739 / 26.388 | 31.275 / 22.393 | 23.492 / 37.658 |
| nativeWall | not separately available | not separately available | 35.843 / 3.293 |

Control parent wall / direct native wall = 5.600x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 5.573x. Candidate parse reduction = 1.047%.


## resistor-mesh-op-1000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 176.893 / 48.646 | 180.152 / 25.578 | 101.935 / 28.076 |
| import | 25.301 / 2.601 | 25.015 / 2.606 | 4.049 / 0.650 |
| deckRead | 0.438 / 0.111 | 0.447 / 0.039 | 0.359 / 0.049 |
| parse | 16.301 / 1.036 | 15.771 / 1.514 | 2.872 / 0.312 |
| parseEqualityHash | 1.436 / 0.192 | 1.387 / 0.181 | not separately available |
| simulate | 34.686 / 3.369 | 33.458 / 2.910 | not separately available |
| outputHash | 1.378 / 0.100 | 1.301 / 0.102 | 0.101 / 0.012 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.694 / 0.071 |
| loadStamp | not separately available | not separately available | 0.060 / 0.007 |
| factor | not separately available | not separately available | 0.153 / 0.012 |
| solve | not separately available | not separately available | 0.056 / 0.005 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.355 / 6.302 | 47.250 / 2.738 | 46.178 / 2.436 |
| exit | 61.479 / 31.338 | 53.515 / 11.236 | 28.226 / 38.189 |
| nativeWall | not separately available | not separately available | 23.776 / 2.325 |

Control parent wall / direct native wall = 7.440x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 7.577x. Candidate parse reduction = 3.254%.


## rc-ladder-tran-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 504.906 / 21.548 | 512.627 / 34.854 | 312.150 / 58.182 |
| import | 23.694 / 2.524 | 25.193 / 2.132 | 4.067 / 0.431 |
| deckRead | 0.755 / 0.085 | 0.745 / 0.104 | 0.662 / 0.042 |
| parse | 84.310 / 8.251 | 80.170 / 5.446 | 25.998 / 2.465 |
| parseEqualityHash | 10.842 / 0.951 | 11.407 / 1.013 | not separately available |
| simulate | 290.963 / 32.567 | 289.017 / 39.605 | not separately available |
| outputHash | 25.000 / 2.465 | 25.189 / 3.650 | 5.159 / 0.411 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.149 / 0.101 |
| loadStamp | not separately available | not separately available | 43.415 / 5.444 |
| factor | not separately available | not separately available | 33.533 / 2.392 |
| solve | not separately available | not separately available | 30.933 / 1.738 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.523 / 5.761 | 47.785 / 4.586 | 46.978 / 4.245 |
| exit | 28.552 / 26.479 | 30.187 / 44.671 | 36.853 / 48.278 |
| nativeWall | not separately available | not separately available | 215.480 / 24.298 |

Control parent wall / direct native wall = 2.343x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 2.379x. Candidate parse reduction = 4.911%.


## resistor-mesh-op-10000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 379.498 / 52.564 | 367.808 / 44.362 | 198.993 / 28.425 |
| import | 24.538 / 4.448 | 24.415 / 3.417 | 4.089 / 0.986 |
| deckRead | 0.863 / 0.199 | 0.839 / 0.151 | 0.771 / 0.155 |
| parse | 82.799 / 10.295 | 77.006 / 11.290 | 27.477 / 1.984 |
| parseEqualityHash | 10.757 / 2.409 | 10.488 / 1.584 | not separately available |
| simulate | 163.189 / 15.716 | 164.195 / 21.764 | not separately available |
| outputHash | 6.957 / 0.435 | 6.755 / 0.911 | 0.169 / 0.026 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 18.701 / 3.155 |
| loadStamp | not separately available | not separately available | 0.696 / 0.248 |
| factor | not separately available | not separately available | 6.277 / 0.737 |
| solve | not separately available | not separately available | 0.866 / 0.229 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.094 / 6.082 | 47.493 / 3.604 | 47.580 / 7.244 |
| exit | 29.638 / 31.726 | 16.769 / 26.401 | 34.239 / 23.752 |
| nativeWall | not separately available | not separately available | 109.082 / 15.201 |

Control parent wall / direct native wall = 3.479x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 3.372x. Candidate parse reduction = 6.997%.


## rc-ladder-tran-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1684.430 / 155.140 | 1708.504 / 105.372 | 1365.004 / 343.917 |
| import | 23.793 / 2.563 | 25.562 / 0.831 | 4.099 / 0.694 |
| deckRead | 2.242 / 0.205 | 2.372 / 0.077 | 2.224 / 0.188 |
| parse | 280.259 / 30.182 | 266.236 / 18.269 | 130.915 / 14.792 |
| parseEqualityHash | 51.932 / 4.665 | 52.981 / 7.442 | not separately available |
| simulate | 1138.022 / 71.518 | 1168.172 / 85.565 | not separately available |
| outputHash | 108.648 / 3.440 | 108.526 / 7.709 | 22.849 / 2.972 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 5.502 / 0.565 |
| loadStamp | not separately available | not separately available | 292.525 / 48.370 |
| factor | not separately available | not separately available | 161.546 / 16.751 |
| solve | not separately available | not separately available | 129.065 / 13.212 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.310 / 4.396 | 48.580 / 2.555 | 48.239 / 4.817 |
| exit | 32.309 / 25.708 | 41.416 / 27.091 | 29.212 / 20.866 |
| nativeWall | not separately available | not separately available | 1237.894 / 360.492 |

Control parent wall / direct native wall = 1.361x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.380x. Candidate parse reduction = 5.004%.


## resistor-mesh-op-50000

| Phase | Unchanged control | Uninstrumented candidate | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1165.539 / 92.837 | 1156.557 / 89.138 | 789.560 / 96.572 |
| import | 24.131 / 2.199 | 24.399 / 2.328 | 4.055 / 0.606 |
| deckRead | 2.841 / 0.263 | 2.905 / 0.261 | 2.826 / 0.239 |
| parse | 295.922 / 23.560 | 275.783 / 21.647 | 143.762 / 16.402 |
| parseEqualityHash | 49.721 / 4.134 | 49.910 / 3.043 | not separately available |
| simulate | 674.952 / 69.113 | 687.301 / 56.433 | not separately available |
| outputHash | 31.869 / 4.170 | 31.938 / 2.355 | 0.468 / 0.037 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 230.255 / 10.704 |
| loadStamp | not separately available | not separately available | 3.360 / 1.690 |
| factor | not separately available | not separately available | 90.580 / 7.177 |
| solve | not separately available | not separately available | 7.825 / 0.454 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 45.595 / 3.975 | 47.738 / 4.254 | 47.548 / 2.611 |
| exit | 26.778 / 53.905 | 40.309 / 22.236 | 42.335 / 45.266 |
| nativeWall | not separately available | not separately available | 696.709 / 39.847 |

Control parent wall / direct native wall = 1.673x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

Candidate parent wall / direct native wall = 1.660x. Candidate parse reduction = 6.806%.
