# VDMOS fourth-node acceptance (#1103)

## Root cause and scope

The node-count guard rejected every four-node VDMOS descriptor, including the eight original corpus-n decks. No device equations needed to change.

ngspice-47 source, pinned to the corpus-n upstream revision `a80f6e3e`:

- [inp2m.c](https://github.com/ngspice/ngspice/blob/a80f6e3e/src/spicelib/parser/inp2m.c) permits 3 through 5 VDMOS nodes, binds supplied nodes in order, and sets omitted nodes to -1.
- [vdmos.c](https://github.com/ngspice/ngspice/blob/a80f6e3e/src/spicelib/devices/vdmos/vdmos.c) names them Drain, Gate, Source, Temp, Tcase. Node 4 is Tj, not an electrical MOS bulk terminal.
- [vdmosset.c](https://github.com/ngspice/ngspice/blob/a80f6e3e/src/spicelib/devices/vdmos/vdmosset.c) enables the thermal network only for `here->VDMOSthermal && model->VDMOSrthjcGiven`. Otherwise it sets both thermal nodes to 0. The body diode anode remains the source, behind RB.

The fix accepts the disabled fourth node and keeps the existing seven electrical node slots. Active self-heating is still a typed rejection. The bare THERMAL flag is retained by both top-level and subcircuit instance parsing so a four-node active thermal request cannot be silently discarded. `THERMAL=0` is disabled. RTHJC alone does not enable self-heating.

This is the four-node acceptance slice, not the complete five-node grammar or electro-thermal implementation. Five-node syntax, omitted thermal-node defaults, three-node bare-flag model disambiguation and self-heating remain in #559. The current generic parser still misidentifies Tc as the model in a five-node instance; this PR does not claim otherwise.

## RED / GREEN

- Baseline main: `7f95b7b3998f0427c18151602c5a8e88510d1a22`.
- RED commit: `68f97248c34f90685d651622c3029eac156f8a2a`. Targeted Vitest produced 2 failures and 14 passes, both failures being the exact four-terminal rejection.
- Fix commit: `39852062` (full SHA in after.json.gz). Targeted Vitest produced 19 passes.
- Regressions cover nchan/pchan, source/ground/independently biased fourth nodes, OP and AC, M/TEMP, RTHJC without activation, scoped model/body-diode wiring, THERMAL=0 and typed rejection of active self-heating in both parsing paths.
- `native-check.py` independently ran eight synthetic ngspice-47 OP cases with the same nchan/pchan model and M=2/TEMP=50. Three-node and fourth-node source/ground/100 V cases gave identical currents and `@m1[tempnode]=0`. Native nchan i(vd) = -5.36813139209203 A; pchan i(vd) = +5.368131392092032 A. This synthetic diagnostic is separate from public-fixture parity. Native stdout/stderr are retained in native-check.json.

## Eight original corpus-n decks

`run.ts` invokes the unchanged corpus-n parity engine worker, with the same uniform 119 s owned process-group deadline, and the unchanged corpus-j reducer / corpus-f metric. Both engines receive identical fixture bytes, verified against the manifest SHA-256. Existing sources and licences are recorded in corpus-n/SOURCES.md and benchmarks/SOURCES.md: ngspice `a80f6e3e`, BSD-3-Clause. No new third-party fixture is introduced. No fixture edits, fine-step adaptation, tolerance changes or aggregate refresh.

Before, all eight ngspice runs succeeded and all eight spice-ts runs failed with the four-terminal guard. After, all eight runs succeed in both engines. Parser/run acceptance is fixed, but six rows have no numerical comparison.

| ID | Original deck | Before spice-ts | After unchanged harness | Worst normalized error | Worst signal |
|---|---|---|---|---|---|
| n-6 | inv_vdmos_dc.cir | failed: 4 terminals | matched | 1.52e-8 | dc i(vdd) |
| n-7 | inv_vdmos.cir | failed: 4 terminals | matched | 0.00104 | tran i(vdd) |
| n-8 | VDMOS-DIO-AC.cir | failed: 4 terminals | not-compared | null | none |
| n-9 | VDMOS-DIO.cir | failed: 4 terminals | not-compared | null | none |
| n-10 | vdmos-out_ir_mtr.cir | failed: 4 terminals | not-compared | null | none |
| n-11 | vdmos-out_ir.cir | failed: 4 terminals | not-compared | null | none |
| n-12 | vdmosp-out-mtr.cir | failed: 4 terminals | not-compared | null | none |
| n-13 | vdmosp-out.cir | failed: 4 terminals | not-compared | null | none |

The unchanged match threshold is 0.01. Full matched-point max/RMS absolute and relative metrics, missing signals and grids are in before.json.gz and after.json.gz. Null does not mean zero error. There are no newly measured numerical mismatches, because six rows compare zero signals. M1 follow-up [#1106](https://github.com/mfiumara/spice-ts/issues/1106) records this gap. Its cause is not established: the reducer emits separately unmatched plot records even where both engines contain common signals. For n-12 the analysis inventories also differ: ngspice exports dc:1566; spice-ts exports dc:1566 plus dc:486. These are retained rather than hidden.

## Runtime receipts (milliseconds)

Serial cold owned engine-group wall includes startup, adapter, parse/solve and export. The shared host load differs between runs. The before spice-ts time is rejection latency, not completed simulation latency. These numbers support no speedup or superiority claim.

| ID | Before ngspice | Before spice-ts | After ngspice | After spice-ts |
|---|---:|---:|---:|---:|
| n-6 | 1363.231 | 2979.537 | 1285.824 | 3187.168 |
| n-7 | 1295.823 | 3038.618 | 2336.895 | 6178.563 |
| n-8 | 1316.726 | 3008.155 | 2866.476 | 5710.568 |
| n-9 | 1187.547 | 2909.679 | 2314.719 | 6409.936 |
| n-10 | 1334.767 | 2826.801 | 2355.806 | 6618.107 |
| n-11 | 1207.069 | 2657.453 | 2945.814 | 4995.672 |
| n-12 | 1150.259 | 2616.081 | 1910.303 | 4761.556 |
| n-13 | 1119.453 | 2460.216 | 1739.476 | 3234.456 |

## Reproduction

From repo root:

    pnpm install --frozen-lockfile
    pnpm -C packages/core exec vitest run src/devices/vdmos.test.ts
    pnpm build
    pnpm lint
    spice-heavy pnpm test
    spice-heavy pnpm exec tsx benchmarks/vdmos-1103/run.ts after
    spice-heavy python3 benchmarks/vdmos-1103/native-check.py
    python3 benchmarks/vdmos-1103/check.py

To reproduce before, check out the RED commit (tests fail), build core, and run the same run.ts with `before` instead of `after`. The runner is supplied by this PR and can be copied unchanged to that checkout. It uses built core via the existing corpus worker. Receipts record the actual commit/core tree, manifest hash, Node version, ngspice version, environment, commands and uniform policy. check.py verifies all eight hashes, before rejections, after engine successes, two matches and six honest noncomparisons.

Build/lint and targeted RED/GREEN logs are retained alongside receipts. Required GitHub checks on the final PR head are the authoritative gate; independent review is a separate child card. No merge is performed by this lane.
