# Issue #716: EXP, SFFM and AM source waveforms and PWL TD=/R=

spice-ts rejected the SPICE3 `EXP(...)` and `SFFM(...)` waveforms, ngspice's `AM(...)`, and the PWL
`TD=` delay (and the `R=` repeat it is used with). They are now ported from ngspice-47:
`vsrcload.c`/`isrcload.c` for the values and `vsrcacct.c`/`isrcacct.c` for the breakpoints.

- EXP: an omitted or zero TD1, TAU1 or TAU2 defaults to TSTEP, and TD2 to TD1 + TSTEP.
- SFFM: FC defaults to 5/TSTOP, MDI to 90, and FM (also when 0) to 500/TSTOP. MDI is clamped to
  [0, FC/FM]. The value is 0, not VO, at and before TD, which includes the DC operating point.
- AM: VMA defaults to 1, FM to 5/TSTOP and FC to 500/TSTOP. The value is 0 at and before TD.
- PWL `TD=` shifts the waveform. Past the last point, `R=` folds time back into the section from the
  repeat point. `R` below -0.5 means no repeat. An `R` that matches no time point, or is not before
  the last point, is rejected (ngspice returns E_PARMVAL).
- Breakpoints: ngspice-47 registers none for EXP, SFFM or AM (`/* no breakpoints (yet) */`), and
  spice-ts doesn't either. A PWL with `TD=`/`R=` requests its next corner on accept, at
  `(T + corner) - mapped`, as ngspice does. That floating-point chain decides which side of a repeat's
  wrap-around jump gets sampled. In corpus-g VPWL, ngspice lands at 13.999999999999998, before the
  3 V -> 1 V jump, and at exactly 17, after it. Static `corner + TD + n*period` breakpoints sampled
  t = 14 after the jump instead, which made VPWL a mismatch (0.4 normalised, 2 V at t = 14) in this
  branch's first run.

## Corpus-g bucket "source: EXP/SFFM/AM waveforms and PWL TD=" (6 decks)

Both engines get byte-identical corpus-g (#711) fixtures and are compared with the corpus-f runner,
metric and 1% threshold. Nothing is tuned per circuit. Receipts:

- `receipts/parity-before.json`: the committed #711 `outcomes.json` entries.
- `receipts/parity-after.json`: this branch on main 9048f8cf.

| Fixture | Before | After | Worst signal (after) |
|---|---|---|---|
| IEXP/iexp.cir | unsupported | matched, 6.09e-11 | tran i(vmon) |
| ISFFM/isffm.cir | unsupported | matched, 8.18e-4 | tran i(vmon) |
| VEXP/vexp.cir | unsupported | matched, 3.55e-4 | tran i(vexp) |
| VPWL/vpwl.cir | unsupported | matched, 7.11e-13 | tran i(vpwl6) |
| VSFFM/vsffm.cir | unsupported | matched, 4.30e-5 | tran i(vssfm) |
| TL1X/TL1X_mpi.cir | unsupported | **unsupported**: `Unsupported device card: 'K'` (K inside a `.subckt`, #739) | - |

5 of 6 now match ngspice-47. TL1X gets past its `EXP` source and stops on a mutual-inductance card
inside a subcircuit, filed as #739.

Most of the remaining error in VEXP, IEXP and ISFFM comes from the step after t = 0: ngspice repeats
the first delta (0, 5e-10, 1e-9, 2e-9, ...), while spice-ts doubles it (0, 5e-10, 1.5e-9, 3.5e-9,
...). A plain `SIN` + resistor deck shows the same grid, so this comes from driver step control, not
the new sources. It is tracked in #561. The source values themselves agree with ngspice-47 to 1e-10
at ngspice's own time points (`packages/core/src/source-waveforms-716.test.ts`).

## Reproduce

```sh
pnpm build
for id in iexp-iexp-cir isffm-isffm-cir tl1x-tl1x-mpi-cir vexp-vexp-cir vpwl-vpwl-cir vsffm-vsffm-cir; do
  spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --corpus-g-fixture-child "$id"
done
```

`outcomes.json` is not regenerated here, because that needs the full 128-deck run. These per-bucket
receipts cover the 6 decks.
