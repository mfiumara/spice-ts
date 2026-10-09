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
| `mos6-inverter-dc` | op-dc | [upstream](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/mos6/mos6inv.cir) | `3ef069fb1f04177a153f342a32d941fc20ff047e` | BSD-3-Clause | committed | `benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir` | terminal newline omitted |
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
