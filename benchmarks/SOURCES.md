# Benchmark sources

This file records the provenance and redistribution decision for benchmark fixtures.
The machine-readable catalogue is `benchmarks/corpus/ngspice/manifest.json`.

## ngspice public corpus A

- Repository: https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/
- Pinned revision: `3ef069fb1f04177a153f342a32d941fc20ff047e`
- Licence: Modified BSD (`BSD-3-Clause`); upstream `COPYING` explicitly applies it to test and example files except listed exception paths.
- Licence source: https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/COPYING
- Redistribution decision: allowed for these paths; none is from an exception path.
- Adaptation: only the terminal newline is omitted during ingestion. Circuit content and internal line endings remain unchanged; no values or tolerances are changed.

| ID | Category | Canonical source | Revision | Licence | Redistribution | Local path | Adaptation |
|---|---|---|---|---|---|---|---|
| `vbic-fo` | op-dc | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/vbic/FO.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir` | terminal newline omitted |
| `vbic-temperature` | op-dc | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/vbic/temp.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/vbic/temp.cir` | terminal newline omitted |
| `mos6-inverter-transient` | tran | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/mos6/mos6inv.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir` | terminal newline omitted |
| `jfet-vds-vgs` | op-dc | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/jfet/jfet_vds-vgs.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/jfet/jfet_vds-vgs.cir` | terminal newline omitted |
| `rc-lowpass-ac` | ac | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/filters/lowpass.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/filters/lowpass.cir` | terminal newline omitted |
| `ac-zero-frequency` | ac | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/regression/misc/ac-zero.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/regression/misc/ac-zero.cir` | terminal newline omitted |
| `vbic-common-emitter-ac` | ac | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/vbic/CEamp.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/vbic/CEamp.cir` | terminal newline omitted |
| `probe-ac` | ac | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/probe/ac-test.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/probe/ac-test.cir` | terminal newline omitted |
| `rc-transient` | tran | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/general/rc.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/general/rc.cir` | terminal newline omitted |
| `mos-amplifier-transient` | tran | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/general/mosamp.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir` | terminal newline omitted |
| `mos6-simple-inverter-transient` | tran | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/mos6/simpleinv.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/mos6/simpleinv.cir` | terminal newline omitted |
| `ltra-line-transient` | tran | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/transmission/ltra1_1_line.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/transmission/ltra1_1_line.cir` | terminal newline omitted |
| `hfet-inverter` | nonlinear | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/hfet/inverter.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/hfet/inverter.cir` | terminal newline omitted |
| `mesa-oscillator` | nonlinear | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/mesa/mesosc.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir` | terminal newline omitted |
| `jimi-fuzz` | nonlinear | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/wave/jimi_fuzz.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir` | terminal newline omitted |
| `schmitt-trigger` | nonlinear | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/general/schmitt.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/general/schmitt.cir` | terminal newline omitted |
| `inductive-positive-definite-2x2` | convergence | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/inductive-systems/positive-definite-1.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/inductive-systems/positive-definite-1.cir` | terminal newline omitted |
| `inductive-positive-definite-3x3` | convergence | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/inductive-systems/positive-definite-2.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/inductive-systems/positive-definite-2.cir` | terminal newline omitted |
| `inductive-positive-definite-4x4` | convergence | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/inductive-systems/positive-definite-3.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/inductive-systems/positive-definite-3.cir` | terminal newline omitted |
| `inductive-positive-definite-ac` | convergence | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/inductive-systems/positive-definite-4.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/examples/inductive-systems/positive-definite-4.cir` | terminal newline omitted |

Validate provenance, hashes, ngspice execution, and spice-ts parsing with:

    pnpm build
    node benchmarks/corpus/ngspice/validate.mjs

The validator prints every currently unsupported or failing circuit; unsupported cases are not omitted from the corpus.

## Project-authored parity fixtures

| Circuit | Source | Licence / redistribution basis | Local use |
| --- | --- | --- | --- |
| Showcase boost converter (5 V input, 100 kHz, 50% duty) | [spice-ts issue #43](https://github.com/mfiumara/spice-ts/issues/43) and `examples/showcase/main.tsx` | Authored in the spice-ts project by Mattia Fiumara; distributed under the repository [MIT licence](../LICENSE) | Identical netlist is exercised by `packages/core/src/analysis/transient-driver-integration.test.ts` and compared with ngspice-47 reference samples. |

## Convergence audit fixtures

All benchmark material must identify its origin and redistribution terms. The
comparison harness runs the checked-in netlist unchanged in spice-ts and
ngspice; runner-added `.control` commands only export results and resource
statistics.

| Fixture(s) | Origin | Licence | Source / rationale |
|---|---|---|---|
| Generated DC scaling resistor ladder (`benchmarks/performance/scaling-fixture.mjs`) | Original spice-ts fixture | MIT (repository licence) | Deterministically generated; the same byte-for-byte netlist is supplied to spice-ts and ngspice. No third-party circuit material is included. |
| `convergence/circuits/gmin-reverse-diode.cir` | Original spice-ts fixture | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Authored for issue #56 to stress a nearly floating, reverse-biased nonlinear DC node. No third-party netlist was copied. |
| `convergence/circuits/source-step-bjt.cir` | Original spice-ts fixture | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Authored for issue #56 to stress the nonlinear DC solve with a high-beta, low-emitter-resistance BJT. No third-party netlist was copied. |
| `convergence/circuits/timestep-diode-rectifier.cir` | Original spice-ts fixture | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Authored for issue #56 to stress transient rejection at 1 ns diode-commutation edges. No third-party netlist was copied. |

Strategy references used by the audit, not copied into the fixtures:

- ngspice manual, convergence options and transient analysis: https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml
- ngspice `CKTop` operating-point fallback implementation (`src/spicelib/analysis/cktop.c`), GPL-2.0-or-later: https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/src/spicelib/analysis/cktop.c
- ngspice transient retry/timestep implementation (`src/spicelib/analysis/dctran.c`), GPL-2.0-or-later: https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/src/spicelib/analysis/dctran.c

## Gnucap public corpus E

- Repository: https://github.com/gnucap/gnucap
- Pinned revision: `5acb027125d6ea7c546badd03e026d8781c6a400`
- Licence: GNU General Public License v3.0 or later (`GPL-3.0-or-later`).
- Licence sources: pinned [`tests/MakeList`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/MakeList) notice and pinned complete [`COPYING`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/COPYING) text.
- Redistribution decision: allowed under GPL-3.0-or-later; the selected source-form tests are committed verbatim with the upstream test-suite notice and complete GPLv3 text.
- Adaptation: none. Fixture bytes and analysis/tolerance directives are unchanged from the pinned source.
- Category accounting: OP/DC 4, AC 4, TRAN 4, nonlinear 4, convergence-hard 4.

| ID | Category | Canonical source | Licence | Redistribution | Local path |
|---|---|---|---|---|---|
| `cccs-mixed-analysis` | op-dc | [`tests/d_cccs.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_cccs.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_cccs.1.ckt` |
| `vcvs-operating-point` | op-dc | [`tests/d_vcvs.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_vcvs.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_vcvs.1.ckt` |
| `diode-bias-sweep` | op-dc | [`tests/d_diode.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_diode.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_diode.1.ckt` |
| `mos1-inverter-sweep` | op-dc | [`tests/d_mos1.inv1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_mos1.inv1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_mos1.inv1.ckt` |
| `transmission-line-ac` | ac | [`tests/d_trln.ac.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_trln.ac.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_trln.ac.ckt` |
| `mutual-inductance-ac` | ac | [`tests/d_coil.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_coil.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_coil.1.ckt` |
| `bjt-diffpair-ac` | ac | [`tests/d_bjt-diffpair-tf.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_bjt-diffpair-tf.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-diffpair-tf.ckt` |
| `opamp-open-loop-ac` | ac | [`tests/opamp-ol.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/opamp-ol.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/opamp-ol.ckt` |
| `capacitor-step-transient` | tran | [`tests/d_cap.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_cap.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_cap.1.ckt` |
| `capacitor-initial-condition` | tran | [`tests/d_cap.ic1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_cap.ic1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_cap.ic1.ckt` |
| `lc-oscillator-transient` | tran | [`tests/oscillator.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/oscillator.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/oscillator.1.ckt` |
| `bjt-diffpair-transient` | tran | [`tests/d_bjt-diffpair-tran.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_bjt-diffpair-tran.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-diffpair-tran.ckt` |
| `bjt-schmitt-trigger` | nonlinear | [`tests/d_bjt-schmitt-nobypass.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_bjt-schmitt-nobypass.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-schmitt-nobypass.ckt` |
| `diode-temperature-sweep` | nonlinear | [`tests/d_diode.6.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_diode.6.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_diode.6.ckt` |
| `mos1-nand-transient` | nonlinear | [`tests/d_mos1.nand1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_mos1.nand1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_mos1.nand1.ckt` |
| `bjt-rtl-inverter-chain` | nonlinear | [`tests/d_bjt-rtlinv.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_bjt-rtlinv.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-rtlinv.ckt` |
| `dual-lc-uic-rejection` | convergence | [`tests/oscillator.7.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/oscillator.7.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/oscillator.7.ckt` |
| `opamp-voltage-follower` | convergence | [`tests/opamp-vf.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/opamp-vf.1.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/opamp-vf.1.ckt` |
| `mos7-nand-no-bypass` | convergence | [`tests/d_mos7.nand1.nobypass.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_mos7.nand1.nobypass.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_mos7.nand1.nobypass.ckt` |
| `bjt-diffpair-current-source` | convergence | [`tests/d_bjt-diffpair-ccs.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_bjt-diffpair-ccs.ckt) | GPL-3.0-or-later | committed verbatim | `benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-diffpair-ccs.ckt` |

Validate pinned provenance, unique hashes, byte-identical engine inputs, category accounting, and every visible engine result with:

    pnpm build
    node benchmarks/corpus/corpus-e/validate.mjs

The pinned validation receipt is `6129f3b6cb61d788f30752d3b72276073a3f564ea8d906b2c7b8a9fb79d6c1e2`: ngspice-47 passes 5/20 and reports 15 unchanged-dialect failures; spice-ts passes 0/20 and reports 20 parse, unsupported, or convergence failures. These losses are retained rather than adapted or omitted.
