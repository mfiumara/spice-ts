# Issue #504: `.pz` with sources and active elements

`.pz` now runs on any circuit whose devices have an AC small-signal stamp. It
uses the same linearisation at the DC operating point as `.ac`, and follows
ngspice-47's semantics:

- An independent voltage source with an AC value is removed: its branch current
  is forced to zero, so it is an open circuit (ngspice `VSRCpzLoad`). A voltage
  source without an AC value stays a short. Current sources are open.
- Input and output may be differential pairs (`.pz in+ in- out+ out- ...`).
- Modes `pol`, `zer` and `pz` are all supported.
- The ngspice `PZinit` terminal checks raise a typed `InvalidCircuitError`:
  input shorted, output shorted, transfer function unity, and transfer
  function -1 (the last two for `vol` only).

RF port sources (`portnum`) keep their regular stamp. That case is not
compared here.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm build
# corpus-f fixtures (identical bytes, ngspice-47 vs spice-ts)
pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child tests-polezero-filt-bridge-t-cir
pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child tests-polezero-filt-multistage-cir
pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child tests-polezero-filt-rc-cir
# extra decks: ngspice-47 reference
SPICE_ASCIIRAWFILE=1 ngspice -b -r out.raw benchmarks/results/issue-504/decks/<deck>.cir
```

The extra decks in `decks/` are original test circuits written for this issue,
released under the repository licence. The corpus-f decks are byte-identical
ngspice files (BSD-3-Clause, see `benchmarks/corpus/corpus-f/SOURCES.md`).

## corpus-f before and after

| Fixture | Before | After | Worst normalised error |
|---|---|---|---|
| tests/polezero/filt_bridge_t.cir | failed: `.pz vol supports only ideal R, L, C devices; found V1 (VoltageSource)` | matched | 7.28e-9 (`zero(1)`) |
| tests/polezero/filt_multistage.cir | failed: same error, `v1` | matched | 7.45e-16 |
| tests/polezero/filt_rc.cir | failed: same error, `v1` | matched | 0 |

corpus-f totals: matched 11 -> 14, spice-ts-loss 274 -> 271, and spice-ts
success 32 -> 35. The `analysis: .pz beyond ideal R, L, C` bucket is now
empty. Only these three fixture entries were re-run, with
`--corpus-f-fixture-child`, and spliced in. Totals, README and digest were
then regenerated with `outcomes.ts --relabel`.

## Pole and zero tables (ngspice-47 vs spice-ts, identical netlists)

Values are rad/s, to 10 significant digits.

| Deck | Root | ngspice-47 | spice-ts | Relative error |
|---|---|---|---|---|
| filt_bridge_t | pole 1 | -2618.033989 | -2618.033989 | <1e-12 |
| | pole 2 | -381.9660113 | -381.9660113 | <1e-12 |
| | zero 1 | -1000 | -1000.000007 | 7e-9 |
| | zero 2 | -1000 | -999.9999927 | 7e-9 |
| filt_multistage | poles | -5e10, -8e8, -1e8 | -5.000000000e10, -8.000000000e8, -1.000000000e8 | <1e-12 |
| filt_rc | pole 1 | -1e8 | -1e8 | 0 |
| acopen2 (AC source opens) | poles | -2618033.989, -500000, -381966.0113 | -2618033.989, -500000.0000, -381966.0113 | <1e-9 |
| | zero 1 | -500000 | -500000.0000 | <1e-9 |
| dcshort (DC source shorts) | poles | -1843070.331, -406929.6692 | -1843070.331, -406929.6692 | <1e-9 |
| diff (`.pz 1 2 3 4 cur`) | poles | -1327985.278, -408990.9515, -263023.7709 | identical to 10 digits | <1e-9 |
| | zero 1 | -400000 | -400000.0000 | <1e-9 |
| diffvol (`.pz 1 2 3 4 vol`) | poles | -773459.0803, -369398.0625 | identical to 10 digits | <1e-9 |
| | zero 1 | -400000 | -400000.0000 | <1e-9 |
| zer (`cur zer`) | zero 1 | 0 | 0 | exact |
| diode (biased, CJO + TT) | pole 1 | -992573114.8 | -992572220.9 | 9.0e-7 |
| | pole 2 | -99340653.0 | -99340567.93 | 8.6e-7 |
| | zero 1 | 0 | 0 | exact |
| bjt (common emitter, `vol`) | pole 1 | -230646847.8 | -230659543.3 | 5.5e-5 |
| | pole 2 | -7473942.678 | -7477631.346 | 4.9e-4 |
| | pole 3 | -3671.440117 | -3668.633068 | 7.6e-4 |
| | pole 4 | -56.36793652 | -56.36790024 | 6.4e-7 |
| | zero 1 | -100.0000053 | -100.0000053 | <1e-9 |
| | zero 2 | 0 | 0 | exact |
| | zero 3 | 8.842041042e10 | 8.831955127e10 | 1.1e-3 |
| vshort (DC source across the `vol` input) | - | error: `The input signal is shorted on the way to the output` | `InvalidCircuitError: .pz transfer is identically zero` | both reject |

## Losses

- **bjt: up to 1.1e-3 relative.** The gap comes from the BJT linearisation,
  not from `.pz`. spice-ts's own `.ac` on the same deck differs from
  ngspice-47 by the same amount: |V(5)| at 100 kHz is 144.140 vs 144.253
  (7.8e-4), and at 1 kHz it is 124.927 vs 125.001. The OP already differs
  slightly: V(5) is 6.297355 vs 6.297471. ngspice reports gm = 0.0469634 and
  Cmu = 5.31137e-13, so its RHP zero is gm/Cmu = 8.842e10. spice-ts's zero
  implies a 0.11% larger Cmu/gm ratio. Tracked as a BJT small-signal parity
  follow-up, separate from this issue.
- **diode: about 9e-7 relative.** This is consistent with the OP
  convergence tolerance (reltol 1e-3 on the Newton update). No `.pz`-specific
  error.

No per-circuit tolerance or tuning was added. The regression tests in
`packages/core/src/analysis/pole-zero-active.test.ts` pin these exact ngspice
values. The bjt test uses 2e-3 and the diode test 2e-6, each with the reason
above.
