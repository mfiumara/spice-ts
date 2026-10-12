| cell | n | before median (min) ms | after median (min) ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 49.7 (42.8) | 50.0 (40.6) | 0.99x | 1.01x (0.99..1.05) | yes 7078cf1f8c716e96, 120 pts |
| rc-ladder-tran:10000 | 7 | 251 (196) | 256 (200) | 0.98x | 0.98x (0.96..1.03) | yes cb1d69812d5b92ef, 120 pts |
| rc-ladder-tran:50000 | 7 | 1320 (1086) | 1336 (1115) | 0.99x | 1.00x (0.97..1.01) | yes 5b7b4454e6c6b4e3, 120 pts |
| resistor-mesh-op:1000 | 7 | 20.6 (17.7) | 20.3 (17.4) | 1.01x | 1.01x (0.98..1.07) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 7 | 158 (139) | 154 (136) | 1.03x | 1.02x (0.96..1.08) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 7 | 989 (905) | 848 (770) | 1.17x | 1.14x (1.10..1.27) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 7 | 259 (248) | 258 (253) | 1.01x | 1.00x (0.97..1.03) | yes 738edd20417aceea, 214 pts |
| cmos-inverter-chain-tran:10000 | 7 | 2660 (2560) | 2622 (2563) | 1.01x | 1.00x (0.99..1.02) | yes acfddde8bb961bcf, 214 pts |

| cell | n | before median (min) CPU ms | after median (min) CPU ms | median speedup | paired ratio median (min..max) | hash identical |
|---|---:|---:|---:|---:|---:|---|
| rc-ladder-tran:1000 | 7 | 162 (138) | 164 (138) | 0.99x | 0.99x (0.98..1.00) | yes 7078cf1f8c716e96, 120 pts |
| rc-ladder-tran:10000 | 7 | 489 (369) | 494 (373) | 0.99x | 0.99x (0.93..1.03) | yes cb1d69812d5b92ef, 120 pts |
| rc-ladder-tran:50000 | 7 | 1998 (1590) | 2016 (1721) | 0.99x | 1.01x (0.92..1.04) | yes 5b7b4454e6c6b4e3, 120 pts |
| resistor-mesh-op:1000 | 7 | 57.4 (50.7) | 56.6 (49.4) | 1.01x | 1.02x (0.99..1.08) | yes cc196ac698927bd3, 1 pts |
| resistor-mesh-op:10000 | 7 | 278 (242) | 272 (235) | 1.02x | 1.02x (0.96..1.06) | yes 73da68241f2c6ad6, 1 pts |
| resistor-mesh-op:50000 | 7 | 1375 (1268) | 1245 (1126) | 1.11x | 1.12x (1.06..1.18) | yes 2cc3802569b2f6af, 1 pts |
| cmos-inverter-chain-tran:1000 | 7 | 451 (432) | 444 (442) | 1.02x | 1.00x (0.97..1.04) | yes 738edd20417aceea, 214 pts |
| cmos-inverter-chain-tran:10000 | 7 | 3064 (2958) | 3021 (2979) | 1.01x | 1.00x (0.99..1.02) | yes acfddde8bb961bcf, 214 pts |
