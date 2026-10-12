| deck | nodes | spice-ts total before / after | spice-ts analysis before / after | ngspice KLU wall before / after run | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run | probe identical |
|---|---:|---:|---:|---:|---:|---:|---|
| rc-ladder-tran | 1,000 | 20.7 ms / 23.0 ms | 17.4 ms / 19.9 ms | 25.8 ms / 30.6 ms | 10.6 ms / 12.7 ms | 1.57x | yes |
| rc-ladder-tran | 10,000 | 227 ms / 216 ms | 189 ms / 183 ms | 195 ms / 197 ms | 138 ms / 140 ms | 1.31x | yes |
| rc-ladder-tran | 50,000 | 1.09 s / 1.20 s | 977 ms / 1.07 s | 1.54 s / 1.27 s | 1.27 s / 1.07 s | 1.00x | yes |
| resistor-mesh-op | 1,024 | 14.3 ms / 12.9 ms | 9.4 ms / 8.9 ms | 22.1 ms / 23.9 ms | 2.7 ms / 3.1 ms | 2.88x | yes |
| resistor-mesh-op | 10,000 | 140 ms / 131 ms | 109 ms / 106 ms | 130 ms / 124 ms | 45.0 ms / 43.3 ms | 2.44x | yes |
| resistor-mesh-op | 50,176 | 847 ms / 942 ms | 713 ms / 793 ms | 793 ms / 734 ms | 429 ms / 393 ms | 2.02x | yes |
| cmos-inverter-chain-tran | 1,000 | 207 ms / 245 ms | 203 ms / 240 ms | 182 ms / 198 ms | 158 ms / 170 ms | 1.41x | yes |
| cmos-inverter-chain-tran | 10,000 | 2.52 s / 3.03 s | 2.47 s / 2.97 s | 3.50 s / 5.01 s | 3.38 s / 4.80 s | 0.62x | yes |
| cmos-inverter-chain-tran | 50,000 | 49.36 s / 47.48 s | 49.06 s / 47.09 s | 62.21 s / 59.17 s | 61.43 s / 58.45 s | 0.81x | yes |
