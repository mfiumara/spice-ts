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

## Berkeley SPICE3f5 classic corpus B

- Repository mirror: https://github.com/obernin/spice
- Pinned revision: `3d9360bef370b432e473edb0c4333707d545a55f`
- Authoritative distribution: https://ptolemy.berkeley.edu/projects/embedded/pubs/downloads/spice/spice3f5.tar.gz
- Authoritative release: Berkeley SPICE3f5; archive SHA-256 `cac11fe2a761241e6b6c9eaa31b938c7ffa76aeaecac09809609d3a4125cd269`.
- Licence and notice: Berkeley's [`spice3f5/COPYRIGHT`](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/COPYRIGHT) grants permission to use, copy, modify, and distribute SPICE and requires its Regents copyright notice and two warranty paragraphs in all copies. The byte-identical notice is retained at `benchmarks/corpus/classic/COPYRIGHT.txt` (SHA-256 `6dbad063070d502230501ddb05aced2e896eb636939c09b626d11c3e00b9aed4`). That hash matches both `spice3f5/COPYRIGHT` in the authoritative archive and `COPYRIGHT` at the pinned mirror revision.
- Mirror notice: the mirror maintainer's separate 2018 BSD-3-Clause notice is retained verbatim at `benchmarks/corpus/classic/LICENSE.txt`; it is not represented as the provenance or redistribution basis for the Berkeley-authored fixtures.
- Redistribution decision: allowed by the Berkeley SPICE grant, with its required notice retained alongside the fixtures.
- Adaptation: none. All 20 `.cir` files are committed byte-for-byte from the pinned mirror. The validator runs the identical files in both engines; `-r output.raw` only asks ngspice to export its result and does not alter a netlist.

| ID | Category | Canonical source | Revision | Licence | Redistribution | Local path | Adaptation |
|---|---|---|---|---|---|---|---|
| `bjt-noise` | noise | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bjtnoise.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bjtnoise.cir` | none |
| `bsim1-device-sweep` | device-characterization | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bsim1tst.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bsim1tst.cir` | none |
| `bsim2-device-sweep` | device-characterization | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bsim2tst.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bsim2tst.cir` | none |
| `bjt-differential-pair` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/diffpair.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/diffpair.cir` | none |
| `diode-distortion` | distortion | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/diodisto.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir` | none |
| `lossy-line-24-inch` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_1.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir` | none |
| `lossy-line-aluminium` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_2.cir` | none |
| `coupled-lossy-lines` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_3.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_3.cir` | none |
| `bjt-mixer-distortion` | distortion | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mixdisto.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mixdisto.cir` | none |
| `mos6-inverter-chain` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mos6inv.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mos6inv.cir` | none |
| `mos-amplifier` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mosamp2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir` | none |
| `mos-memory-cell` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mosmem.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mosmem.cir` | none |
| `pole-zero-four-stage` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/pz2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/pz2.cir` | none |
| `pole-zero-three-stage` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/pzt.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/pzt.cir` | none |
| `rc-transient` | passive | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rc.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rc.cir` | none |
| `rca3040-wideband-amplifier` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rca3040.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rca3040.cir` | none |
| `resistor-noise` | noise | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/resnoise.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/resnoise.cir` | none |
| `rtl-inverter-chain` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rtlinv.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rtlinv.cir` | none |
| `ecl-schmitt-trigger` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/schmitt.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/schmitt.cir` | none |
| `high-pass-pole-zero` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/simplepz.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant | committed | `benchmarks/corpus/classic/fixtures/spice3f5/simplepz.cir` | none |

Validate provenance fields, pinned URLs, fixture hashes, declared analyses, ngspice execution, and spice-ts parsing with:

    pnpm build
    node benchmarks/corpus/classic/validate.mjs

At ingestion on ngspice-47, 19 circuits produce raw analysis data. `bjt-mixer-distortion` is retained as a visible source-suite failure: both of its upstream `.disto` commands are commented out, so ngspice exits successfully without producing raw data. All 20 byte-identical fixtures currently fail spice-ts parsing. The validator prints each failure and checks it against the manifest instead of hiding or rewriting unsupported inputs.

## Bounded pole-zero parity fixtures

| Circuit(s) | Canonical source / revision | Licence | Redistribution / adaptation | Local use |
|---|---|---|---|---|
| Passive RLC and active four-stage `.pz` | Berkeley SPICE3f5 [`simplepz.cir`](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/simplepz.cir) and [`pz2.cir`](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/pz2.cir), pinned mirror revision `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant retained at `benchmarks/corpus/classic/COPYRIGHT.txt`; redistribution is allowed with that notice | `passive-rlc.cir` preserves `simplepz.cir` and adds one 1 uH shunt inductor so the bounded fixture exercises R, L, and C dynamics. `active-four-stage.cir` changes only the source card from ngspice's implicit `iin 1 0 ac` zero bias to explicit `iin 1 0 dc 0`; its topology, values, and `.pz` command are unchanged. The committed local bytes are supplied identically to both engines. | `benchmarks/pole-zero/{passive-rlc,active-four-stage}.cir`; compare with `pnpm exec tsx benchmarks/pole-zero/compare.ts` using ngspice-47. |

## Bounded sensitivity parity fixtures

| Circuit(s) | Canonical source / revision | Licence | Redistribution / adaptation | Local use |
|---|---|---|---|---|
| Passive RLC DC and DEC AC `.sens` | Berkeley SPICE3f5 [`simplepz.cir`](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/simplepz.cir), pinned mirror revision `3d9360bef370b432e473edb0c4333707d545a55f` | Berkeley SPICE grant retained at `benchmarks/corpus/classic/COPYRIGHT.txt`; redistribution is allowed with that notice | The two fixtures retain the public two-resistor/capacitor filter basis, add an independent voltage source and series inductor, and replace `.pz` with bounded DC or DEC AC `.sens`. Values and topology are then frozen; each committed file is supplied byte-identically to both engines. | `benchmarks/sensitivity/passive-rlc-{dc,ac}.cir` |
| Active VCVS DEC AC `.sens` | Gnucap [`tests/d_vcvs.1.ckt`](https://github.com/gnucap/gnucap/blob/5acb027125d6ea7c546badd03e026d8781c6a400/tests/d_vcvs.1.ckt), pinned revision `5acb027125d6ea7c546badd03e026d8781c6a400` | GPL-3.0-or-later; pinned notice and complete licence retained at `benchmarks/corpus/corpus-e/LICENSE-NOTICE.md` and `benchmarks/corpus/corpus-e/COPYING.txt` | Retains the source, divider, gain-4 VCVS, and output load; removes Gnucap-only output cards and the unrelated VCCS branch, sets the source DC bias explicitly to zero, and replaces repeated `.op`/`.ac` cards with one bounded DEC AC `.sens`. The resulting committed file is supplied byte-identically to both engines. | `benchmarks/sensitivity/active-vcvs-ac.cir` |
| Two-source DEC AC `.sens` rejection regressions | [spice-ts PR #178 review cases](https://github.com/mfiumara/spice-ts/pull/178), authored by project owner Mattia Fiumara | Original spice-ts project fixtures, distributed under the repository MIT licence | The two-active and zero-first review netlists are retained exactly apart from their descriptive title lines. Each committed file is supplied byte-identically to both engines; ngspice reference vectors and spice-ts's explicit unsupported-topology errors are verified by the comparison command. | `benchmarks/sensitivity/multi-source-ac.cir`, `benchmarks/sensitivity/zero-first-multi-source-ac.cir` |

Run `pnpm exec tsx benchmarks/sensitivity/compare.ts` with ngspice-47. The JSON receipt reports the engine version, machine, identical paths, deterministic native order, matched-point maximum/RMS absolute and relative errors, every non-zero residual as a retained loss, convergence failures, and the explicit unsupported matrix.

## Bounded ideal-linear distortion parity fixtures

- Canonical public source: ngspice public corpus A [`tests/filters/lowpass.cir`](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/filters/lowpass.cir), pinned revision `3ef069fb1f04177a153f342a32d941fc20ff047e`.
- Licence: BSD-3-Clause under the pinned ngspice [`COPYING`](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/COPYING); the retained notice is `benchmarks/corpus/ngspice/LICENSE.txt`.
- Redistribution decision: allowed. The adapted source-form fixture remains under BSD-3-Clause.
- Adaptation: `benchmarks/distortion/linear-lowpass.cir` comments the unsupported `.OPTIONS` card, replaces `.AC DEC 10 1k 1Meg` with `.DISTO DEC 10 1k 1Meg`, and changes only `DISTOF1 0` to `DISTOF1 1`. `benchmarks/distortion/two-tone-linear-lowpass.cir` makes the same changes, adds `f2overf1=0.9`, and changes `DISTOF2 0` to `DISTOF2 0.25 30`. Each title describes its bounded run. Topology, component values, remaining source clauses, and sweep bounds are unchanged. Each committed file is supplied byte-identically to spice-ts and ngspice-47.
- Scope: one DEC single-tone and one DEC two-tone ideal-linear RC case. The single-tone result covers second- and third-harmonic complex outputs. The two-tone result covers ngspice's separate `f1+f2`, `f1-f2`, and `2f1-f2` plots. All represented values are mathematically zero. Semiconductor nonlinear, stepped, LIN/OCT, controlled-source, coupled, transmission-line, arbitrary multi-excitation, protocol-v1, streaming, and external-backend distortion remain explicitly unsupported.
- Reproduce with `pnpm bench:disto`. The JSON receipt reports ngspice-47 and runtime versions, machine, fixture hashes, byte-identical inputs, convergence, runtimes, stable frequency/vector/product order, matched-point maximum/RMS absolute and relative errors, every loss, and all unsupported forms.

## Bounded stepped transfer-function parity fixture

- Fixture: `benchmarks/stepped-transfer-function/stepped-divider.cir` (SHA-256 `dfb418673a8064df89b93eaa3524580523aaf5db9f5dbdf93345827afd8e684c`).
- Source: project-authored public reference circuit for [issue #208](https://github.com/mfiumara/spice-ts/issues/208).
- Licence: MIT, under the repository [licence](../LICENSE). Redistribution is allowed; no third-party circuit material was copied.
- Adaptation: the committed four-point `R2` LIST grid is executed directly by spice-ts. ngspice-47 reports `unimplemented dot command '.step'`, so the comparison harness records that loss and expands the grid deterministically. At each matched value, the same expanded netlist bytes are supplied to both engines. The direct spice-ts result is also checked against its expanded single-point runs. No circuit value, tolerance, or engine-specific deck is used to hide an error.
- Reproduce with `pnpm bench:stepped-tf`. The JSON receipt reports convergence at every step, deterministic order, max/RMS absolute and relative errors for transfer, input resistance, and output resistance, runtimes with process-boundary caveats, unsupported forms, and all retained losses.

## Bounded Gummel-Poon forward-active parity fixtures

- Public source: John P. Doty's CA3080 ngspice model, [`ca3080.mod`](https://github.com/xxv/gedasymbols/blob/49eda5e627e167fcb6346ef9805535ca92e43b0c/www/user/john_doty/models/opamp/ca3080.mod), pinned `gedasymbols` revision `49eda5e627e167fcb6346ef9805535ca92e43b0c`.
- Licence: GPL-2.0-or-later, stated in the source file by its copyright holder; the complete GPLv2 text is already retained at `benchmarks/corpus/corpus-d/COPYING.txt`.
- Redistribution decision: allowed under GPL-2.0-or-later. The upstream file is not copied. The checked-in test decks identify the source and use only the bounded numeric subset of its `VERTNPN` model card: `LEVEL`, `IS`, `VAF`, `BF`, `ISE`, `NE`, `IKF`, and `BR`.
- Adaptation: the original CA3080 subcircuit is replaced by a project-authored, deterministic common-emitter characterization grid. Unsupported temperature, resistance, capacitance, transit-time, reverse high-current, and substrate parameters are omitted rather than silently accepted. The resulting local deck bytes are supplied identically to spice-ts and ngspice-47 at VBE 0.55–0.70 V and VCE 1, 5, and 9 V.
- Local paths: `benchmarks/gummel-poon/{vce-1,vce-5,vce-9}.cir`; compare with `pnpm exec tsx benchmarks/gummel-poon/compare.ts`.

## Bounded lossless transmission-line parity fixtures

- Canonical public source: ngspice User's Manual version 47, [lossless T-card syntax and `Z0=50 TD=10NS` example](https://nmg.gitlab.io/ngspice-manual/transmissionlines/losslesstransmissionlines.html) plus the public [transmission-line inverter step-response example](https://nmg.gitlab.io/ngspice-manual/examplecircuits/transmission-lineinverter.html).
- Revision: ngspice release/manual version 47 (downloaded from the [versioned documentation page](https://ngspice.sourceforge.io/docs.html)).
- Licence: CC-BY-SA-4.0; the manual's [documentation licence notice](https://nmg.gitlab.io/ngspice-manual/copyrightsandlicenses/documentationlicense.html) applies.
- Redistribution decision: allowed with attribution and ShareAlike. The two small source-form fixtures are adaptations and this fixture section is offered under CC-BY-SA-4.0; simulator code remains MIT.
- Adaptation: the documented one-line `Z0`/`TD` form and pulse-step topology are reduced to one grounded 50-ohm, 5 ns line. `matched.cir` uses 50-ohm source/load terminations. `mismatched.cir` changes only those terminations to 25/100 ohms so source and load reflections are observable. Both engines receive each committed netlist byte-for-byte; no engine-specific tolerance or circuit rewrite is used.

| Fixture | SHA-256 | Expected behavior | Command |
|---|---|---|---|
| `benchmarks/lossless-tline/matched.cir` | `84333a39888bc3dc72b8c492c749d493230fb705f39ce02fb689d76ad9fd9fbb` | 0.5 V launch and 5 ns one-way propagation; no round-trip reflection | `pnpm exec tsx benchmarks/lossless-tline/compare.ts` (internally runs ngspice-47 in batch mode) |
| `benchmarks/lossless-tline/mismatched.cir` | `5da221908fe4c0a2f522026d3c1a25746b345adedf870442e14af67308ab22c1` | 2/3 V launch, 8/9 V first load step, 22/27 V source return, 64/81 V second load step | same |

## Bounded MOSFET level-1 noise parity fixture

- Fixture: `benchmarks/mos1-noise/mos1-noise.cir` (SHA-256 `cd8f360eb0db90b1f4796df474bc6b2b435ad77a39d16ee8cbd4bc79197acb5b`).
- Source: project-authored public reference circuit for [issue #189](https://github.com/mfiumara/spice-ts/issues/189), pinned by the fixture SHA-256 above.
- Licence: MIT, under the repository [licence](../LICENSE); redistribution is allowed. No third-party netlist was copied.
- Adaptation: none. The committed bytes are supplied identically to spice-ts and ngspice-47. The fixture exercises MOS1 channel thermal noise and default `NLEV=2` KF/AF flicker noise over a DEC sweep.
- Reproduce with `pnpm exec tsx benchmarks/mos1-noise/compare.ts`; the command records source/hash, versions, machine, convergence, runtimes, matched-point max/RMS absolute and relative errors, integrated totals, and remaining unsupported losses.

## Bounded BJT level-1 noise parity fixture

- Fixture: `benchmarks/bjt-noise/bjt-noise.cir` (SHA-256 `4e005d6433ee14cd41c8d6d793e661077e99d5802a91e93419ab1e5b4c4f93d3`).
- Source: project-authored public reference circuit for [issue #199](https://github.com/mfiumara/spice-ts/issues/199), pinned by the fixture SHA-256 above.
- Licence: MIT, under the repository [licence](../LICENSE); redistribution is allowed. No third-party netlist was copied.
- Adaptation: none. The committed bytes are supplied identically to spice-ts and ngspice-47. The forward-active fixture exercises BJT level-1 collector and base shot noise together with external base/load resistance thermal noise over a DEC sweep.
- Reproduce with `pnpm exec tsx benchmarks/bjt-noise/compare.ts`; the command records source/hash, versions, machine, convergence, runtimes, matched-point max/RMS absolute and relative errors, integrated totals, and all remaining unsupported losses.

## Bounded BJT level-1 internal-resistance noise parity fixture

- Fixture: `benchmarks/bjt-internal-resistance-noise/bjt-internal-resistance-noise.cir` (SHA-256 `f3166a899574399ae7351f48569c898a7c4353ed8d11951148eede4f6c8eeff4`).
- Source: project-authored public reference circuit for [issue #243](https://github.com/mfiumara/spice-ts/issues/243), pinned by the fixture SHA-256 above.
- Licence: MIT, under the repository [licence](../LICENSE); redistribution is allowed. No third-party netlist was copied.
- Adaptation: none. The committed bytes are supplied identically to spice-ts and ngspice-47. The fixture adds fixed level-1 `RB=100`, `RC=10`, and `RE=10` to the existing forward-active topology and exercises their thermal noise together with collector/base shot noise and external resistance noise over a DEC sweep.
- Reproduce with `pnpm exec tsx benchmarks/bjt-internal-resistance-noise/compare.ts`; the command records source/hash, versions, machine, convergence, runtimes, matched-point max/RMS absolute and relative errors, integrated totals, explicit exclusions, and every retained loss. The `/poteto-mode` design receipt is `benchmarks/bjt-internal-resistance-noise/POTETO.md`.

## Bounded BJT level-1 flicker-noise parity fixture

- Fixture: `benchmarks/bjt-flicker-noise/bjt-flicker-noise.cir` (SHA-256 `d9001973f05126c8590e28818d83655eb0ff315b3a3eecc69ee76c28296daa4a`).
- Source: project-authored public reference circuit for [issue #248](https://github.com/mfiumara/spice-ts/issues/248), pinned by the immutable fixture hash above.
- Licence: MIT, under the repository [licence](../LICENSE); redistribution is allowed. No third-party netlist was copied.
- Reference equation: ngspice [`bjtnoise.c`](https://github.com/ngspice/ngspice/blob/032b1c32/src/spicelib/devices/bjt/bjtnoise.c#L126-L149), pinned revision `032b1c32`, BSD-3-Clause under ngspice's [`COPYING`](https://github.com/ngspice/ngspice/blob/032b1c32/COPYING).
- Adaptation: none. The committed bytes are supplied identically to spice-ts and ngspice-47. The fixture exercises level-1 `KF=1e-9`, `AF=1.2` base-current flicker noise while retaining collector/base shot noise and `RB`/`RC`/`RE` plus external-resistance thermal noise over a DEC sweep. No per-engine tolerance or value changes are made.
- Reproduce with `pnpm exec tsx benchmarks/bjt-flicker-noise/compare.ts -- --output benchmarks/bjt-flicker-noise/results.json`; the receipt reports source revision/licence/hash, versions, machine, identical inputs, matched-point max/RMS absolute and relative errors, integrated errors, runtimes, unsupported forms, and every retained loss. The `/poteto-mode` design receipt is `benchmarks/bjt-flicker-noise/POTETO.md`.

## Xyce Regression Suite corpus C

- Repository: https://github.com/Xyce/Xyce_Regression
- Pinned revision: `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`
- Licence: GPL-3.0-or-later. The pinned repository [copyright and licence notice](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/README.md#copyright-and-license) grants redistribution and modification under GPL version 3 or later.
- Licence retention: the byte-identical upstream README is retained as `benchmarks/corpus/xyce/LICENSE-NOTICE.md` (SHA-256 `82ff6df7bddcdf639483d261949a02a5f43da85d579f1242b05c3aa0c430f7cb`), and the complete GPLv3 text from https://www.gnu.org/licenses/gpl-3.0.txt is retained as `benchmarks/corpus/xyce/COPYING.txt` (SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`).
- Redistribution decision: allowed under GPL-3.0-or-later with the copyright/licence notice and complete licence text retained alongside the fixtures.
- Adaptation: none. All 20 `.cir` files are committed byte-for-byte from the pinned revision. The validator fetches every pinned source, checks its hash and bytes, and supplies the same local bytes to native ngspice and spice-ts without tolerance changes.

| ID | Category | Canonical source | SHA-256 | Local path |
|---|---|---|---|---|
| `capacitor-rc-transient` | capacitor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/CAPACITOR/capacitor.cir) | `38b0d8271d4cef0f783be9a5ba0bc391c6d164fbe0dba9027e93927f0656e90b` | `benchmarks/corpus/xyce/fixtures/CAPACITOR/capacitor.cir` |
| `capacitor-rc-transient-newlte` | capacitor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/CAPACITOR/capacitor3.cir) | `628f4953ca83a0e8840e100ea4671c778afe47bdcad0f52c09f5053c023c5194` | `benchmarks/corpus/xyce/fixtures/CAPACITOR/capacitor3.cir` |
| `capacitor-rc-oscillator` | capacitor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/CAPACITOR/rc_osc.cir) | `add8ca9d2654398a4c394bc9232809677b479fe35172c66bbb8e2ad9bf9410a4` | `benchmarks/corpus/xyce/fixtures/CAPACITOR/rc_osc.cir` |
| `diode-level2-temperature-breakdown` | diode | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/DIODE/Level2_Temp_Dep_Breakdown.cir) | `9c52a577a2f0b0a7419160b6cd340894ed41ebc403023a3b3f1d809d171bee0e` | `benchmarks/corpus/xyce/fixtures/DIODE/Level2_Temp_Dep_Breakdown.cir` |
| `diode-zener-5229` | diode | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/DIODE/Zener_5229.cir) | `aefc2180e4bb6a5b39e3f4105546f3c5ba22af3b74f003d2d4d3c55f45938e9e` | `benchmarks/corpus/xyce/fixtures/DIODE/Zener_5229.cir` |
| `diode-transient` | diode | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/DIODE/diode.cir) | `334e2dde43335851dc96f76ba5e78ef3e0b1de142cca073b3c70f83937637d8c` | `benchmarks/corpus/xyce/fixtures/DIODE/diode.cir` |
| `diode-sidewall-dc` | diode | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/DIODE/diode_with_sidewall.cir) | `fb7d40fe14305d830afa0c4477e68b2da541f428883cec677f4c8cb13906d658` | `benchmarks/corpus/xyce/fixtures/DIODE/diode_with_sidewall.cir` |
| `inductor-transient` | inductor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/INDUCTOR/inductor.cir) | `a0a869d9fe3b04d3bbdc8abf9e8a89a9302a54ac5be9c97f446f06834a248b35` | `benchmarks/corpus/xyce/fixtures/INDUCTOR/inductor.cir` |
| `njfet-2109-dc` | jfet | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/NJFET_DC/njfet-2109.cir) | `d25578ed59ddc0f94e3a2f9281f1200982f82c682ec63d5256bf0399f34ecd46` | `benchmarks/corpus/xyce/fixtures/NJFET_DC/njfet-2109.cir` |
| `njfet-stepped-dc` | jfet | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/NJFET_DC/njfet.cir) | `295e3d4208ea2d839acf4724473b921ef1706976b254912b6e8455508c65b412` | `benchmarks/corpus/xyce/fixtures/NJFET_DC/njfet.cir` |
| `nmos-level1-dc` | mosfet | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/NMOS1_DC/nmos1.cir) | `3ab24382b4fb966d2111ba8b2aa0590b989fc09b367c09eb41cc7ac475e0e255` | `benchmarks/corpus/xyce/fixtures/NMOS1_DC/nmos1.cir` |
| `npn-dc` | bjt | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/NPN_DC/npn1.cir) | `8775a88a3f9c032ee047d770781a5a0cbcf21a2e28b7b6352e63636a7c9f1ce0` | `benchmarks/corpus/xyce/fixtures/NPN_DC/npn1.cir` |
| `pmos-level1-dc` | mosfet | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/PMOS1_DC/pmos1.cir) | `767c989ba6c4ad761d2211ae39c9c82536895e76f6288e77276ad9468b2b2093` | `benchmarks/corpus/xyce/fixtures/PMOS1_DC/pmos1.cir` |
| `pnp-dc` | bjt | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/PNP_DC/pnp1.cir) | `95796ac998eb051a535fcb498c259e715c1e8edd237e1e07add401fc6a1601df` | `benchmarks/corpus/xyce/fixtures/PNP_DC/pnp1.cir` |
| `resistor-dc` | resistor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/RESISTOR/resistor.cir) | `c0def3533cd6c07bf3cc6ee06f806c50d0b491d4d70d8296cc286ad8fc6066ba` | `benchmarks/corpus/xyce/fixtures/RESISTOR/resistor.cir` |
| `resistor-level3-zero` | resistor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/RESISTOR/resistor_lv3.cir) | `ab40c80d1175ad3079155b07bfed914b7085a6d9396f16a577446deb7693eb81` | `benchmarks/corpus/xyce/fixtures/RESISTOR/resistor_lv3.cir` |
| `resistor-negative` | resistor | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/RESISTOR/resistor_neg.cir) | `7576379306251dd8c2baf89b4dbbe25527c399edb1fd701e7e5d38e83851614b` | `benchmarks/corpus/xyce/fixtures/RESISTOR/resistor_neg.cir` |
| `rlc-transient` | rlc | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/RLC/rlc.cir) | `4d52f9df5eb4fe814fdd137e3f66cd4b4ec6c988174e0fe1c7a19e6eddf21763` | `benchmarks/corpus/xyce/fixtures/RLC/rlc.cir` |
| `vccs-dc` | controlled-source | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/VCCS/vccs.cir) | `963d8d506600a2ac7f43812156739c8f49d332c50701f64268041ecd51b0306d` | `benchmarks/corpus/xyce/fixtures/VCCS/vccs.cir` |
| `vcvs-dc` | controlled-source | [upstream](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/VCVS/vcvs.cir) | `62541466b4010245a24d2c37b35c3debfc675b86f1bd3b2523fb91a01b4bbd5c` | `benchmarks/corpus/xyce/fixtures/VCVS/vcvs.cir` |

Validate all pinned fetches, fixture hashes, byte-identical engine inputs, declared analyses, and expected outcomes with:

    pnpm build
    node benchmarks/corpus/xyce/validate.mjs

At ingestion on ngspice-47, 13 circuits produce raw analysis data and 7 fail on explicitly reported Xyce/PSpice syntax or features. All 20 currently fail in spice-ts: 9 parse failures, 7 unsupported-feature failures, and 4 execution failures; no convergence failure is hidden or omitted. The validator emits every circuit and checks these outcomes rather than adapting inputs or changing tolerances.

## Project-authored parity fixtures

| Circuit | Source | Licence / redistribution basis | Local use |
| --- | --- | --- | --- |
| Showcase boost converter (5 V input, 100 kHz, 50% duty) | [spice-ts issue #43](https://github.com/mfiumara/spice-ts/issues/43) and `examples/showcase/main.tsx` | Authored in the spice-ts project by Mattia Fiumara; distributed under the repository [MIT licence](../LICENSE) | Identical netlist is exercised by `packages/core/src/analysis/transient-driver-integration.test.ts` and compared with ngspice-47 reference samples. |

## Independent current-source polarity parity fixtures

- Source: [spice-ts issue #196](https://github.com/mfiumara/spice-ts/issues/196) and the TDD reproduction introduced at revision [`61e05afe8c8bd7e6fd644410439dfbec0be97c19`](https://github.com/mfiumara/spice-ts/commit/61e05afe8c8bd7e6fd644410439dfbec0be97c19).
- Licence: MIT, under the repository [licence](../LICENSE).
- Redistribution decision: allowed. These three minimal netlists were authored in this project for issue #196 and contain no third-party circuit material.
- Adaptation: none between engines. `compare.ts` reads each committed file once and supplies those bytes to spice-ts and ngspice-47. No per-engine values, tolerances, or rewrites are used.
- Coverage: `op.cir`, `dc.cir`, and `tran.cir` exercise the shared positive-to-negative independent current-source stamp. An AC-form source's DC bias uses that stamp and has a core regression test. Nonzero independent current-source AC excitation uses a separate excitation path and is not claimed by this bounded comparison.
- Command: `pnpm bench:current-source-polarity`. The JSON report records commands, versions, machine data, convergence status, and max/RMS absolute and relative errors for `V(out)`.

## Independent current-source AC parity fixtures

- Source: [spice-ts issue #198](https://github.com/mfiumara/spice-ts/issues/198) and its TDD reproduction at revision [`61bef6f4a1a69420ef306e52de27bb0686379cac`](https://github.com/mfiumara/spice-ts/commit/61bef6f4a1a69420ef306e52de27bb0686379cac).
- Licence: MIT, under the repository [licence](../LICENSE).
- Redistribution decision: allowed. The three minimal netlists were authored in this project for issue #198 and contain no third-party circuit material.
- Adaptation: none. `compare.ts` reads each committed file once and supplies those exact bytes to spice-ts and ngspice-47. No engine-specific values, tolerances, or circuit rewrites are used.
- Coverage: grounded positive-to-ground orientation (`grounded.cir`, SHA-256 `0eb133dbf34d18fdf231a0d35d361d5040fd0d599a5b83a9de909c27e0a9c120`), phased non-ground node-pair orientation (`floating.cir`, SHA-256 `c3817778c2d5757caae8f2ad67771c3f58ee799e29c7974a5f0eb2a00a6e019f`), and deterministic mixed voltage/two-current-source complex superposition (`mixed.cir`, SHA-256 `50419ff61998734392e2c626ef5a2494eadd682de7d4da5e9c7962ed07467bfa`).
- Command: `pnpm bench:current-source-ac -- --output benchmarks/current-source-ac/results.json`. The JSON receipt records ngspice version, machine, commands, convergence, runtimes, and matched-frequency max/RMS absolute and relative errors. Every residual is retained as a loss; no superiority claim is made.

## Bounded diode-noise parity fixtures

| Circuit(s) | Canonical source / revision | Licence | Redistribution / adaptation | Local use |
|---|---|---|---|---|
| Forward-biased diode shot and flicker noise, LIN/DEC/OCT | Original spice-ts benchmark specified by [issue #179](https://github.com/mfiumara/spice-ts/issues/179), issue revision as of 2026-10-10. Reference equations and behavior are pinned to ngspice source revision [`032b1c32`](https://github.com/ngspice/ngspice/blob/032b1c32/src/spicelib/devices/dio/dionoise.c). | Fixtures dedicated [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/); ngspice reference source is BSD-3-Clause under its pinned `COPYING`. | The three original fixture decks differ only in the `.noise` LIN/DEC/OCT card and are committed for unrestricted redistribution. No values or tolerances are adapted between engines; the runner adds only temporary ngspice output-control commands. | `benchmarks/diode-noise/diode-noise-{lin,dec,oct}.cir`; compare against ngspice-47 with `pnpm exec tsx benchmarks/diode-noise/compare.ts`. |

## Chua & Lin circuit, issue #48

- Fixture: `benchmarks/circuits/chua-issue-48.cir`
- Source: [spice-ts issue #48](https://github.com/mfiumara/spice-ts/issues/48), opened by Mattia Fiumara on 2026-05-05, including an LTspice schematic labelled “Chua & Lin, 8-7 page 343”.
- Reconstruction: transcribed from that issue screenshot. The issue text explicitly confirms `C12 ic=2 V` and `C3 ic=5 V`; the screenshot additionally shows `L8 ic=2 A`, the three coupling coefficients, component values, source parameters, and `.tran 0 200 0 0.2 uic`.
- Licence: the fixture is an original plain-text reconstruction contributed to this MIT-licensed repository. The source screenshot is linked for provenance but is not redistributed.
- Reference simulator: ngspice-47. Because ngspice rejects LTspice’s zero print-step extension, the reference run changes only the first `.tran` operand from `0` to `0.2`; `tstop`, `tstart`, `tmax`, topology, values, and initial conditions remain identical.
- Reference command: `pnpm exec tsx benchmarks/chua-ngspice.ts`. The script applies the documented `.tran` adaptation, runs ngspice in batch mode, and prints the waveform metrics as JSON.
- ngspice-47 reference (56,663 accepted points): after 20 s, `V(y)` spans 0.454439238–1.03693966 V and crosses its post-20 s mean five times. These envelope/crossing metrics are used instead of pointwise chaotic-waveform equality.
- spice-ts diagnosis after adding bounded K-element/UIC support: because semantic `.options` directives remain explicitly unsupported, the native run removes only `.options reltol=1e-12` and supplies the identical `reltol` through `SimulationOptions`. After reconciling the issue #43 boost-convergence fix, it still ends with `TimestepTooSmallError`, now at `t=0.2000001935667476 s` (`dt=1.7759231585312563e-16 s`) with the normal transient iteration budget. Two reconciliation runs reproduced the same failure coordinates and took 3.28 s and 2.77 s on the development machine, versus 45.664 s at the pre-reconciliation head. This is reported as a remaining transient-convergence gap, not parity.

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

The pinned validation receipt is `a2acada11be950a85fdafebb6f346880ea0acaf0051261a796d2125694a65924`: ngspice-47 passes 5/20 and reports 15 unchanged-dialect failures; spice-ts passes 0/20 and reports 20 parse, unsupported, or convergence failures. These losses are retained rather than adapted or omitted.

## ahkab test-suite corpus D

- Repository: https://github.com/ahkab/ahkab
- Pinned revision: `1e8939194b689909b8184ce7eba478b485ff9e3a`
- Licence: GPL-2.0-only. The pinned repository README identifies the project as GPLv2, and the pinned [`COPYING`](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/COPYING) contains the complete GNU GPL version 2 terms.
- Licence retention: the byte-identical upstream README is retained as `benchmarks/corpus/corpus-d/LICENSE-NOTICE.md` (SHA-256 `064b6a2dd3536d1699e32ffec05e3f960bd8eccda8e300109878bf2569915b2f`), and the byte-identical GPLv2 text is retained as `benchmarks/corpus/corpus-d/COPYING.txt` (SHA-256 `ee8a06e8bf69c8b547477f2a6652d330f4a4bc7d8a29d0b8b573b19abfc06e71`).
- Redistribution decision: allowed under GPL-2.0-only. These source-form test circuits are redistributed verbatim with the upstream project notice and full licence text.
- Adaptation: none. All 20 `.ckt` files are committed byte-for-byte from the pinned revision. The validator fetches each pinned source, checks exact bytes and hashes, and supplies the same local bytes to native ngspice and spice-ts without tolerance or circuit changes.

| ID | Category | Canonical source | SHA-256 | Local path |
|---|---|---|---|---|
| `ohms-law-op` | op-dc | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/ohms_law/ohms_law.ckt) | `be2e9901695aab2a53c140f845bb0fe41d3c43eecd41cddca3ce6c4946b5bbd2` | `benchmarks/corpus/corpus-d/fixtures/tests/ohms_law/ohms_law.ckt` |
| `diode-operating-point` | op-dc | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/diode_op/diode_op.ckt) | `1c7dbbf5941ce07f6806803f1c22df8165acde82d5dd66f9a9076da009e19b8e` | `benchmarks/corpus/corpus-d/fixtures/tests/diode_op/diode_op.ckt` |
| `ekv-bias-sweep` | op-dc | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/ekv1/ekv1.ckt) | `2d680251e499b4b857ea78280d8e8c0e2114eb0977d2b1b4f69ba234a08f0271` | `benchmarks/corpus/corpus-d/fixtures/tests/ekv1/ekv1.ckt` |
| `downscaling-current-mirror` | op-dc | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/downscaling_cm/downscaling_cm.ckt) | `09fa542dd664647c2deaef15f2d8bf07f7f3e30b40e7e6a9242673b62d28da1f` | `benchmarks/corpus/corpus-d/fixtures/tests/downscaling_cm/downscaling_cm.ckt` |
| `transresistance-ac` | ac | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/hvsource/hvsource.ckt) | `e9c675ae1029b278422be65104ef1c10925d3506b7432274c9dce4c8c49d0765` | `benchmarks/corpus/corpus-d/fixtures/tests/hvsource/hvsource.ckt` |
| `passive-pole-zero-ac` | ac | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/pz1/pz1.ckt) | `3a597bfe073b0d0219444b15559e6390a2aabe9ca8f1b9246db626efd8dda94c` | `benchmarks/corpus/corpus-d/fixtures/tests/pz1/pz1.ckt` |
| `resistor-voltage-ac` | ac | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/rvtest2/rvtest2.ckt) | `a632b37a296d71114ea1bb8185029e041c28f86defdc4e6e671dfbe55de3a6ed` | `benchmarks/corpus/corpus-d/fixtures/tests/rvtest2/rvtest2.ckt` |
| `series-resonance-ac` | ac | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/series_resonance/series_resonance.ckt) | `6b687bc2f3cd7415af561f26e80669ce8df3e08be977958dbc6db1446f5f22d0` | `benchmarks/corpus/corpus-d/fixtures/tests/series_resonance/series_resonance.ckt` |
| `am-source-transient` | tran | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/amckt/amckt.ckt) | `e5027b8f925e83ac09ef477b77b7219b215dcb74e0e172c8369c3c777a7e5632` | `benchmarks/corpus/corpus-d/fixtures/tests/amckt/amckt.ckt` |
| `fft-source-transient` | tran | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/fft_ckt/fft_ckt.ckt) | `04d2554f966d5ffd8cfd00f665575e02d11045790cf201bb596b610c0e2ff59b` | `benchmarks/corpus/corpus-d/fixtures/tests/fft_ckt/fft_ckt.ckt` |
| `coupled-transformer-transient` | tran | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/transformer/transformer.ckt) | `df9bf42844508fc38edffdc685e935ac90e10bde5fab0ee957ce68f5da6ba4a5` | `benchmarks/corpus/corpus-d/fixtures/tests/transformer/transformer.ckt` |
| `rlc-trapezoidal-transient` | tran | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/tran_trap/tran_trap.ckt) | `8932d8cc9e536d8ad910c67d199536f39750dea7a0ff282d9ee81bc861145cc8` | `benchmarks/corpus/corpus-d/fixtures/tests/tran_trap/tran_trap.ckt` |
| `diode-voltage-doubler` | nonlinear | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/diode_mult/diode_mult.ckt) | `de110e81dd425b8117efd6acd32d7d4311b854bf1236715f3233b1e12419da50` | `benchmarks/corpus/corpus-d/fixtures/tests/diode_mult/diode_mult.ckt` |
| `ekv-ring-oscillator` | nonlinear | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/ring3/ring3.ckt) | `300a3d7c7441224ce67bbed31f9ecd334e8dd79cf4bfbeca9e49dc673a09f9ef` | `benchmarks/corpus/corpus-d/fixtures/tests/ring3/ring3.ckt` |
| `cockcroft-walton-x8` | nonlinear | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/diodecw8/diodecw8.ckt) | `050a38d7396b25410446e79dd8106578825bcce223f4c2cb0bb6889fdb18727b` | `benchmarks/corpus/corpus-d/fixtures/tests/diodecw8/diodecw8.ckt` |
| `pwm-switch` | nonlinear | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/switch1/switch1.ckt) | `e3d1544f41fef2361132c89b6a85776f3e2f32c7ec95b1321144c82cd6799ff5` | `benchmarks/corpus/corpus-d/fixtures/tests/switch1/switch1.ckt` |
| `rlc-gear3` | convergence | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/tran_gear3/tran_gear3.ckt) | `98fd4fd298a27da8d9286ec29a1af412b7fa7d9098809b8f0635dc42e9062219` | `benchmarks/corpus/corpus-d/fixtures/tests/tran_gear3/tran_gear3.ckt` |
| `rlc-gear5` | convergence | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/tran_gear5/tran_gear5.ckt) | `ac0ae49a5c9868c6d783449b84514d69e9dc171354782d53785b1b2300a064a4` | `benchmarks/corpus/corpus-d/fixtures/tests/tran_gear5/tran_gear5.ckt` |
| `rlc-gear6` | convergence | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/tran_gear6/tran_gear6.ckt) | `1974b92f58344b953e481e579f63a374d722ca3a90bff1d3b305d2c35fb3d5d6` | `benchmarks/corpus/corpus-d/fixtures/tests/tran_gear6/tran_gear6.ckt` |
| `colpitts-oscillator` | convergence | [upstream](https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/colpitts/colpitts.ckt) | `02bc0b17610975b80bb01bf5b73e5a334ef39412d3c14cc39ba6f8e236f67d8c` | `benchmarks/corpus/corpus-d/fixtures/tests/colpitts/colpitts.ckt` |

Validate all pinned fetches, fixture hashes, byte-identical engine inputs, declared analyses, expected outcomes, and the deterministic receipt with:

    pnpm build
    node benchmarks/corpus/corpus-d/validate.mjs

At ingestion on ngspice-47, all 20 fixtures fail on ahkab-specific source, analysis, model, or named-subcircuit syntax. All 20 also fail in spice-ts: 19 parse failures (including one existing malformed-device error path) and one explicitly unsupported parse. No circuit is adapted or omitted to improve either total; the validator prints and checks every loss.
