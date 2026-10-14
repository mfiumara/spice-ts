# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 527.030 / 34.066 | 516.649 / 48.911 | 326.835 / 55.988 |
| import | 23.310 / 1.827 | 23.316 / 0.262 | 4.049 / 0.157 |
| deckRead | 0.714 / 0.057 | 0.762 / 0.032 | 0.659 / 0.019 |
| parse | 64.406 / 4.255 | 74.042 / 2.015 | 26.498 / 0.735 |
| parseEqualityHash | 11.141 / 0.365 | 11.263 / 0.634 | not separately available |
| simulate | 285.286 / 16.779 | 290.600 / 26.447 | not separately available |
| outputHash | 25.302 / 2.433 | 25.787 / 2.474 | 5.070 / 0.053 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.159 / 0.031 |
| loadStamp | not separately available | not separately available | 44.042 / 2.454 |
| factor | not separately available | not separately available | 33.297 / 0.641 |
| solve | not separately available | not separately available | 31.130 / 0.604 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 51.566 / 2.845 | 52.814 / 1.367 | 53.648 / 4.110 |
| exit | 50.572 / 35.081 | 45.047 / 30.193 | 52.964 / 48.507 |
| preprocess | not separately available | 19.161 / 0.848 | not separately available |
| numparam | not separately available | 14.886 / 0.321 | not separately available |
| tokenize | not separately available | 7.862 / 0.280 | not separately available |
| cardParse | not separately available | 21.629 / 1.113 | not separately available |
| assembly | not separately available | 5.938 / 0.829 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.045 / 0.003 | not separately available |
| numparam.braceBareParameters | not separately available | 4.813 / 0.239 | not separately available |
| numparam.circuitTemperature | not separately available | 2.082 / 0.094 | not separately available |
| numparam.createParamScopes | not separately available | 0.009 / 0.001 | not separately available |
| numparam.measureName | not separately available | 1.240 / 0.028 | not separately available |
| numparam.substituteStatement | not separately available | 6.778 / 0.243 | not separately available |
| parseResidual | not separately available | 4.255 / 0.289 | not separately available |
| nativeWall | not separately available | not separately available | 210.164 / 5.223 |

Control parent wall / direct native wall = 2.508x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 3.71% |
| numparam | 2.88% |
| tokenize | 1.52% |
| cardParse | 4.19% |
| assembly | 1.15% |
| parseResidual | 0.82% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 380.169 / 40.106 | 380.063 / 35.991 | 210.558 / 61.172 |
| import | 23.386 / 1.954 | 23.367 / 0.401 | 4.097 / 0.122 |
| deckRead | 0.794 / 0.025 | 0.803 / 0.047 | 0.714 / 0.032 |
| parse | 63.912 / 2.185 | 73.070 / 2.795 | 27.495 / 0.667 |
| parseEqualityHash | 10.852 / 0.576 | 10.383 / 0.318 | not separately available |
| simulate | 162.483 / 5.402 | 163.121 / 12.040 | not separately available |
| outputHash | 6.991 / 0.576 | 6.730 / 0.561 | 0.169 / 0.012 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 18.895 / 0.104 |
| loadStamp | not separately available | not separately available | 0.676 / 0.150 |
| factor | not separately available | not separately available | 6.348 / 0.048 |
| solve | not separately available | not separately available | 0.847 / 0.027 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 52.613 / 3.325 | 53.426 / 1.405 | 53.096 / 1.837 |
| exit | 62.326 / 42.185 | 37.335 / 38.719 | 44.496 / 59.822 |
| preprocess | not separately available | 19.018 / 0.641 | not separately available |
| numparam | not separately available | 15.154 / 0.464 | not separately available |
| tokenize | not separately available | 8.046 / 0.280 | not separately available |
| cardParse | not separately available | 20.110 / 2.227 | not separately available |
| assembly | not separately available | 5.774 / 5.580 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.046 / 0.007 | not separately available |
| numparam.braceBareParameters | not separately available | 4.787 / 0.121 | not separately available |
| numparam.circuitTemperature | not separately available | 2.030 / 0.294 | not separately available |
| numparam.createParamScopes | not separately available | 0.009 / 0.001 | not separately available |
| numparam.measureName | not separately available | 1.207 / 0.035 | not separately available |
| numparam.substituteStatement | not separately available | 7.052 / 0.267 | not separately available |
| parseResidual | not separately available | 4.385 / 0.185 | not separately available |
| nativeWall | not separately available | not separately available | 106.877 / 1.389 |

Control parent wall / direct native wall = 3.557x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 5.00% |
| numparam | 3.99% |
| tokenize | 2.12% |
| cardParse | 5.29% |
| assembly | 1.52% |
| parseResidual | 1.15% |
