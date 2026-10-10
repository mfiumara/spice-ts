# Issue 227 source-grammar receipt

This receipt covers only the independent-source grammar changes from issue #227. The corpus fixtures, directives, tolerances, and analysis code are unchanged.

## Provenance and identity

- Source repository: https://github.com/gnucap/gnucap
- Pinned revision: `5acb027125d6ea7c546badd03e026d8781c6a400`
- Licence: GPL-3.0-or-later. The retained notice and licence are `benchmarks/corpus/corpus-e/LICENSE-NOTICE.MakeList` and `benchmarks/corpus/corpus-e/COPYING.txt`.
- Adaptation: none for the 20-fixture audit. Both engines receive the same committed bytes.
- Fixture-set SHA-256: `e6346a45392800a58c186eb691d242f4b88611f1609b29db4b0f1c1110a08897` before and after.
- Target fixture SHA-256 values:
  - `opamp-open-loop-ac`: `92e47652dbecdbd2c971cce3c047fc0b8e4a0406a7d2c953dffce299c60b183c`
  - `capacitor-step-transient`: `2c0864497272439baa44213381271915107ccd9f8c47354df2e4b9c3028a1608`
  - `lc-oscillator-transient`: `020684099d172ec7cc2a6fe3d57792ef51b3d9162f41f83ed486704062d6d702`

## Commands and versions

The RED and GREEN runs both used:

    pnpm -C packages/core build
    node benchmarks/corpus-e-audit/audit.mjs

The audit invokes `ngspice -b -r output.raw <unchanged-fixture-basename>` and the spice-ts corpus runner on each unchanged fixture. The machine was macOS 27.0.1, arm64, Apple M5 Pro, 51,539,607,552 bytes RAM. Versions were ngspice-47 and Node v22.23.1.

RED was commit `8ea46d6a8a74ecf9ff4464f3316fded495245d0e`. GREEN was implementation commit `dd45c316457a1668cb17dbbfbd9067aee2d6618c`.

## Full-corpus result

| Engine | Run | Pass | Parser | Device/model | Analysis | Convergence | Execution | Wall time |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| ngspice-47 | RED | 5 | 2 | 2 | 11 | 0 | 0 | included in 1,130.548 ms audit |
| spice-ts | RED | 6 | 4 | 0 | 10 | 0 | 0 | included in 1,130.548 ms audit |
| ngspice-47 | GREEN | 5 | 2 | 2 | 11 | 0 | 0 | included in 1,190.300 ms audit |
| spice-ts | GREEN | 6 | 2 | 0 | 12 | 0 | 0 | included in 1,190.300 ms audit |

The wall times cover process startup, all 40 engine attempts, hashing, and classification. They are receipts, not a speed comparison. Outcome SHA-256 changed from `7fd4c51bfcd4c3170bee5cfd81b82e132a60df67cf2c10a304118827adba7222` to `dc0d014d42b6ae2250f6b096c2e1419e9bc3d70fddf1c68e237ebd8010b9cd96`.

## Target transitions

| Fixture | RED spice-ts first cause | GREEN spice-ts first cause | ngspice-47 result |
|---|---|---|---|
| `opamp-open-loop-ac` | parser, line 17 rejected `dc=0` | parser, line 49 bare `.ac` reaches the existing directive error path | analysis loss, `Missing DEC, OCT, or LIN.` |
| `capacitor-step-transient` | parser, line 2 rejected `dc pulse(...) ac 1` | analysis loss, line 5 unsupported `.list` | analysis loss, unsupported `.list` |
| `lc-oscillator-transient` | parser, line 4 required parenthesized PWL | analysis loss, line 9 unsupported `.status` | analysis loss, unsupported `.status` |

The op-amp fixture still fails in both engines after the source card. spice-ts reaches the later bare `.ac`; ngspice-47 reports that the later card has no sweep mode. Directive handling belongs to #228 and is not changed here.

## Every GREEN outcome

| Fixture | ngspice-47 | spice-ts |
|---|---|---|
| `cccs-mixed-analysis` | analysis loss, `.list` | analysis loss, `.list` |
| `vcvs-operating-point` | parser loss, duplicate device | analysis loss, `.list` |
| `diode-bias-sweep` | pass | pass |
| `mos1-inverter-sweep` | pass | pass |
| `transmission-line-ac` | parser loss, `gen` | parser loss, `gen` |
| `mutual-inductance-ac` | analysis loss, `.list` | analysis loss, `.options nopage` |
| `bjt-diffpair-ac` | analysis loss, `.status` | analysis loss, `.option` |
| `opamp-open-loop-ac` | analysis loss, missing sweep mode | parser loss at later bare `.ac` |
| `capacitor-step-transient` | analysis loss, `.list` | analysis loss, `.list` |
| `capacitor-initial-condition` | analysis loss, `.list` | analysis loss, `.list` |
| `lc-oscillator-transient` | analysis loss, `.status` | analysis loss, `.status` |
| `bjt-diffpair-transient` | pass | pass |
| `bjt-schmitt-trigger` | device/model loss, parameter `1` | pass |
| `diode-temperature-sweep` | analysis loss, `.list` | analysis loss, `.list` |
| `mos1-nand-transient` | analysis loss, `.tran` parameter | analysis loss, `trace` |
| `bjt-rtl-inverter-chain` | pass | pass |
| `dual-lc-uic-rejection` | analysis loss, `.status` | analysis loss, `trace` |
| `opamp-voltage-follower` | analysis loss, `.stat` | analysis loss, `.options dampstrategy` |
| `mos7-nand-no-bypass` | device/model loss, MOS7 unavailable | analysis loss, `.option` |
| `bjt-diffpair-current-source` | pass | pass |

No loss was removed from the table. The 15 fixtures with at least one engine failure do not produce matched waveforms in both engines, so max/RMS waveform metrics are excluded rather than invented. The three target fixtures also remain excluded from matched metrics because their unchanged full analyses stop on later directive differences. Parser and execution tests separately lock the source-card values without changing fixture bytes.

## `/poteto-mode` receipt

- Data shape: one normalized source-token stream feeds the existing `SourceWaveform` union. No new public type or module boundary was added.
- RED: `pnpm exec vitest run src/parser/gnucap-source-forms.test.ts` failed 8 of 10 checks at `8ea46d6`. The failures reproduced `dc=`, valueless `DC` before PULSE, and unparenthesized PWL rejection from the three pinned cards.
- GREEN: assignment-form `DC=` and `AC=` tokens are normalized only inside independent-source parsing. A `DC` marker directly before a transient waveform carries no separate numeric bias. PWL accepts either bounded parenthesized arguments or bounded unparenthesized time/value pairs.
- Strictness: empty `DC=`, malformed AC tails, incomplete unparenthesized PWL pairs, parenthesized PWL trailing parameters, missing closing parentheses, decreasing times, and unsupported extras remain errors.
- Scope: no directive/options path, fixture, model, analysis, tolerance, version, roadmap, WASM, MCP, or web file changed.
