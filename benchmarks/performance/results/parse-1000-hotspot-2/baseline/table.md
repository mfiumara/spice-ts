# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran-1000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 173.714 / 33.150 | 183.564 / 40.588 | 110.822 / 18.248 |
| import | 23.084 / 3.123 | 24.311 / 2.422 | 4.024 / 0.234 |
| deckRead | 0.421 / 0.066 | 0.425 / 0.065 | 0.323 / 0.026 |
| parse | 16.003 / 1.598 | 19.066 / 2.228 | 2.587 / 0.244 |
| parseEqualityHash | 1.330 / 0.169 | 1.406 / 0.103 | not separately available |
| simulate | 59.174 / 6.204 | 59.321 / 4.661 | not separately available |
| outputHash | 4.496 / 1.095 | 4.553 / 0.767 | 0.572 / 0.033 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.115 / 0.010 |
| loadStamp | not separately available | not separately available | 3.753 / 0.270 |
| factor | not separately available | not separately available | 3.138 / 0.287 |
| solve | not separately available | not separately available | 2.776 / 0.228 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 45.149 / 3.563 | 46.554 / 4.497 | 47.049 / 2.865 |
| exit | 18.664 / 34.005 | 30.762 / 21.934 | 16.354 / 25.562 |
| preprocess | not separately available | 3.517 / 0.383 | not separately available |
| numparam | not separately available | 7.827 / 0.719 | not separately available |
| tokenize | not separately available | 1.547 / 0.170 | not separately available |
| cardParse | not separately available | 4.890 / 0.618 | not separately available |
| assembly | not separately available | 0.696 / 0.057 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.037 / 0.006 | not separately available |
| numparam.cardEnd | not separately available | 0.900 / 0.172 | not separately available |
| numparam.collectParamFrames | not separately available | 0.959 / 0.236 | not separately available |
| numparam.braceTokens | not separately available | 2.732 / 0.637 | not separately available |
| numparam.braceBareParameters | not separately available | 1.378 / 0.296 | not separately available |
| numparam.circuitTemperature | not separately available | 0.329 / 0.050 | not separately available |
| numparam.createParamScopes | not separately available | 0.009 / 0.002 | not separately available |
| numparam.measureName | not separately available | 0.137 / 0.014 | not separately available |
| numparam.substituteStatement | not separately available | 1.336 / 0.138 | not separately available |
| tokenize.tokenizeLine | not separately available | 0.492 / 0.175 | not separately available |
| cardParse.parseNumber | not separately available | 0.857 / 0.197 | not separately available |
| parseResidual | not separately available | 0.645 / 0.083 | not separately available |
| nativeWall | not separately available | not separately available | 35.688 / 2.349 |

Control parent wall / direct native wall = 4.868x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 1.92% |
| numparam | 4.26% |
| tokenize | 0.84% |
| cardParse | 2.66% |
| assembly | 0.38% |
| parseResidual | 0.35% |

## resistor-mesh-op-1000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 170.302 / 50.379 | 146.077 / 28.549 | 107.205 / 27.820 |
| import | 24.221 / 3.068 | 23.582 / 2.355 | 4.023 / 0.470 |
| deckRead | 0.451 / 0.041 | 0.445 / 0.053 | 0.352 / 0.038 |
| parse | 15.508 / 2.348 | 19.406 / 2.230 | 2.952 / 0.351 |
| parseEqualityHash | 1.425 / 0.196 | 1.519 / 0.247 | not separately available |
| simulate | 33.466 / 2.770 | 32.513 / 2.910 | not separately available |
| outputHash | 1.346 / 0.111 | 1.256 / 0.099 | 0.101 / 0.018 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 0.666 / 0.047 |
| loadStamp | not separately available | not separately available | 0.058 / 0.007 |
| factor | not separately available | not separately available | 0.149 / 0.009 |
| solve | not separately available | not separately available | 0.055 / 0.004 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.387 / 2.940 | 46.123 / 4.630 | 46.882 / 4.936 |
| exit | 43.701 / 49.243 | 21.913 / 20.328 | 31.384 / 28.093 |
| preprocess | not separately available | 3.517 / 0.431 | not separately available |
| numparam | not separately available | 8.151 / 0.858 | not separately available |
| tokenize | not separately available | 1.276 / 0.084 | not separately available |
| cardParse | not separately available | 5.102 / 0.575 | not separately available |
| assembly | not separately available | 0.709 / 0.047 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.039 / 0.006 | not separately available |
| numparam.cardEnd | not separately available | 1.004 / 0.246 | not separately available |
| numparam.collectParamFrames | not separately available | 0.879 / 0.184 | not separately available |
| numparam.braceTokens | not separately available | 3.055 / 0.421 | not separately available |
| numparam.braceBareParameters | not separately available | 1.416 / 0.202 | not separately available |
| numparam.circuitTemperature | not separately available | 0.318 / 0.017 | not separately available |
| numparam.createParamScopes | not separately available | 0.008 / 0.002 | not separately available |
| numparam.measureName | not separately available | 0.135 / 0.006 | not separately available |
| numparam.substituteStatement | not separately available | 1.378 / 0.143 | not separately available |
| tokenize.tokenizeLine | not separately available | 0.406 / 0.029 | not separately available |
| cardParse.parseNumber | not separately available | 0.991 / 0.318 | not separately available |
| parseResidual | not separately available | 0.648 / 0.058 | not separately available |
| nativeWall | not separately available | not separately available | 23.873 / 2.855 |

Control parent wall / direct native wall = 7.134x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 2.41% |
| numparam | 5.58% |
| tokenize | 0.87% |
| cardParse | 3.49% |
| assembly | 0.49% |
| parseResidual | 0.44% |

## rc-ladder-tran-10000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 510.503 / 56.505 | 525.819 / 21.151 | 303.898 / 45.539 |
| import | 24.631 / 3.188 | 25.286 / 0.695 | 4.092 / 0.345 |
| deckRead | 0.770 / 0.112 | 0.758 / 0.077 | 0.694 / 0.063 |
| parse | 81.988 / 4.921 | 101.381 / 3.596 | 25.779 / 1.899 |
| parseEqualityHash | 10.974 / 1.013 | 11.166 / 0.801 | not separately available |
| simulate | 288.475 / 14.441 | 291.814 / 10.383 | not separately available |
| outputHash | 25.313 / 0.881 | 24.761 / 0.695 | 5.130 / 0.274 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.147 / 0.086 |
| loadStamp | not separately available | not separately available | 42.877 / 5.728 |
| factor | not separately available | not separately available | 33.495 / 2.898 |
| solve | not separately available | not separately available | 31.141 / 2.232 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.349 / 2.048 | 48.484 / 1.879 | 48.458 / 3.213 |
| exit | 38.140 / 23.558 | 23.447 / 13.924 | 34.106 / 29.458 |
| preprocess | not separately available | 21.566 / 0.295 | not separately available |
| numparam | not separately available | 36.726 / 2.467 | not separately available |
| tokenize | not separately available | 10.325 / 0.309 | not separately available |
| cardParse | not separately available | 21.897 / 2.319 | not separately available |
| assembly | not separately available | 5.520 / 2.804 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.050 / 0.008 | not separately available |
| numparam.cardEnd | not separately available | 3.212 / 0.211 | not separately available |
| numparam.collectParamFrames | not separately available | 4.442 / 0.418 | not separately available |
| numparam.braceTokens | not separately available | 12.456 / 0.793 | not separately available |
| numparam.braceBareParameters | not separately available | 7.054 / 0.805 | not separately available |
| numparam.circuitTemperature | not separately available | 1.722 / 0.075 | not separately available |
| numparam.createParamScopes | not separately available | 0.013 / 0.003 | not separately available |
| numparam.measureName | not separately available | 1.118 / 0.503 | not separately available |
| numparam.substituteStatement | not separately available | 6.268 / 0.470 | not separately available |
| tokenize.tokenizeLine | not separately available | 4.683 / 0.192 | not separately available |
| cardParse.parseNumber | not separately available | 4.146 / 1.270 | not separately available |
| parseResidual | not separately available | 4.337 / 0.245 | not separately available |
| nativeWall | not separately available | not separately available | 213.861 / 20.273 |

Control parent wall / direct native wall = 2.387x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 4.10% |
| numparam | 6.98% |
| tokenize | 1.96% |
| cardParse | 4.16% |
| assembly | 1.05% |
| parseResidual | 0.82% |

## resistor-mesh-op-10000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 373.005 / 39.425 | 388.269 / 29.102 | 193.052 / 13.923 |
| import | 24.398 / 2.386 | 25.049 / 1.127 | 4.066 / 0.424 |
| deckRead | 0.853 / 0.104 | 0.857 / 0.071 | 0.738 / 0.073 |
| parse | 85.482 / 7.518 | 103.016 / 4.169 | 27.317 / 1.777 |
| parseEqualityHash | 11.120 / 1.114 | 10.136 / 0.172 | not separately available |
| simulate | 162.963 / 10.069 | 161.921 / 6.312 | not separately available |
| outputHash | 7.173 / 0.876 | 6.748 / 1.096 | 0.167 / 0.012 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 18.930 / 1.569 |
| loadStamp | not separately available | not separately available | 0.679 / 0.096 |
| factor | not separately available | not separately available | 6.338 / 0.484 |
| solve | not separately available | not separately available | 0.839 / 0.074 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.540 / 4.024 | 47.812 / 1.963 | 47.937 / 2.796 |
| exit | 34.952 / 23.585 | 26.950 / 13.439 | 27.904 / 16.373 |
| preprocess | not separately available | 20.891 / 1.841 | not separately available |
| numparam | not separately available | 38.747 / 1.870 | not separately available |
| tokenize | not separately available | 10.331 / 0.289 | not separately available |
| cardParse | not separately available | 24.007 / 1.153 | not separately available |
| assembly | not separately available | 4.793 / 0.389 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.049 / 0.005 | not separately available |
| numparam.cardEnd | not separately available | 3.471 / 0.427 | not separately available |
| numparam.collectParamFrames | not separately available | 4.286 / 0.391 | not separately available |
| numparam.braceTokens | not separately available | 13.548 / 0.897 | not separately available |
| numparam.braceBareParameters | not separately available | 6.851 / 0.712 | not separately available |
| numparam.circuitTemperature | not separately available | 1.637 / 0.091 | not separately available |
| numparam.createParamScopes | not separately available | 0.011 / 0.001 | not separately available |
| numparam.measureName | not separately available | 1.063 / 0.163 | not separately available |
| numparam.substituteStatement | not separately available | 7.229 / 0.269 | not separately available |
| tokenize.tokenizeLine | not separately available | 4.819 / 1.009 | not separately available |
| cardParse.parseNumber | not separately available | 4.031 / 0.746 | not separately available |
| parseResidual | not separately available | 4.192 / 0.205 | not separately available |
| nativeWall | not separately available | not separately available | 108.080 / 8.516 |

Control parent wall / direct native wall = 3.451x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 5.38% |
| numparam | 9.98% |
| tokenize | 2.66% |
| cardParse | 6.18% |
| assembly | 1.23% |
| parseResidual | 1.08% |

## rc-ladder-tran-50000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1665.283 / 97.678 | 1738.023 / 123.389 | 1407.045 / 314.351 |
| import | 23.615 / 3.080 | 24.184 / 2.330 | 4.088 / 0.548 |
| deckRead | 2.231 / 0.306 | 2.298 / 0.123 | 2.158 / 0.167 |
| parse | 280.291 / 22.782 | 342.988 / 25.695 | 125.947 / 9.260 |
| parseEqualityHash | 49.332 / 3.604 | 50.242 / 3.380 | not separately available |
| simulate | 1115.967 / 93.260 | 1115.205 / 76.718 | not separately available |
| outputHash | 107.212 / 9.610 | 108.957 / 2.999 | 23.483 / 1.921 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 5.521 / 0.480 |
| loadStamp | not separately available | not separately available | 293.978 / 148.308 |
| factor | not separately available | not separately available | 159.421 / 8.241 |
| solve | not separately available | not separately available | 124.602 / 9.640 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 44.952 / 3.368 | 46.574 / 2.735 | 47.668 / 2.881 |
| exit | 32.730 / 15.025 | 33.159 / 38.727 | 16.542 / 42.673 |
| preprocess | not separately available | 66.141 / 4.251 | not separately available |
| numparam | not separately available | 135.557 / 8.900 | not separately available |
| tokenize | not separately available | 41.372 / 4.620 | not separately available |
| cardParse | not separately available | 64.224 / 6.805 | not separately available |
| assembly | not separately available | 20.983 / 2.263 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.050 / 0.006 | not separately available |
| numparam.cardEnd | not separately available | 10.100 / 0.893 | not separately available |
| numparam.collectParamFrames | not separately available | 10.266 / 0.898 | not separately available |
| numparam.braceTokens | not separately available | 60.104 / 2.290 | not separately available |
| numparam.braceBareParameters | not separately available | 23.891 / 5.293 | not separately available |
| numparam.circuitTemperature | not separately available | 5.647 / 0.663 | not separately available |
| numparam.createParamScopes | not separately available | 0.013 / 0.001 | not separately available |
| numparam.measureName | not separately available | 3.168 / 0.624 | not separately available |
| numparam.substituteStatement | not separately available | 23.297 / 2.105 | not separately available |
| tokenize.tokenizeLine | not separately available | 21.991 / 2.174 | not separately available |
| cardParse.parseNumber | not separately available | 12.663 / 1.345 | not separately available |
| parseResidual | not separately available | 15.177 / 1.557 | not separately available |
| nativeWall | not separately available | not separately available | 1270.785 / 287.325 |

Control parent wall / direct native wall = 1.310x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 3.81% |
| numparam | 7.80% |
| tokenize | 2.38% |
| cardParse | 3.70% |
| assembly | 1.21% |
| parseResidual | 0.87% |

## resistor-mesh-op-50000

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 1162.803 / 58.333 | 1221.175 / 61.268 | 768.223 / 47.463 |
| import | 23.991 / 3.059 | 23.635 / 2.529 | 4.212 / 0.527 |
| deckRead | 2.745 / 0.253 | 2.782 / 0.263 | 2.697 / 0.248 |
| parse | 293.711 / 23.457 | 364.019 / 29.633 | 132.502 / 7.532 |
| parseEqualityHash | 50.380 / 4.359 | 51.758 / 6.501 | not separately available |
| simulate | 677.976 / 45.012 | 666.406 / 48.726 | not separately available |
| outputHash | 31.428 / 2.594 | 32.467 / 2.904 | 0.472 / 0.034 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 226.486 / 16.948 |
| loadStamp | not separately available | not separately available | 3.351 / 1.290 |
| factor | not separately available | not separately available | 86.459 / 7.546 |
| solve | not separately available | not separately available | 7.775 / 0.437 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 46.138 / 4.253 | 47.535 / 3.512 | 48.389 / 3.340 |
| exit | 41.019 / 47.257 | 29.077 / 36.301 | 58.317 / 51.404 |
| preprocess | not separately available | 65.607 / 3.971 | not separately available |
| numparam | not separately available | 149.412 / 12.394 | not separately available |
| tokenize | not separately available | 41.387 / 3.558 | not separately available |
| cardParse | not separately available | 65.910 / 4.751 | not separately available |
| assembly | not separately available | 25.668 / 3.060 | not separately available |
| numparam.expandFunctionCalls | not separately available | 0.051 / 0.005 | not separately available |
| numparam.cardEnd | not separately available | 10.339 / 4.195 | not separately available |
| numparam.collectParamFrames | not separately available | 10.470 / 0.797 | not separately available |
| numparam.braceTokens | not separately available | 68.879 / 8.258 | not separately available |
| numparam.braceBareParameters | not separately available | 22.804 / 1.844 | not separately available |
| numparam.circuitTemperature | not separately available | 5.129 / 0.338 | not separately available |
| numparam.createParamScopes | not separately available | 0.013 / 0.002 | not separately available |
| numparam.measureName | not separately available | 3.599 / 1.143 | not separately available |
| numparam.substituteStatement | not separately available | 25.814 / 2.130 | not separately available |
| tokenize.tokenizeLine | not separately available | 19.526 / 4.808 | not separately available |
| cardParse.parseNumber | not separately available | 10.520 / 1.120 | not separately available |
| parseResidual | not separately available | 14.825 / 1.797 | not separately available |
| nativeWall | not separately available | not separately available | 660.747 / 51.412 |

Control parent wall / direct native wall = 1.760x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 5.37% |
| numparam | 12.24% |
| tokenize | 3.39% |
| cardParse | 5.40% |
| assembly | 2.10% |
| parseResidual | 1.21% |
