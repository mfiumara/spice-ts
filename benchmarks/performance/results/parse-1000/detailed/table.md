# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 538.043 / 46.700 | 554.432 / 14.197 | 337.589 / 26.637 |
| import | 25.094 / 1.837 | 25.756 / 1.124 | 4.577 / 0.454 |
| deckRead | 0.808 / 0.093 | 0.826 / 0.050 | 0.788 / 0.073 |
| parse | 86.391 / 9.729 | 100.476 / 7.050 | 29.419 / 2.351 |
| parseEqualityHash | 11.444 / 1.221 | 12.321 / 1.081 | not separately available |
| simulate | 309.946 / 14.461 | 316.766 / 9.644 | not separately available |
| outputHash | 27.259 / 0.797 | 26.877 / 1.220 | 5.341 / 0.518 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.259 / 0.129 |
| loadStamp | not separately available | not separately available | 47.755 / 4.821 |
| factor | not separately available | not separately available | 35.960 / 3.172 |
| solve | not separately available | not separately available | 33.389 / 2.825 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 55.158 / 3.884 | 58.138 / 4.475 | 58.012 / 2.850 |
| exit | 41.161 / 31.454 | 18.099 / 21.623 | 43.671 / 29.042 |
| preprocess | not separately available | 23.005 / 2.517 | not separately available |
| numparam | not separately available | 33.861 / 4.026 | not separately available |
| tokenize | not separately available | 9.400 / 0.320 | not separately available |
| cardParse | not separately available | 23.262 / 3.443 | not separately available |
| assembly | not separately available | 5.985 / 2.212 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.050 / 0.004 | not separately available |
| numparam.braceBareParameters | not separately available | 22.562 / 3.029 | not separately available |
| numparam.circuitTemperature | not separately available | 1.885 / 0.218 | not separately available |
| numparam.createParamScopes | not separately available | 0.011 / 0.003 | not separately available |
| numparam.measureName | not separately available | 1.321 / 0.341 | not separately available |
| numparam.substituteStatement | not separately available | 7.375 / 0.877 | not separately available |
| parseResidual | not separately available | 4.725 / 0.332 | not separately available |
| nativeWall | not separately available | not separately available | 234.018 / 11.515 |

Control parent wall / direct native wall = 2.299x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 4.15% |
| numparam | 6.11% |
| tokenize | 1.70% |
| cardParse | 4.20% |
| assembly | 1.08% |
| parseResidual | 0.85% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 391.854 / 69.803 | 404.492 / 20.318 | 198.402 / 31.859 |
| import | 23.857 / 2.725 | 25.969 / 2.811 | 4.642 / 0.430 |
| deckRead | 0.810 / 0.135 | 0.873 / 0.084 | 0.812 / 0.036 |
| parse | 89.585 / 8.679 | 100.804 / 10.343 | 30.281 / 2.328 |
| parseEqualityHash | 11.938 / 0.574 | 11.318 / 0.966 | not separately available |
| simulate | 179.168 / 14.504 | 180.580 / 5.381 | not separately available |
| outputHash | 7.783 / 0.672 | 7.796 / 0.898 | 0.177 / 0.024 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 20.982 / 1.468 |
| loadStamp | not separately available | not separately available | 0.850 / 0.210 |
| factor | not separately available | not separately available | 6.992 / 0.768 |
| solve | not separately available | not separately available | 0.950 / 0.057 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 54.296 / 5.667 | 60.006 / 4.785 | 56.816 / 2.827 |
| exit | 31.616 / 37.997 | 20.380 / 16.684 | 28.193 / 23.661 |
| preprocess | not separately available | 21.085 / 2.450 | not separately available |
| numparam | not separately available | 35.221 / 3.588 | not separately available |
| tokenize | not separately available | 7.249 / 0.560 | not separately available |
| cardParse | not separately available | 25.466 / 3.212 | not separately available |
| assembly | not separately available | 5.315 / 0.466 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.050 / 0.008 | not separately available |
| numparam.braceBareParameters | not separately available | 23.415 / 2.806 | not separately available |
| numparam.circuitTemperature | not separately available | 1.883 / 0.222 | not separately available |
| numparam.createParamScopes | not separately available | 0.011 / 0.002 | not separately available |
| numparam.measureName | not separately available | 1.349 / 0.847 | not separately available |
| numparam.substituteStatement | not separately available | 8.116 / 0.828 | not separately available |
| parseResidual | not separately available | 4.406 / 0.679 | not separately available |
| nativeWall | not separately available | not separately available | 117.449 / 9.169 |

Control parent wall / direct native wall = 3.336x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 5.21% |
| numparam | 8.71% |
| tokenize | 1.79% |
| cardParse | 6.30% |
| assembly | 1.31% |
| parseResidual | 1.09% |
