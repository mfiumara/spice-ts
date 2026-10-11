before fbbbe85 -> after ea5e664 (ngspice-47 reference)

| fixture | analysis | signal | before abs max | before abs RMS | before rel max | before rel RMS | after abs max | after abs RMS | after rel max | after rel RMS |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ngspice/mos-amplifier-transient | - | status | success | | | | unsupported | | | |
| ngspice/mos-amplifier-transient | tran | worst v(5) | 5.25 | 2.90 | 0.437 | 0.302 | not run | | | |
| ngspice/ltra-line-transient | tran | i(vdd) | 0.000261 | 0.0000315 | 1.00 | 0.163 | 0.000261 | 0.0000315 | 1.00 | 0.163 |
| ngspice/ltra-line-transient | tran | i(vs) | 0.00000250 | 5.72e-7 | 1.00 | 1.00 | 0.00000250 | 5.72e-7 | 1.00 | 1.00 |
| ngspice/ltra-line-transient | tran | v(168) | 7.82e-14 | 5.52e-15 | 2.20e-13 | 1.48e-14 | 7.82e-14 | 5.51e-15 | 2.19e-13 | 1.48e-14 |
| ngspice/ltra-line-transient | tran | v(2) | 0.0842 | 0.00981 | 0.498 | 0.0719 | 0.0842 | 0.00981 | 0.498 | 0.0719 |
| ngspice/ltra-line-transient | tran | v(3) | 0.0880 | 0.0159 | 0.927 | 0.174 | 0.0880 | 0.0159 | 0.927 | 0.174 |
| classic/bsim1-device-sweep | - | status | success | | | | unsupported | | | |
| classic/bsim1-device-sweep | dc | worst i(vds) | 0.000131 | 0.0000678 | 1.00 | 0.600 | not run | | | |
| classic/bsim2-device-sweep | - | status | success | | | | unsupported | | | |
| classic/bsim2-device-sweep | dc | worst i(vds) | 0.000240 | 0.000138 | 1.00 | 0.765 | not run | | | |
| classic/mos-amplifier | - | status | success | | | | unsupported | | | |
| classic/mos-amplifier | tran | worst v(5) | 5.25 | 2.90 | 0.437 | 0.302 | not run | | | |
| classic/mos-memory-cell | tran | i(vdd) | 0.000168 | 0.0000191 | 172 | 14.0 | 0.0000931 | 0.0000149 | 164 | 13.3 |
| classic/mos-memory-cell | tran | i(vs) | 0.0124 | 0.00107 | 1.18 | 0.430 | 0.00852 | 0.000727 | 1.01 | 0.271 |
| classic/mos-memory-cell | tran | i(vw) | 0.0272 | 0.00307 | 1.78 | 0.569 | 0.0272 | 0.00307 | 1.79 | 0.385 |
| classic/mos-memory-cell | tran | i(vwb) | 0.0351 | 0.00384 | 1.00 | 0.267 | 0.0351 | 0.00384 | 1.02 | 0.192 |
| classic/mos-memory-cell | tran | v(1) | 3.55e-15 | 3.52e-16 | 9.30e-15 | 1.25e-15 | 1.33e-15 | 2.23e-16 | 5.04e-15 | 7.72e-16 |
| classic/mos-memory-cell | tran | v(2) | 8.75e-16 | 9.24e-17 | 1.07e-15 | 3.87e-16 | 8.75e-16 | 1.16e-16 | 1.07e-15 | 3.87e-16 |
| classic/mos-memory-cell | tran | v(3) | 1.87 | 1.78 | 0.803 | 0.652 | 0.248 | 0.118 | 0.0618 | 0.0315 |
| classic/mos-memory-cell | tran | v(4) | 0.0160 | 0.00655 | 0.700 | 0.0600 | 0.0114 | 0.00690 | 0.438 | 0.0402 |
| classic/mos-memory-cell | tran | v(5) | 1.86 | 1.84 | 0.768 | 0.711 | 0.0284 | 0.0150 | 0.0117 | 0.00617 |
| classic/mos-memory-cell | tran | v(6) | 0.0518 | 0.0409 | 23.9 | 1.97 | 0.0150 | 0.00779 | 2.94 | 0.253 |
| classic/mos-memory-cell | tran | v(7) | 4.43e-14 | 5.18e-15 | 1.00 | 0.132 | 4.61e-14 | 5.69e-15 | 1.00 | 0.132 |
| classic/mos-memory-cell | tran | v(8) | 1.91 | 1.89 | 0.922 | 0.872 | 0.0831 | 0.0750 | 0.0402 | 0.0350 |
| xyce/nmos-level1-dc | dc | i(vdd) | 8.67e-19 | 3.66e-19 | 4.64e-12 | 2.43e-12 | 8.67e-19 | 3.66e-19 | 4.64e-12 | 2.43e-12 |
| xyce/nmos-level1-dc | dc | i(vgg) | 0.00000136 | 9.39e-8 | 1.00 | 0.101 | 0.00000136 | 9.39e-8 | 1.00 | 0.101 |
| xyce/nmos-level1-dc | dc | v(1) | 1.33e-15 | 4.81e-16 | 5.22e-16 | 2.03e-16 | 1.33e-15 | 4.78e-16 | 5.22e-16 | 2.03e-16 |
| xyce/nmos-level1-dc | dc | v(2) | 0.000682 | 0.0000469 | 1.00 | 0.101 | 0.000682 | 0.0000469 | 1.00 | 0.101 |
| corpus-e/mos1-inverter-sweep | op | i(vdd) | 4.72e-14 | 4.72e-14 | 3.94e-11 | 3.94e-11 | 4.72e-14 | 4.72e-14 | 3.94e-11 | 3.94e-11 |
| corpus-e/mos1-inverter-sweep | op | v(6) | 1.06e-11 | 1.06e-11 | 2.47e-12 | 2.47e-12 | 1.06e-11 | 1.06e-11 | 2.47e-12 | 2.47e-12 |
| corpus-e/mos1-inverter-sweep | dc | i(vdd) | 9.14e-9 | 2.13e-9 | 0.00000441 | 0.00000113 | 9.14e-9 | 2.13e-9 | 0.00000441 | 0.00000113 |
| corpus-e/mos1-inverter-sweep | dc | v(3) | 0.00352 | 0.000768 | 0.0131 | 0.00286 | 0.00352 | 0.000768 | 0.0131 | 0.00286 |
| corpus-e/mos1-inverter-sweep | dc | v(4) | 0.0000201 | 0.00000446 | 0.00699 | 0.00153 | 0.0000201 | 0.00000446 | 0.00699 | 0.00153 |
| corpus-e/mos1-inverter-sweep | dc | v(5) | 0.00352 | 0.000768 | 0.0131 | 0.00286 | 0.00352 | 0.000768 | 0.0131 | 0.00286 |
| corpus-e/mos1-inverter-sweep | dc | v(7) | 0.00000620 | 0.00000176 | 0.00000729 | 0.00000192 | 0.00000620 | 0.00000176 | 0.00000729 | 0.00000192 |
| corpus-e/mos1-inverter-sweep | tran | i(vdd) | 0.0000516 | 0.0000171 | 0.0300 | 0.0105 | 0.0000516 | 0.0000171 | 0.0300 | 0.0105 |
| corpus-e/mos1-inverter-sweep | tran | v(2) | 3.11e-15 | 1.54e-15 | 1.12e-15 | 5.39e-16 | 3.55e-15 | 1.51e-15 | 1.14e-15 | 5.36e-16 |
| corpus-e/mos1-inverter-sweep | tran | v(3) | 0.836 | 0.278 | 1.00 | 0.371 | 0.836 | 0.278 | 1.00 | 0.371 |
| corpus-e/mos1-inverter-sweep | tran | v(4) | 0.176 | 0.0382 | 1.00 | 0.353 | 0.176 | 0.0382 | 1.00 | 0.353 |
| corpus-e/mos1-inverter-sweep | tran | v(5) | 0.00451 | 0.00229 | 0.00112 | 0.000541 | 0.00451 | 0.00229 | 0.00112 | 0.000541 |
| corpus-e/mos1-inverter-sweep | tran | v(6) | 0.0684 | 0.0122 | 1.00 | 0.350 | 0.0684 | 0.0122 | 1.00 | 0.350 |
| corpus-e/mos1-inverter-sweep | tran | v(7) | 0.0680 | 0.0109 | 0.0354 | 0.00564 | 0.0680 | 0.0109 | 0.0354 | 0.00564 |
| issue-530/nmos-body-effect-vbs-sweep | dc | i(vd) | 0.000166 | 0.000128 | 2.79e+7 | 4.24e+6 | 2.17e-19 | 5.45e-20 | 2.61e-13 | 2.95e-14 |
| issue-530/nmos-body-effect-vgs-sweep | dc | i(vd) | 0.000146 | 0.000122 | 2.55e+7 | 3.98e+6 | 5.42e-19 | 1.59e-19 | 1.08e-14 | 2.02e-15 |
| issue-530/nmos-body-effect-vgs-sweep | dc | i(vd2) | 0.00111 | 0.000585 | 1.26e+7 | 1.96e+6 | 3.04e-18 | 8.06e-19 | 1.45e-14 | 2.09e-15 |
| issue-530/nmos-depletion-signed-vto | dc | i(vd) | 0.000875 | 0.000395 | 1.00 | 0.846 | 4.34e-19 | 1.23e-19 | 2.00e-14 | 2.28e-15 |
| issue-530/nmos-lateral-diffusion | dc | i(vd) | 0.000575 | 0.000229 | 0.300 | 0.260 | 1.73e-18 | 5.58e-19 | 2.57e-15 | 8.90e-16 |
| issue-530/nmos-nsub-derived-gamma | dc | i(vdd) | 0.0000297 | 0.0000171 | 0.236 | 0.206 | 9.33e-10 | 1.08e-10 | 0.000311 | 0.0000337 |
| issue-530/nmos-nsub-derived-gamma | dc | v(out) | 0.593 | 0.341 | 0.236 | 0.213 | 0.0000187 | 0.00000216 | 0.000311 | 0.0000348 |
| issue-530/nmos-nsub-derived-gamma | tran | i(vdd) | 0.0000300 | 0.0000172 | 1.00 | 0.249 | 2.08e-7 | 4.03e-8 | 0.999 | 0.213 |
| issue-530/nmos-nsub-derived-gamma | tran | i(vin) | 9.07e-8 | 2.97e-8 | 1.00 | 1.00 | 9.35e-8 | 2.91e-8 | 1.00 | 1.00 |
| issue-530/nmos-nsub-derived-gamma | tran | v(in) | 4.50e-15 | 7.79e-16 | 1.06e-13 | 7.21e-15 | 5.05e-15 | 7.24e-16 | 1.06e-13 | 6.30e-15 |
| issue-530/nmos-nsub-derived-gamma | tran | v(out) | 0.599 | 0.344 | 5.10 | 0.720 | 0.00522 | 0.000915 | 1.75 | 0.677 |
| issue-530/nmos-nsub-derived-gamma | tran | v(vdd) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| issue-530/pmos-signed-vto-body | dc | i(vdd) | 0.000295 | 0.000141 | 1.00 | 0.507 | 3.08e-7 | 3.33e-8 | 0.000322 | 0.0000442 |
| issue-530/pmos-signed-vto-body | dc | v(d1) | 0.00308 | 0.000312 | 0.000827 | 0.0000836 | 0.00308 | 0.000312 | 0.000827 | 0.0000835 |
| issue-530/pmos-signed-vto-body | dc | v(d2) | 0.341 | 0.123 | 0.122 | 0.0634 | 0.000177 | 0.0000207 | 0.000502 | 0.0000628 |
| issue-530/pmos-signed-vto-body | dc | v(d3) | 2.99 | 1.46 | 1.00 | 0.571 | 0.00112 | 0.000115 | 0.000345 | 0.0000354 |
| issue-530/pmos-signed-vto-body | dc | v(s2) | 0.0681 | 0.0247 | 0.0154 | 0.00547 | 0.0000355 | 0.00000415 | 0.00000814 | 9.54e-7 |
