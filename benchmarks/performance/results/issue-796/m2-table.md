| deck | nodes | spice-ts total before / after | spice-ts analysis before / after | ngspice KLU wall before / after run | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run | probe identical |
|---|---:|---:|---:|---:|---:|---:|---|
| rc-ladder-tran | 1,000 | 23.3 ms / 27.4 ms | 20.1 ms / 23.4 ms | 33.1 ms / 32.5 ms | 14.5 ms / 14.2 ms | 1.65x | yes |
| rc-ladder-tran | 10,000 | 227 ms / 230 ms | 192 ms / 192 ms | 181 ms / 205 ms | 127 ms / 147 ms | 1.31x | yes |
| rc-ladder-tran | 50,000 | 1.07 s / 1.15 s | 942 ms / 1.02 s | 1.07 s / 1.27 s | 872 ms / 1.04 s | 0.99x | yes |
| resistor-mesh-op | 1,024 | 11.4 ms / 12.9 ms | 7.7 ms / 10.1 ms | 20.9 ms / 24.7 ms | 2.7 ms / 3.1 ms | 3.28x | yes |
| resistor-mesh-op | 10,000 | 110 ms / 140 ms | 87.2 ms / 110 ms | 117 ms / 131 ms | 39.3 ms / 45.4 ms | 2.42x | yes |
| resistor-mesh-op | 50,176 | 887 ms / 855 ms | 738 ms / 694 ms | 712 ms / 784 ms | 388 ms / 422 ms | 1.65x | yes |
| cmos-inverter-chain-tran | 1,000 | 217 ms / 243 ms | 212 ms / 238 ms | 186 ms / 199 ms | 160 ms / 172 ms | 1.38x | yes |
| cmos-inverter-chain-tran | 10,000 | 3.53 s / 3.00 s | 3.47 s / 2.95 s | 6.73 s / 4.24 s | 6.50 s / 4.08 s | 0.72x | yes |
| cmos-inverter-chain-tran | 50,000 | 52.01 s / 37.93 s | 51.64 s / 37.62 s | 56.70 s / 61.49 s | 56.15 s / 60.77 s | 0.62x | yes |
