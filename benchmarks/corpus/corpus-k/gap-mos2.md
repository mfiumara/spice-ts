## Gap

In the licence-checked corpus-k batch for #980, 14 original decks fail spice-ts with `MOSFET level 2 model '...': series resistance parameter RSH/RD is not supported`. ngspice-47 succeeds on 13 of these identical inputs. e1480.cir is retained as a both-engine failure, not counted as a reference win.

Fixtures: k-1 through k-8, k-10 through k-12, k-15 through k-17. Sources are Xyce_Regression at 7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2, GPL-3.0-or-later. Circuits include a CMOS open-loop op-amp, NAND, ring oscillator, rectifier, mux and Schmitt triggers.

Implement ngspice-compatible MOS2 drain/source series resistance with RD/RS precedence and RSH*NRD/NRS, current reporting and AC/transient stamping. Preserve fail-closed behaviour until supported. No simulator changes in this benchmark PR.

Reproduce after corpus-k lands: `pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts`. All fixture bytes, per-engine statuses, matched-point metrics and runtime boundaries are recorded under benchmarks/corpus/corpus-k.

Duplicate search: all-state searches for `MOSFET level 2 resistance`, `RSH` and `MOS2`. Related closed #729 and #757 cover MOS1, #691 covers BSIM3. They do not implement MOS2 series resistance.
