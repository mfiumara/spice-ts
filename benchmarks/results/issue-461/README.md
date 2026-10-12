# Issue #461: MOS6 i(vin) trapezoidal ringing, re-measured after #463, #478, #479 and #689

Result: fixed on main. No simulator change is needed. This adds regression guards
(`packages/core/src/devices/mos6-trap-ringing-461.test.ts`) and the receipt below.

Measured with `benchmarks/results/issue-468/verify.ts` (unchanged): identical fixture
bytes on both engines, SHA-256 checked, `alignAndMeasure` on the spice-ts grid with
linear interpolation, ngspice-47.

```
pnpm -C packages/core build
npx tsx benchmarks/results/issue-468/verify.ts --output benchmarks/results/issue-461/receipts/verify-468-script-main-b04bc1e.json
```

Before: the PR #455 head numbers in issue #461, and `issue-468/receipts/verify-before.json`
(main 0f50fb1, MOS6 on the generic C(v) history). After: main b04bc1e.

## mos6-simple-inverter-transient (tests/mos6/simpleinv.cir)

| metric | 0f50fb1 (before #478) | b04bc1e (main) | ngspice-47 |
|---|---|---|---|
| timepoints | 590 | 307 | 308 |
| i(vin) abs max / RMS error | 22.7 uA / 16.1 uA | 70.6 nA / 6.9 nA | - |
| i(vdd) abs max / RMS error | 81.4 uA / 67.4 uA | 12.2 nA / 1.4 nA | - |
| v(11) abs max / RMS error | 221.5 mV / 21.6 mV | 1.28 mV / 0.10 mV | - |
| i(vin) slope reversals | 586 | 70 | 70 |
| i(vdd) slope reversals | 587 | 48 | 48 |
| i(vin) step-to-step ripple off the 55..75 ns edge | 39.6 uA (10..50 ns) | 35.9 nA | 36.6 nA |

The ±16.6 uA alternation is gone. spice-ts now reverses the i(vin) slope at
the same number of points as ngspice-47 (70) and has the same ripple amplitude.

"Error sign flips" (the #468 metric) is still 131 on simpleinv and 304 on mos6inv. This
metric is not a ringing measure when both engines ring. ngspice-47 alternates too
(plain trapezoid has no damping), and the two engines step on grids offset by
about 0.5 ns. So an interpolated difference flips with the phase of the
ripple, not because of an error in spice-ts.

## mos6-inverter-transient = classic/mos6-inverter-chain (identical bytes)

| metric | 0f50fb1 | b04bc1e (main) | ngspice-47 |
|---|---|---|---|
| timepoints | 3872 | 312 | 315 |
| i(vin) abs max / RMS error | 45.6 uA / 15.0 uA | 6.88 uA / 0.49 uA | - |
| i(vdd) abs max / RMS error | 196.6 uA / 86.2 uA | 12.1 uA / 2.87 uA | - |
| v(5) abs max / RMS error | 7.6 mV / 0.33 mV | 32.7 mV / 4.97 mV | - |
| v(11) abs max / RMS error | 6.6 mV / 2.7 mV | 3.66 mV / 0.41 mV | - |
| i(vin) slope reversals | 3067 | 301 | 301 |
| i(vin) ripple, 100..150 ns | 3e-16 A | 20.4 nA | 14.3 nA |
| i(vin) ripple, 10..50 ns | 2.9 nA | 294 nA | 114 nA |

ngspice-47 rings here too: i(vin) alternates by about ±7 nA per step in the tail.
spice-ts matches its slope-reversal count exactly (301 of 312 vs 301 of 315).

Losses, published:

- The ripple is still 1.4x the ngspice-47 level over 100..150 ns and 2.6x over
  10..50 ns. It decays at the same rate as ngspice-47, so it is not undamped. It is
  slightly larger after the 2 ns input edge, where the two engines take different
  steps (spice-ts 12 steps to 2.0 ns, ngspice-47 15).
- v(5) abs max 32.7 mV, compared with 7.6 mV on the old generic path (which needed
  3,872 points). This is the node-voltage residual discussed in `issue-468/README.md`.
  It is a step-placement difference, not ringing, and it is out of scope here.

The current under the ripple matches. A 1:2:1 average over ±h at each time
cancels the step-to-step alternation on each engine's own grid. On that average,
spice-ts i(vin) is within
0.36 % of ngspice-47 at 3, 5, 10, 15, 20, 25, 30 and 40 ns (worst: 5.8 nA at 3 ns
on -1.62 uA).

Ripple = the largest distance of a point from the chord through its two neighbours, on
each engine's own grid.

## Guards

`mos6-trap-ringing-461.test.ts`, references from ngspice-47 on the unchanged decks:

1. simpleinv i(vin) slope reversals within ±15 % of ngspice-47's 70, and off-edge
   ripple < 50 nA (ngspice-47 36.6 nA). Fails on 0f50fb1 (586 reversals) and on
   1e8d9f8 (#478 alone: 69.4 nA ripple).
2. mos6inv i(vin) ripple over 100..150 ns < 30 nA (ngspice-47 14.3 nA).
3. mos6inv ripple-free i(vin) within 1 % + 1 nA of ngspice-47 at 3..40 ns. Fails on
   0f50fb1 (69.7 nA at 3 ns) and 1e8d9f8 (18.4 nA at 3 ns).

No tolerance was loosened, no per-circuit setting was changed, and the simulator
was not modified.
