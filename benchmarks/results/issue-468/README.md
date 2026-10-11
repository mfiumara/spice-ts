# Issue #468: MOS6 charges on TransientChargeState

MOS6 (level 6) was merged in #455 while #463 moved the other nonlinear-C devices onto
`TransientChargeState` (ngspice `NIintegrate` on each charge). MOS6 still stamped its
Meyer gate caps and bulk-junction depletion caps through the generic C(v) trapezoidal
history: C at the new iterate applied to the old voltages. This change moves it to the
same mechanism, as `mos6load.c` does:

- Meyer gate charges qgs, qgd, qgb: advanced from the accepted point with
  `capgs = half(n+1) + half(n) + overlap` (DEVqmeyer), via
  `incrementalCharge(..., averaged = true)` fed with the full `2*half + overlap`.
- Bulk junction charges qbs, qbd: the exact `mos6load.c` depletion charges (f2/f3/f4
  continuation above FC*PB).
- AC and other small-signal analyses still use `stampDynamic` (2*half + overlap).

## Receipts

Same bytes through both engines, aggregate harness metrics (`alignAndMeasure`, spice-ts
grid, linear interpolation), ngspice-47.

```
pnpm -C packages/core build
npx tsx benchmarks/results/issue-468/verify.ts --output benchmarks/results/issue-468/receipts/verify-after.json
# base: same command on origin/main 0f50fb1 -> receipts/verify-before.json
```

`verify.ts` also counts, for every source current, how often the spice-ts error changes
sign between consecutive points and how often the slope of each engine's waveform
reverses. That is the issue #461 ringing metric.

### mos6-simple-inverter-transient (tests/mos6/simpleinv.cir)

| signal | before abs max / RMS | after abs max / RMS |
|---|---|---|
| i(vin) | 22.7 uA / 16.1 uA | 2.01 uA / 0.228 uA |
| i(vdd) | 81.4 uA / 67.4 uA | 0.617 uA / 0.074 uA |
| v(11) | 221.5 mV / 21.6 mV | 105.7 mV / 12.4 mV |

i(vin) slope reversals: 586 of 590 points before, 59 of 321 after (ngspice-47: 70 of 308).
i(vdd): 587 of 590 before, 49 of 321 after (ngspice-47: 48). Off the switching edge,
i(vin) is within 1 nA of ngspice-47 after the change. Before, it was off by up to 16.6 uA.

### mos6-inverter-transient and classic/mos6-inverter-chain (identical bytes)

These are wins on the currents and losses on most node voltages. Full per-signal table:
`receipts/verify-{before,after}.json`.

| signal | before abs max / RMS | after abs max / RMS |
|---|---|---|
| i(vin) | 45.6 uA / 14.96 uA | 35.6 uA / 1.53 uA |
| i(vdd) | 196.6 uA / 86.2 uA | 43.5 uA / 11.2 uA |
| v(5) | 7.6 mV / 0.33 mV | 75.2 mV / 10.3 mV |
| v(11) | 6.6 mV / 2.7 mV | 11.4 mV / 3.9 mV |
| worst node (xndinv3.14) | 271.9 mV / 10.6 mV | 326.1 mV / 24.7 mV |

Of the 42 node voltages, abs max gets worse on 39 and better on 2 (v(1), which is at
1e-15 V on both, and xndinv1.22). RMS gets worse on 36 and better on 5 (v(1),
xndinv1.12/.13/.14/.22). v(100) is exact on both. i(vin) slope reversals: 3067 of 3872 points before, 833 of 912
after (ngspice-47: 301 of 315). The ringing is much reduced but not gone on this deck.

### Why the node voltages lose on mos6inv (diagnostic, not a published result)

`diag.ts` runs the deck through both engines with a replaced `.TRAN` card or extra
`.OPTIONS`. Both engines get the identical modified bytes
(`receipts/diag-mos6inv-{before,after}.txt`):

| run | v(5) max before / after | i(vin) RMS before / after |
|---|---|---|
| default | 7.6 mV / 75.2 mV | 15.0 uA / 1.53 uA |
| RELTOL=1e-4 | 36.8 mV / 16.3 mV | 10.6 uA / 0.82 uA |
| RELTOL=1e-5 | 11.4 mV / 15.3 mV | 8.0 uA / 0.26 uA |
| TMAX=50p | 0.92 mV / 22.0 mV | 20.8 uA / 0.52 uA |
| TMAX=10p | 0.73 mV / 6.0 mV | 8.0 uA / 0.37 uA |

After the change, the spice-ts node voltage error scales with RELTOL. In a spice-ts-only
self-convergence check on mos6inv without its 1 pF load caps, the TMAX=10p vs TMAX=2p
difference of v(5) dropped from 21 mV to 18 uV with RELTOL=1e-6 VNTOL=1e-9 ABSTOL=1e-15.
So the integration converges.
What is left is transient Newton stopping early: the Meyer Jacobian is approximate (no
dC/dv term, in ngspice too), and spice-ts declares convergence on node voltages alone.
ngspice also requires the device convergence test (`MOS6convTest` on cd and cbs+cbd,
junction charge currents included) and starts each timepoint from MODEINITPRED
extrapolation. spice-ts transient Newton has neither for MOS6. Before the change, the
generic path took 3,872 points instead of 912, which hid this on the voltages. Its
currents never converged: i(vin) RMS stays at 8 to 21 uA at any TMAX or RELTOL.

Follow-up: device convergence test / INITPRED in transient Newton (driver scope, not
part of this card).

No tolerance was loosened and no per-circuit setting was changed. Fixture bytes are
unchanged (SHA-256 checked in `verify.ts`).
