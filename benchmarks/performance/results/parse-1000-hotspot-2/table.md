# Rejected copy-on-write auto-bracing experiment

Times ms, median / IQR. Linear rows have ten interleaved cold rounds.

| Deck | Before parse | Candidate parse | Reduction | Before wall | Candidate wall | Native wall | Before/native | Candidate/native |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 16.292 / 1.804 | 16.121 / 1.687 | 1.047% | 200.719 / 26.929 | 199.748 / 34.372 | 35.843 / 3.293 | 5.600x | 5.573x |
| resistor-mesh-op-1000 | 16.301 / 1.036 | 15.771 / 1.514 | 3.254% | 176.893 / 48.646 | 180.152 / 25.578 | 23.776 / 2.325 | 7.440x | 7.577x |
| rc-ladder-tran-10000 | 84.310 / 8.251 | 80.170 / 5.446 | 4.911% | 504.906 / 21.548 | 512.627 / 34.854 | 215.480 / 24.298 | 2.343x | 2.379x |
| resistor-mesh-op-10000 | 82.799 / 10.295 | 77.006 / 11.290 | 6.997% | 379.498 / 52.564 | 367.808 / 44.362 | 109.082 / 15.201 | 3.479x | 3.372x |
| rc-ladder-tran-50000 | 280.259 / 30.182 | 266.236 / 18.269 | 5.004% | 1684.430 / 155.140 | 1708.504 / 105.372 | 1237.894 / 360.492 | 1.361x | 1.380x |
| resistor-mesh-op-50000 | 295.922 / 23.560 | 275.783 / 21.647 | 6.806% | 1165.539 / 92.837 | 1156.557 / 89.138 | 696.709 / 39.847 | 1.673x | 1.660x |

CMOS parse rows have ten interleaved cold parse-only rounds. Full-wall columns have ONE cold sample, not medians/IQRs. CMOS50k native was censored at 30s; no ratio/ranking is inferred.

| cmos-inverter-chain-tran-1000 | 19.725 / 3.495 | 19.514 / 2.506 | 1.071% | 344.372 (n=1) | 355.054 (n=1) | 220.575 (n=1) | 1.561x | 1.610x |
| cmos-inverter-chain-tran-10000 | 102.463 / 16.485 | 101.412 / 14.085 | 1.026% | 2684.165 (n=1) | 3155.288 (n=1) | 4627.973 (n=1) | 0.580x | 0.682x |
| cmos-inverter-chain-tran-50000 | 417.995 / 37.507 | 397.734 / 47.931 | 4.847% | 18957.585 (n=1) | 18465.706 (n=1) | deadline 30s, no complete receipt | censored | censored |

## Newly split leaf attribution

Instrumented copies, not optimisation gate timings. Exclusive leaf clocks include per-call instrumentation overhead. Totals are not additive medians.

| Deck | braceTokens | collectParamFrames | cardEnd | parseNumber | tokenizeLine |
|---|---:|---:|---:|---:|---:|
| rc-ladder-tran-1000 | 2.732 / 0.637 | 0.959 / 0.236 | 0.900 / 0.172 | 0.857 / 0.197 | 0.492 / 0.175 |
| resistor-mesh-op-1000 | 3.055 / 0.421 | 0.879 / 0.184 | 1.004 / 0.246 | 0.991 / 0.318 | 0.406 / 0.029 |
| rc-ladder-tran-10000 | 12.456 / 0.793 | 4.442 / 0.418 | 3.212 / 0.211 | 4.146 / 1.270 | 4.683 / 0.192 |
| resistor-mesh-op-10000 | 13.548 / 0.897 | 4.286 / 0.391 | 3.471 / 0.427 | 4.031 / 0.746 | 4.819 / 1.009 |
| rc-ladder-tran-50000 | 60.104 / 2.290 | 10.266 / 0.898 | 10.100 / 0.893 | 12.663 / 1.345 | 21.991 / 2.174 |
| resistor-mesh-op-50000 | 68.879 / 8.258 | 10.470 / 0.797 | 10.339 / 4.195 | 10.520 / 1.120 | 19.526 / 4.808 |
| cmos-inverter-chain-tran-1000 | 1.572 / 0.418 | 1.148 / 0.116 | 0.959 / 0.280 | 1.962 / 0.681 | 1.604 / 0.356 |
| cmos-inverter-chain-tran-10000 | 6.086 / 1.457 | 5.477 / 1.130 | 3.472 / 0.869 | 7.911 / 1.425 | 17.760 / 5.537 |
| cmos-inverter-chain-tran-50000 | 27.139 / 2.843 | 14.131 / 1.345 | 10.378 / 1.058 | 28.655 / 38.004 | 60.934 / 8.303 |
