# corpus-e-spice3: Gnucap regression decks translated to SPICE3

Lane 2 of issue #524. These are SPICE3/ngspice-dialect versions of the 15 corpus-e Gnucap fixtures
that ngspice rejects verbatim, so ngspice and spice-ts can run the same bytes. Nothing here is
registered in the aggregate report yet; lane 4 does that.

- Originals: `benchmarks/corpus/corpus-e/fixtures/tests/*.ckt`, unchanged, from gnucap/gnucap@5acb027125d6ea7c546badd03e026d8781c6a400.
- Translator: `benchmarks/translate/gnucap-to-spice3.ts`. It is deterministic and regenerates `fixtures/*.cir` and
  `translations.json` from the pinned originals. Run it with `--check` to verify the committed output.
- Test: `pnpm exec tsx --test benchmarks/translate/gnucap-to-spice3.test.ts`. It checks the per-rule behaviour, that the committed
  decks equal the script output, and that the manifest, licence files and reference outputs match.
- Engine run: `pnpm build && pnpm exec tsx benchmarks/corpus/corpus-e-spice3/run-engines.ts`. It runs both engines on the identical
  translated bytes, with the aggregate report's runners and metrics.
- Reference column: `reference/gnucap-out/*.ckt.out` are Gnucap's own regression outputs (`tests/==out`), copied byte for byte.
  Gnucap produced them from the original decks. They print at Gnucap's strobe points and use its own probe set.

## Licence

The Gnucap tests are GPL-3.0-or-later (`LICENSE-NOTICE.MakeList`, `COPYING.txt`; both are byte-identical to
the upstream files). The translated decks are modified versions. Each deck header states the source path and
revision, the licence, the modification date (2026-10-11), the tool that made the change, and every change.
The manifest records the same information.

## Translation rules

The translation only changes syntax. It never changes topology, element values, models or analyses:

- The original title line is kept verbatim. SPICE3 treats line 1 as the title whatever it contains.
- `.list`, `.width`, `.status`/`.stat` and bare `.options` are commented out. They only affect the console.
- Gnucap-only options are removed: `nopage`, `dampstrategy`, `trsteporder`, `noincmode` and `nobypass`.
- `.plot` becomes `.print` with plot ranges dropped. `.print op` is commented out because SPICE3 has no equivalent.
  Gnucap-only probes are dropped, for example `f()`, `iter()`, `vo()`, `id()` and `i(r1)`. The raw output still holds every
  node voltage and source current.
- `trace ...` is dropped from `.op`/`.tran`, `.ac <f>` becomes `.ac lin 1 <f> <f>`, `dc pulse(...)` becomes `pulse(...)`,
  `pwl 0 5 .1 0` becomes `pwl(0 5 .1 0)` and `off=1` becomes `off`.
- A duplicate instance name is renamed (`r3` to `r3_2`). Gnucap keeps both elements, which its own `.list`
  output shows, but SPICE3 rejects the second.
- `.tran` is accepted only when Gnucap itself reads the arguments in SPICE order (`analysis/s_tr_set.cc`).

A fixture that needs anything else is marked `unsupported-translation`. It is not approximated.

## Results (ngspice-47, spice-ts at c9d04b3, macOS arm64)

| fixture | translation | ngspice | spice-ts | worst abs error vs ngspice (spice-ts grid) |
|---|---|---|---|---|
| cccs-mixed-analysis | translated | pass | pass | ac 1.6e-13 V, op 0, tran 0 |
| vcvs-operating-point | translated | pass | pass | ac 3.3e-13 V, op 0 |
| transmission-line-ac | unsupported-translation: `gen()` source, `.param` re-assigned between analyses, bare `.ac`, step-size `.ac` form | - | - | - |
| mutual-inductance-ac | translated | pass | fail: K element before its inductors | - |
| bjt-diffpair-ac | translated | pass | pass | ac 0.517 v(4), dc 0.178 V v(5), op 0.119 V v(7), tran 0.139 V v(4) |
| opamp-open-loop-ac | unsupported-translation: bare `.ac` uses the last DC-sweep point as bias, bare `.dc` | - | - | - |
| capacitor-step-transient | translated | pass | pass | tran 3.05e-3 A i(v1) |
| capacitor-initial-condition | translated | pass | pass | tran 0 |
| lc-oscillator-transient | translated | pass | pass | tran 7.92 A i(l1) (loss) |
| bjt-schmitt-trigger | translated | pass | pass | op 4.7e-4 V v(4), tran 0.828 V v(6) (loss) |
| diode-temperature-sweep | translated | pass | pass | dc 5.5e-8 V, op 2.8e-6 V. spice-ts returns one 2-point DC plot for the two `.dc` cards; ngspice returns 3 and 11 points |
| mos1-nand-transient | translated | pass | pass | op 2.5e-7 V, tran 0.0752 V v(4) |
| dual-lc-uic-rejection | translated | pass | pass | tran 0.028 A i(l2) |
| opamp-voltage-follower | translated | pass | pass | ac 11.4 v(4), dc 0.792 V v(4), op 0.106 V v(7), tran 0.553 V v(5) (loss) |
| mos7-nand-no-bypass | unsupported-translation: Gnucap MOS level=7 (its BSIM3v3 port) has no ngspice level 7 | - | - | - |

These are single descriptive runs. The aggregate report (lane 4) is the place for full per-signal metrics.
