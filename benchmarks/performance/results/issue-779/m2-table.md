| deck | nodes | spice-ts total before / after | spice-ts analysis before / after | ngspice KLU wall before / after run | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run | probe identical |
|---|---:|---:|---:|---:|---:|---:|---|
| rc-ladder-tran | 1,000 | 74.0 ms / 41.4 ms | 67.1 ms / 34.9 ms | 97.9 ms / 53.8 ms | 56.3 ms / 22.7 ms | 1.54x | yes |
| rc-ladder-tran | 10,000 | 637 ms / 333 ms | 550 ms / 283 ms | 470 ms / 369 ms | 376 ms / 276 ms | 1.03x | yes |
| rc-ladder-tran | 50,000 | 2.94 s / 1.65 s | 2.60 s / 1.45 s | 3.39 s / 1.13 s | 2.86 s / 883 ms | 1.65x | yes |
| resistor-mesh-op | 1,024 | 26.5 ms / 12.3 ms | 15.8 ms / 7.9 ms | 126 ms / 27.4 ms | 6.2 ms / 3.5 ms | 2.28x | yes |
| resistor-mesh-op | 10,000 | 352 ms / 177 ms | 250 ms / 142 ms | 217 ms / 172 ms | 77.7 ms / 61.3 ms | 2.32x | yes |
| resistor-mesh-op | 50,176 | 1.52 s / 1.28 s | 1.30 s / 1.07 s | 1.28 s / 1.07 s | 727 ms / 568 ms | 1.89x | yes |
| cmos-inverter-chain-tran | 1,000 | 398 ms / 340 ms | 390 ms / 333 ms | 420 ms / 269 ms | 367 ms / 237 ms | 1.40x | yes |
| cmos-inverter-chain-tran | 10,000 | 4.92 s / 4.11 s | 4.83 s / 4.01 s | 5.60 s / 5.90 s | 5.37 s / 5.71 s | 0.70x | yes |
| cmos-inverter-chain-tran | 50,000 | 40.62 s / 43.05 s | 40.32 s / 42.61 s | 57.32 s / 59.82 s | 56.72 s / 58.93 s | 0.72x | yes |
