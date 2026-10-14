# #1000 parser fixed ten-round attribution

All times ms, median / IQR (linear interpolation). No samples trimmed.

## rc-ladder-tran

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 505.579 / 48.918 | 530.826 / 51.141 | 317.838 / 49.208 |
| import | 23.339 / 0.580 | 23.579 / 0.799 | 4.132 / 0.178 |
| deckRead | 0.761 / 0.049 | 0.763 / 0.044 | 0.661 / 0.027 |
| parse | 81.851 / 2.392 | 90.360 / 2.151 | 26.148 / 0.491 |
| parseEqualityHash | 10.767 / 0.226 | 10.903 / 0.298 | not separately available |
| simulate | 295.374 / 10.484 | 290.329 / 16.559 | not separately available |
| outputHash | 24.495 / 0.600 | 24.989 / 2.779 | 5.114 / 0.098 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 1.149 / 0.009 |
| loadStamp | not separately available | not separately available | 43.433 / 3.213 |
| factor | not separately available | not separately available | 33.579 / 0.494 |
| solve | not separately available | not separately available | 31.329 / 0.343 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 52.425 / 1.838 | 53.391 / 2.249 | 54.167 / 2.241 |
| exit | 20.186 / 26.707 | 38.675 / 35.670 | 31.597 / 67.373 |
| preprocess | not separately available | 19.730 / 0.487 | not separately available |
| numparam | not separately available | 30.377 / 0.821 | not separately available |
| tokenize | not separately available | 8.619 / 0.514 | not separately available |
| cardParse | not separately available | 21.902 / 1.110 | not separately available |
| assembly | not separately available | 4.757 / 0.658 | not separately available |
| parseResidual | not separately available | 4.342 / 0.134 | not separately available |
| nativeWall | not separately available | not separately available | 213.501 / 4.656 |

Control parent wall / direct native wall = 2.368x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 3.72% |
| numparam | 5.72% |
| tokenize | 1.62% |
| cardParse | 4.13% |
| assembly | 0.90% |
| parseResidual | 0.82% |

## resistor-mesh-op

| Phase | Unchanged control | Instrumented copy | ngspice wrapper |
|---|---:|---:|---:|
| wall | 403.447 / 38.461 | 404.464 / 34.362 | 215.901 / 37.217 |
| import | 23.399 / 0.580 | 23.389 / 0.186 | 4.278 / 0.380 |
| deckRead | 0.810 / 0.042 | 0.820 / 0.039 | 0.736 / 0.033 |
| parse | 84.834 / 1.805 | 94.286 / 2.527 | 27.830 / 1.448 |
| parseEqualityHash | 11.073 / 0.270 | 10.256 / 0.441 | not separately available |
| simulate | 165.038 / 5.707 | 164.161 / 13.783 | not separately available |
| outputHash | 7.619 / 0.627 | 7.384 / 0.662 | 0.170 / 0.013 |
| compile | not separately available | not separately available | not separately available |
| matrixBuild | not separately available | not separately available | not separately available |
| ordering | not separately available | not separately available | 19.077 / 0.104 |
| loadStamp | not separately available | not separately available | 0.724 / 0.221 |
| factor | not separately available | not separately available | 6.334 / 0.091 |
| solve | not separately available | not separately available | 0.866 / 0.047 |
| outputMaterialization | not separately available | not separately available | not separately available |
| spawnFirstUserCode | 55.121 / 3.868 | 53.269 / 2.748 | 54.113 / 2.439 |
| exit | 43.390 / 43.341 | 57.884 / 44.473 | 43.073 / 31.198 |
| preprocess | not separately available | 19.580 / 0.787 | not separately available |
| numparam | not separately available | 33.066 / 0.927 | not separately available |
| tokenize | not separately available | 6.626 / 0.050 | not separately available |
| cardParse | not separately available | 24.970 / 0.579 | not separately available |
| assembly | not separately available | 5.359 / 0.400 | not separately available |
| parseResidual | not separately available | 4.320 / 0.264 | not separately available |
| nativeWall | not separately available | not separately available | 107.468 / 4.394 |

Control parent wall / direct native wall = 3.754x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.

| Instrumented exclusive phase | % of instrumented parent wall |
|---|---:|
| preprocess | 4.84% |
| numparam | 8.18% |
| tokenize | 1.64% |
| cardParse | 6.17% |
| assembly | 1.32% |
| parseResidual | 1.07% |
