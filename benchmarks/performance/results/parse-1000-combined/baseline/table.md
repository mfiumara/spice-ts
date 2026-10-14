# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 697.670 / 43.380 | 704.186 / 68.871 | 427.231 / 50.257 |
| import | 33.048 / 3.724 | 33.808 / 3.758 | 6.604 / 1.519 |
| deckRead | 0.984 / 0.179 | 1.131 / 0.198 | 0.925 / 0.140 |
| parse | 112.621 / 11.857 | 130.055 / 13.645 | 32.509 / 3.869 |
| parseEqualityHash | 15.736 / 1.564 | 15.802 / 1.592 | not separately available |
| simulate | 410.083 / 42.946 | 406.650 / 42.907 | not separately available |
| outputHash | 32.798 / 3.050 | 35.048 / 5.952 | 6.723 / 1.631 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.433 / 0.046 |
| loadStamp | not separately available | not separately available | 68.516 / 13.065 |
| factor | not separately available | not separately available | 42.090 / 3.319 |
| solve | not separately available | not separately available | 38.459 / 2.966 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 60.769 / 3.926 | 66.873 / 10.084 | 61.892 / 5.370 |
| exit | 37.982 / 18.999 | 21.984 / 13.690 | 26.128 / 14.176 |
| preprocess | not separately available | 29.811 / 3.446 | not separately available |
| numparam | not separately available | 40.169 / 7.287 | not separately available |
| tokenize | not separately available | 11.494 / 2.137 | not separately available |
| cardParse | not separately available | 31.529 / 5.712 | not separately available |
| assembly | not separately available | 8.531 / 3.389 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.072 / 0.011 | not separately available |
| numparam.braceBareParameters | not separately available | 26.786 / 4.347 | not separately available |
| numparam.circuitTemperature | not separately available | 2.862 / 0.169 | not separately available |
| numparam.createParamScopes | not separately available | 0.013 / 0.002 | not separately available |
| numparam.measureName | not separately available | 1.622 / 0.183 | not separately available |
| numparam.substituteStatement | not separately available | 8.536 / 1.604 | not separately available |
| parseResidual | not separately available | 5.731 / 0.823 | not separately available |
| nativeWall | not separately available | not separately available | 320.553 / 29.768 |

Control parent wall / direct native wall = 2.176x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 4.23% |
| numparam | 5.70% |
| tokenize | 1.63% |
| cardParse | 4.48% |
| assembly | 1.21% |
| parseResidual | 0.81% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 490.676 / 122.856 | 511.067 / 129.513 | 246.224 / 24.313 |
| import | 32.212 / 5.107 | 34.167 / 4.108 | 6.080 / 0.698 |
| deckRead | 1.094 / 0.140 | 1.154 / 0.203 | 0.995 / 0.166 |
| parse | 114.553 / 16.443 | 130.537 / 20.836 | 34.761 / 4.045 |
| parseEqualityHash | 15.107 / 1.842 | 16.242 / 2.216 | not separately available |
| simulate | 228.885 / 70.277 | 232.043 / 44.533 | not separately available |
| outputHash | 9.436 / 1.038 | 9.428 / 1.818 | 0.230 / 0.052 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 25.009 / 2.891 |
| loadStamp | not separately available | not separately available | 1.013 / 0.274 |
| factor | not separately available | not separately available | 8.656 / 2.369 |
| solve | not separately available | not separately available | 1.304 / 0.359 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 63.114 / 11.990 | 64.860 / 10.119 | 60.940 / 2.897 |
| exit | 33.910 / 18.669 | 34.847 / 19.044 | 30.004 / 18.582 |
| preprocess | not separately available | 30.910 / 2.426 | not separately available |
| numparam | not separately available | 44.542 / 7.979 | not separately available |
| tokenize | not separately available | 8.907 / 1.869 | not separately available |
| cardParse | not separately available | 27.183 / 7.055 | not separately available |
| assembly | not separately available | 10.712 / 2.540 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.075 / 0.008 | not separately available |
| numparam.braceBareParameters | not separately available | 30.572 / 4.464 | not separately available |
| numparam.circuitTemperature | not separately available | 2.352 / 0.254 | not separately available |
| numparam.createParamScopes | not separately available | 0.014 / 0.002 | not separately available |
| numparam.measureName | not separately available | 1.635 / 0.477 | not separately available |
| numparam.substituteStatement | not separately available | 9.999 / 0.788 | not separately available |
| parseResidual | not separately available | 5.810 / 0.754 | not separately available |
| nativeWall | not separately available | not separately available | 143.702 / 10.225 |

Control parent wall / direct native wall = 3.415x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 6.05% |
| numparam | 8.72% |
| tokenize | 1.74% |
| cardParse | 5.32% |
| assembly | 2.10% |
| parseResidual | 1.14% |
