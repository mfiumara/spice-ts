# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 569.074 / 67.104 | 615.428 / 87.356 | 347.448 / 34.444 |
| import | 28.517 / 1.225 | 29.344 / 4.171 | 4.837 / 0.899 |
| deckRead | 0.847 / 0.074 | 0.930 / 0.082 | 0.788 / 0.123 |
| parse | 95.154 / 9.749 | 106.620 / 7.049 | 30.113 / 5.748 |
| parseEqualityHash | 12.205 / 0.940 | 12.321 / 1.278 | not separately available |
| simulate | 337.829 / 43.816 | 349.841 / 43.666 | not separately available |
| outputHash | 28.551 / 3.016 | 30.363 / 4.571 | 5.752 / 0.835 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.284 / 0.296 |
| loadStamp | not separately available | not separately available | 51.008 / 7.999 |
| factor | not separately available | not separately available | 37.014 / 5.020 |
| solve | not separately available | not separately available | 34.732 / 5.234 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 54.911 / 6.721 | 52.134 / 5.906 | 54.707 / 7.571 |
| exit | 24.945 / 23.643 | 25.757 / 22.560 | 33.275 / 23.847 |
| preprocess | not separately available | 26.180 / 3.128 | not separately available |
| numparam | not separately available | 34.901 / 2.667 | not separately available |
| tokenize | not separately available | 8.786 / 1.083 | not separately available |
| cardParse | not separately available | 26.027 / 2.209 | not separately available |
| assembly | not separately available | 5.856 / 0.707 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.063 / 0.008 | not separately available |
| numparam.braceBareParameters | not separately available | 22.923 / 2.154 | not separately available |
| numparam.circuitTemperature | not separately available | 2.379 / 0.242 | not separately available |
| numparam.createParamScopes | not separately available | 0.012 / 0.003 | not separately available |
| numparam.measureName | not separately available | 1.337 / 0.172 | not separately available |
| numparam.substituteStatement | not separately available | 7.992 / 0.749 | not separately available |
| parseResidual | not separately available | 5.067 / 0.649 | not separately available |
| nativeWall | not separately available | not separately available | 245.850 / 40.793 |

Control parent wall / direct native wall = 2.315x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 4.25% |
| numparam | 5.67% |
| tokenize | 1.43% |
| cardParse | 4.23% |
| assembly | 0.95% |
| parseResidual | 0.82% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 409.310 / 49.278 | 435.945 / 42.443 | 192.560 / 14.143 |
| import | 28.235 / 0.813 | 28.250 / 1.017 | 4.646 / 0.398 |
| deckRead | 0.942 / 0.108 | 0.940 / 0.070 | 0.819 / 0.103 |
| parse | 96.740 / 7.311 | 107.115 / 7.118 | 30.575 / 3.536 |
| parseEqualityHash | 12.923 / 2.130 | 12.271 / 1.531 | not separately available |
| simulate | 184.526 / 19.896 | 189.252 / 13.831 | not separately available |
| outputHash | 8.018 / 1.156 | 8.194 / 1.140 | 0.192 / 0.022 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 21.191 / 2.146 |
| loadStamp | not separately available | not separately available | 0.928 / 0.135 |
| factor | not separately available | not separately available | 7.014 / 0.701 |
| solve | not separately available | not separately available | 0.982 / 0.093 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 51.314 / 3.634 | 52.833 / 2.739 | 52.102 / 4.404 |
| exit | 26.781 / 15.131 | 30.693 / 25.165 | 21.371 / 17.354 |
| preprocess | not separately available | 25.434 / 1.456 | not separately available |
| numparam | not separately available | 38.193 / 0.848 | not separately available |
| tokenize | not separately available | 9.235 / 1.267 | not separately available |
| cardParse | not separately available | 24.691 / 3.314 | not separately available |
| assembly | not separately available | 5.188 / 1.008 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.058 / 0.004 | not separately available |
| numparam.braceBareParameters | not separately available | 25.033 / 0.508 | not separately available |
| numparam.circuitTemperature | not separately available | 2.002 / 0.137 | not separately available |
| numparam.createParamScopes | not separately available | 0.012 / 0.001 | not separately available |
| numparam.measureName | not separately available | 1.361 / 0.785 | not separately available |
| numparam.substituteStatement | not separately available | 8.944 / 1.009 | not separately available |
| parseResidual | not separately available | 4.846 / 0.334 | not separately available |
| nativeWall | not separately available | not separately available | 118.430 / 11.793 |

Control parent wall / direct native wall = 3.456x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 5.83% |
| numparam | 8.76% |
| tokenize | 2.12% |
| cardParse | 5.66% |
| assembly | 1.19% |
| parseResidual | 1.11% |
