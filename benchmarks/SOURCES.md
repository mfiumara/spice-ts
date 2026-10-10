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
