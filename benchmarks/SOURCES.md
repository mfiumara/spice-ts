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
- Original distribution: https://ptolemy.berkeley.edu/projects/embedded/pubs/downloads/spice/spice3f5.tar.gz
- Upstream release: Berkeley SPICE3f5 (the examples identify themselves as the 1993 SPICE3f4/3f5-era test inputs).
- Licence: [BSD-3-Clause](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/LICENSE). The pinned mirror applies this licence repository-wide; Berkeley also relicensed SPICE3f5 under the three-clause BSD licence.
- Redistribution decision: allowed. The licence text is retained at `benchmarks/corpus/classic/LICENSE.txt`.
- Adaptation: none. All 20 `.cir` files are committed byte-for-byte from the pinned mirror. The validator runs the identical files in both engines; `-r output.raw` only asks ngspice to export its result and does not alter a netlist.

| ID | Category | Canonical source | Revision | Licence | Redistribution | Local path | Adaptation |
|---|---|---|---|---|---|---|---|
| `bjt-noise` | noise | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bjtnoise.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bjtnoise.cir` | none |
| `bsim1-device-sweep` | device-characterization | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bsim1tst.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bsim1tst.cir` | none |
| `bsim2-device-sweep` | device-characterization | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/bsim2tst.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/bsim2tst.cir` | none |
| `bjt-differential-pair` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/diffpair.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/diffpair.cir` | none |
| `diode-distortion` | distortion | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/diodisto.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir` | none |
| `lossy-line-24-inch` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_1.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir` | none |
| `lossy-line-aluminium` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_2.cir` | none |
| `coupled-lossy-lines` | transmission-line | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/ltra_3.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/ltra_3.cir` | none |
| `bjt-mixer-distortion` | distortion | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mixdisto.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mixdisto.cir` | none |
| `mos6-inverter-chain` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mos6inv.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mos6inv.cir` | none |
| `mos-amplifier` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mosamp2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir` | none |
| `mos-memory-cell` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/mosmem.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/mosmem.cir` | none |
| `pole-zero-four-stage` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/pz2.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/pz2.cir` | none |
| `pole-zero-three-stage` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/pzt.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/pzt.cir` | none |
| `rc-transient` | passive | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rc.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rc.cir` | none |
| `rca3040-wideband-amplifier` | amplifier | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rca3040.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rca3040.cir` | none |
| `resistor-noise` | noise | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/resnoise.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/resnoise.cir` | none |
| `rtl-inverter-chain` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/rtlinv.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/rtlinv.cir` | none |
| `ecl-schmitt-trigger` | digital | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/schmitt.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/schmitt.cir` | none |
| `high-pass-pole-zero` | filter-network | [upstream](https://github.com/obernin/spice/blob/3d9360bef370b432e473edb0c4333707d545a55f/examples/simplepz.cir) | `3d9360bef370b432e473edb0c4333707d545a55f` | BSD-3-Clause | committed | `benchmarks/corpus/classic/fixtures/spice3f5/simplepz.cir` | none |

Validate provenance fields, pinned URLs, fixture hashes, declared analyses, ngspice execution, and spice-ts parsing with:

    pnpm build
    node benchmarks/corpus/classic/validate.mjs

At ingestion on ngspice-47, 19 circuits produce raw analysis data. `bjt-mixer-distortion` is retained as a visible source-suite failure: both of its upstream `.disto` commands are commented out, so ngspice exits successfully without producing raw data. All 20 byte-identical fixtures currently fail spice-ts parsing. The validator prints each failure and checks it against the manifest instead of hiding or rewriting unsupported inputs.

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
