# #970 exhaustive adapter delta audit

Merge-base adapter: `bd4ac625f15e344043a7431b24f64828966e2d41`. Implementation head: `d5aa4c8c064a269e8e32bf74f1be12d9f6fc3d9a`.
All 700 original manifest entries, plus 20 subsequently landed corpus-k entries, are inventoried (720 total). Original bucket counts: `{"changed-regressed":16,"unchanged":372,"not-comparable":292,"changed-neutral":9,"changed-improved":11}`. K counts: `{"not-comparable":15,"unchanged":5}`. Total counts: `{"changed-regressed":16,"unchanged":377,"not-comparable":307,"changed-neutral":9,"changed-improved":11}`.

The 700-entry denominator includes original A..J (661) and D/E/Xyce translated-manifest entries (39), including unsupported translations with no runnable deck. Actual control blocks: 247. The requested 248 substring census also counted classic/resistor-noise’s commented `*.control`; that row is still executed and inventoried.

## Method and limitations

Node v22.23.1; ngspice-47; spice-ts core tree `4ade41430660e5de0dc3d56f93ae28540f1366ff`. Every new measurement supplies identical original bytes to both engines. Both adapters share a memoized simulate() Promise: a single live spice-ts execution is mapped by the exact merge-base adapter and the implementation adapter. Reference execution is captured once; the before control exporter admits only the first plot of each declared type, as the merge-base exporter did. Raw mapped executions are compressed in the ignored raw/ cache and replayable. The parent’s committed j14-raw.json.gz is reused at its published historical core tree; it reproduces the acceptance numbers exactly. No deck, threshold, tolerance, simulator, source catalogue, or aggregate artifact changes.

Comparison includes every signal metric, not merely the worst metric. Identity labels alone do not count as numeric changes. “changed-improved” / “changed-regressed” mean crossing the unchanged 0.01 match threshold or loss/gain of complete matching coverage. Metric changes without a match-state transition are “changed-neutral”; lower-error/higher-error/same-error direction is separately shown even for neutral rows. Thus neutral is not a claim that higher errors are harmless. Unsupported engines, absent translated decks and no scored numeric overlap are not-comparable, with explicit reasons in inventory.json. They are not inferred unchanged. The corpus-f sp/sens plot extensions are mapped by both historical and current adapters. When neither adapter produces a successful execution, a native reference cannot make the row scorable and may be explicitly not-run (never represented as a real failed native run).

Unknown secondary coordinates use reset-ordinal pairing, equal group counts and exactly equal primary samples per group in acquisition order. Unequal grids or counts report unmatched groups, prevent a match, and never interpolate across resets. This conservative policy retains floating-grid/coverage losses rather than widening any tolerance. Each comparison using this fallback has the ordinal-aligned fixture tag (including rejected groups). Explicit secondary coordinates still permit within-group interpolation.

Initial capture used uniform 180 s / 4 GiB bounds. Three large missing receipts were retried using packed columns, streamed reference input, and uniform 600 s / 12 GiB bounds. Packed wrapper equivalence is tested against the original wrapper. 14 rows have no comparison execution receipt; they are listed below, never called unchanged. Absent translated decks remain explicit exclusions. Any unresolved execution-bound failure keeps the acceptance gate open.

## Every changed fixture

| Fixture | Bucket / numeric direction | Paired plots before → after | Unmatched plots | Aligned points | Excluded points | Worst normalized mismatch | Unmatched groups |
|---|---|---:|---:|---:|---:|---:|---:|
| ngspice/vbic-fo | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 707 → 0 | 0 → 707 | 0.00032168127636619185 → null | 0 → 14 |
| classic/diode-distortion | changed-neutral / same-error | 3 → 3 | 0 → 0 | 300 → 300 | 3 → 3 | 0.0001618417443393847 → 0.0001618417443393847 | 0 → 0 |
| corpus-e/bjt-diffpair-current-source | changed-regressed / same-error | 3 → 3 | 0 → 2 | 81 → 81 | 1 → 1 | 0.00021586733734461037 → 0.00021586733734461037 | 0 → 0 |
| corpus-e-spice3/vcvs-operating-point | changed-regressed / same-error | 2 → 2 | 0 → 4 | 2 → 2 | 0 → 0 | 1.670996555883932e-16 → 1.670996555883932e-16 | 0 → 0 |
| corpus-e-spice3/diode-temperature-sweep | changed-regressed / same-error | 2 → 2 | 0 → 2 | 4 → 4 | 0 → 0 | 9.551216565610037e-8 → 9.551216565610037e-8 | 0 → 0 |
| corpus-e-spice3/mos1-nand-transient | changed-regressed / same-error | 2 → 2 | 0 → 4 | 115 → 115 | 0 → 0 | 0.0037937190314439066 → 0.0037937190314439066 | 0 → 0 |
| corpus-e-spice3/dual-lc-uic-rejection | changed-regressed / same-error | 1 → 1 | 0 → 1 | 1011 → 1011 | 0 → 0 | 2.238263241193752e-14 → 2.238263241193752e-14 | 0 → 0 |
| corpus-f/examples-control-structs-new-check-3-sp | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 0 → 0 | 3 → 3 | 0 → null | 0 → 3 |
| corpus-f/examples-mos-nmos-pmos-drainresistor-sp | changed-improved / lower-error | 1 → 4 | 0 → 0 | 6 → 864 | 240 → 0 | 2.3333333333333317 → 0.000014254317655143732 | 0 → 0 |
| corpus-f/examples-mos-nmos-pmos-plotting-sp | changed-improved / lower-error | 1 → 4 | 0 → 0 | 6 → 1404 | 240 → 0 | 2.3333333333333317 → 0.000003345046393154816 | 0 → 0 |
| corpus-f/examples-noise-bipolar-noise-cir | changed-neutral / higher-error | 1 → 2 | 0 → 0 | 84 → 85 | 0 → 0 | 1.774670603333689e-8 → 1.2410488076859786e-7 | 0 → 0 |
| corpus-f/examples-noise-resdiv-gain-cir | changed-improved / lower-error | 1 → 8 | 0 → 0 | 51 → 208 | 0 → 0 | 3.9975352925474037 → 1.73831338371215e-7 | 0 → 0 |
| corpus-f/examples-noise-resdiv-cir | changed-improved / lower-error | 1 → 6 | 0 → 0 | 51 → 156 | 0 → 0 | 0.9996816900746098 → 1.73831338371215e-7 | 0 → 0 |
| corpus-f/examples-transient-noise-noi-sc-tr-cir | changed-neutral / same-error | 1 → 1 | 0 → 2 | 2500003 → 2500003 | 1 → 1 | 1.641552001979646 → 1.641552001979646 | 0 → 0 |
| corpus-f/examples-transient-noise-noise-vnoi-cir | changed-regressed / same-error | 1 → 1 | 0 → 1 | 1250005 → 1250005 | 0 → 0 | 0.0012057160419351011 → 0.0012057160419351011 | 0 → 0 |
| corpus-f/examples-transient-noise-simple-noise-cir | changed-neutral / higher-error | 1 → 2 | 0 → 0 | 224375 → 448750 | 0 → 0 | 4.198796415818062 → 25.741083633406284 | 0 → 0 |
| corpus-f/examples-transmissionlines-cpl-ibm1a-sp | changed-neutral / same-error | 1 → 30 | 0 → 0 | 390 → 11700 | 0 → 0 | 0.2993569446613193 → 0.2993569446613193 | 0 → 0 |
| corpus-f/examples-various-bjtnoise-cir | changed-neutral / same-error | 1 → 2 | 0 → 0 | 51 → 52 | 0 → 0 | 1.5082730674731205e-7 → 1.5082730674731205e-7 | 0 → 0 |
| corpus-f/examples-various-param-sweep-cir | changed-improved / lower-error | 1 → 10 | 0 → 0 | 11 → 110 | 0 → 0 | 0.8181818181818182 → 5.692061405548901e-16 | 0 → 0 |
| corpus-f/examples-various-v-i-sources-am-ffm-cir | changed-regressed / same-error | 1 → 1 | 0 → 1 | 128008 → 128008 | 0 → 0 | 0.0011934012556221738 → 0.0011934012556221738 | 0 → 0 |
| corpus-f/examples-vdmos-ixtp6n100d2-n-weak-inv-sp | changed-neutral / higher-error | 1 → 2 | 0 → 0 | 0 → 5905 | 5400 → 0 | 0 → 0.0004321577268296619 | 0 → 0 |
| corpus-f/examples-vdmos-mtriode-nch-sp | changed-neutral / coverage-change | 1 → 3 | 0 → 0 | 2107 → 0 | 0 → 6321 | 0.18406222120773566 → null | 0 → 42 |
| corpus-f/examples-vdmos-soa-chk-sp | changed-improved / lower-error | 1 → 2 | 0 → 0 | 1060 → 2120 | 0 → 0 | 25180496345.465687 → 0.0004835021272242557 | 0 → 0 |
| corpus-f/examples-vdmos-theta-nch-sp | changed-improved / lower-error | 1 → 5 | 0 → 0 | 71 → 355 | 0 → 0 | 0.3586642092946006 → 0.000003127128186027524 | 0 → 0 |
| corpus-f/examples-vdmos-vdmos-out-ir-mtr-sp | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 805 → 0 | 0 → 805 | 0.00008335737710746787 → null | 0 → 10 |
| corpus-f/examples-vdmos-vdmos-out-sp | changed-improved / lower-error | 1 → 2 | 0 → 0 | 505 → 2110 | 0 → 0 | 0.8732403171251861 → 0.00008661138657336983 | 0 → 0 |
| corpus-f/examples-vdmos-vdmosp-out-mtr-sp | changed-improved / lower-error | 1 → 2 | 0 → 0 | 486 → 2046 | 0 → 6 | 1 → 0.000031632818691913875 | 0 → 0 |
| corpus-f/examples-vdmos-vdmosp-out-sp | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 966 → 0 | 0 → 966 | 1.4827017455186569e-8 → null | 0 → 12 |
| corpus-f/tests-mesa-mesa11-cir | changed-regressed / lower-error | 2 → 2 | 0 → 0 | 165 → 1 | 0 → 164 | 1.2968123144197516e-15 → 0 | 0 → 8 |
| corpus-f/tests-mesa-mesa21-cir | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 405 → 0 | 0 → 405 | 9.24261360409458e-16 → null | 0 → 10 |
| corpus-g/nmesfet-nmesfet-cir | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 72 → 0 | 0 → 72 | 8.523725735549254e-8 → null | 0 → 4 |
| corpus-g/nmos3-dc-mos3-dc-cir | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 2404 → 0 | 0 → 2404 | 1.2593239592837579e-15 → null | 0 → 8 |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | changed-regressed / coverage-change | 1 → 1 | 0 → 0 | 300 → 0 | 5 → 305 | 9.177803070582189e-10 → null | 0 → 10 |
| corpus-h/xictools-wrspice-examples-bjtnoise-cir | changed-neutral / same-error | 1 → 2 | 0 → 0 | 41 → 42 | 0 → 0 | 1.5082342880388466e-7 → 1.5082342880388466e-7 | 0 → 0 |
| corpus-h/xictools-wrspice-examples-diodisto-cir | changed-improved / lower-error | 3 → 3 | 0 → 0 | 300 → 300 | 3 → 3 | 0.6853180417768195 → 0.0001618417443393847 | 0 → 0 |
| corpus-j/j-14 | changed-improved / lower-error | 1 → 6 | 0 → 0 | 6 → 1236 | 180 → 0 | 11.640724167089497 → 7.609774879516523e-9 | 0 → 0 |

## Entries without execution receipts

- xyce-spice3/capacitor-rc-transient-newlte: unsupported translation; no runnable translated deck: Xyce `.options timeint newlte=2` selects a Xyce time-integrator algorithm with no SPICE3 equivalent.
- xyce-spice3/diode-level2-temperature-breakdown: unsupported translation; no runnable translated deck: Diode model DZR is Xyce LEVEL=2 (PSpice-compatible diode equations). SPICE3 has no level-2 diode (ngspice-47: "Diode model level 2 is not supported"), and substituting the level-1 diode would change the model equations.; Xyce `.step TEMP list -55 25 72`: SPICE3 batch mode has no parameter-stepping command, and this form is not a single source stepped over a single-source .dc sweep.
- xyce-spice3/diode-zener-5229: unsupported translation; no runnable translated deck: Diode model DFOR is Xyce LEVEL=2 (PSpice-compatible diode equations). SPICE3 has no level-2 diode (ngspice-47: "Diode model level 2 is not supported"), and substituting the level-1 diode would change the model equations.; Xyce `.options DEVICE` package: no translation rule is implemented.
- corpus-d-spice3/ekv-bias-sweep: unsupported translation; no runnable translated deck: MOSFET instances need an ahkab MOS model (EKV or square-law), neither of which is a SPICE3 model; EKV MOSFET model (.model ekv ...) has no SPICE3/ngspice equivalent; ahkab keyed .dc sweep translation is not implemented (every corpus-d .dc deck also uses the EKV model)
- corpus-d-spice3/downscaling-current-mirror: unsupported translation; no runnable translated deck: MOSFET instances need an ahkab MOS model (EKV or square-law), neither of which is a SPICE3 model; EKV MOSFET model (.model ekv ...) has no SPICE3/ngspice equivalent; ahkab keyed .dc sweep translation is not implemented (every corpus-d .dc deck also uses the EKV model)
- corpus-d-spice3/transresistance-ac: unsupported translation; no runnable translated deck: .ac: ahkab LOG sweep of 1000 points from 7957.747 to 79577.471 Hz is 998.999994548 points/decade; SPICE3 .ac dec needs an integer, so the frequency grid cannot be reproduced; ahkab .symbolic (symbolic small-signal analysis) has no SPICE3 equivalent
- corpus-d-spice3/passive-pole-zero-ac: unsupported translation; no runnable translated deck: ahkab .pz (circuit poles plus zeros from a named source to an output) is not translated: equivalence with SPICE3 .pz on a node-pair port has not been established; .ac: ahkab LOG sweep of 100 points from 0.1 to 10 Hz is 49.5000000000 points/decade; SPICE3 .ac dec needs an integer, so the frequency grid cannot be reproduced
- corpus-d-spice3/resistor-voltage-ac: unsupported translation; no runnable translated deck: .ac: ahkab LOG sweep of 10 points from 1 to 100 Hz is 4.50000000000 points/decade; SPICE3 .ac dec needs an integer, so the frequency grid cannot be reproduced; ahkab .symbolic (symbolic small-signal analysis) has no SPICE3 equivalent
- corpus-d-spice3/series-resonance-ac: unsupported translation; no runnable translated deck: .ac: ahkab LOG sweep of 100 points from 1 to 10000 Hz is 24.7500000000 points/decade; SPICE3 .ac dec needs an integer, so the frequency grid cannot be reproduced; ahkab .symbolic (symbolic small-signal analysis) has no SPICE3 equivalent
- corpus-d-spice3/fft-source-transient: unsupported translation; no runnable translated deck: vs: ahkab source without vdc= has no defined SPICE3 DC value; ahkab .fft (np-point FFT of a transient result) has no exact SPICE3 equivalent; .four computes 9 harmonics of a given fundamental, a different output
- corpus-d-spice3/coupled-transformer-transient: unsupported translation; no runnable translated deck: ahkab .pss (periodic steady state by shooting/brute force) has no SPICE3 equivalent; .plot: unsupported ahkab plot .PLOT PSS V(2) V(3)
- corpus-d-spice3/ekv-ring-oscillator: unsupported translation; no runnable translated deck: ahkab named-port subcircuit instances (name=/port=node) translation is not implemented; ahkab named-port subcircuit syntax translation is not implemented; MOSFET instances need an ahkab MOS model (EKV or square-law), neither of which is a SPICE3 model; EKV MOSFET model (.model ekv ...) has no SPICE3/ngspice equivalent; ahkab named .ic sets (used through uic=3/ic_label) have no SPICE3 equivalent; .tran: ahkab uic=3/ic_label (named .ic set) has no SPICE3 equivalent
- corpus-d-spice3/pwm-switch: unsupported translation; no runnable translated deck: ahkab switch model is a tanh-smoothed resistor whose VON/VOFF are converted to VT and VH=VT*1e-3; SPICE3 SW is an abrupt hysteretic switch without VON/VOFF, so any mapping would approximate; voltage-controlled switch instances use the ahkab switch model (see the model reason); .op: ahkab option guess=0 has no SPICE3 equivalent; .tran: ahkab uic=2 (OP then element-IC override) has no SPICE3 equivalent unless the OP and all ICs are zero
- corpus-d-spice3/colpitts-oscillator: unsupported translation; no runnable translated deck: MOSFET instances need an ahkab MOS model (EKV or square-law), neither of which is a SPICE3 model; EKV MOSFET model (.model ekv ...) has no SPICE3/ngspice equivalent; .tran: ahkab uic=2 (OP then element-IC override) has no SPICE3 equivalent unless the OP and all ICs are zero

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build
python3 benchmarks/plot-identity-970/prepare.py
AUDIT_PACKED=1 AUDIT_CHILD_MS=600000 AUDIT_HEAP_MB=12288 AUDIT_CORE_SHA=$(git rev-parse HEAD:packages/core) spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts
AUDIT_CHILD_MS=600000 AUDIT_HEAP_MB=12288 AUDIT_CORE_SHA=$(git rev-parse HEAD:packages/core) spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts --replay
pnpm exec tsx benchmarks/plot-identity-970/render.ts
pnpm exec tsx --test benchmarks/plot-alignment.test.ts benchmarks/plot-identity-970/audit.test.ts
AUDIT_NATIVE_TEST=1 spice-heavy pnpm exec tsx --test benchmarks/plot-identity-970/packed-control.test.ts
```

Resume reuses completed rows and raw cache; to rerun a particular manifest ordinal in an owned child use `spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts --child N` (the committed catalogue order determines N). Raw cache is deliberately not a hundreds-of-MB git payload. inventory.json retains full per-signal before/after comparison metrics and execution-receipt hashes, so the published comparisons can be checked without the cache. The lightweight tests assert all manifest entries and bucket totals and the exact j-14 receipt.
