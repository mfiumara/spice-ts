# #1049 integral option audit

Refs #1049. Static evidence only, based on main `1e16230d7d396506e6f86f931d45ebf166b05eae`. No core, original deck, pin, tolerance, verdict, oracle or score changes. #1049 stays open. Native narrowing is a measured property of the Homebrew ngspice-47 darwin arm64 build, not a portable C conversion guarantee. See [ROOTCAUSE.md](ROOTCAUSE.md).

## Receipt and coverage

[option-audit.json](option-audit.json) records 1772 available text files/generated decks and their SHA256 hashes, four option-free circuit-generator sources, five hits, and 43 unavailable or nonmatching historical fetch-only derived pins. The inventory deliberately includes model/include files and unselected attachments, so its file count is not a scored-circuit denominator. Five assignments represent four physical decks, since #737's original and normalized pinned deck are both inventoried.

The read-only [option-audit.ts](option-audit.ts) walks `benchmarks/circuits` and `benchmarks/corpus` recursively, including ignored `ngspice-bugs/fetched` contents when present. It excludes tooling, documentation, archives, binary/NUL-containing files and result containers. It hashes and inspects actual `DEFAULT_FIXTURES` netlist bytes from the v2 comparison harness. The four TypeScript files in `benchmarks/circuits` contain no `.option`/`.options` text; this is checked fail-closed, so a future generated option requires explicit audit coverage instead of being silently omitted.

The parser covers all assignment names, either directive spelling, continuation lines, case-insensitive SPICE suffixes (`M` means milli, `MEG` means mega), exponents, signs, quoted numeric literals and trailing units. It checks exact decimal integrality before converting to a JSON number, avoiding fractional false positives from double rounding. `line` identifies the start of a logical directive, including continuation assignments. It ignores the title and comments. It does not evaluate parameter expressions, expand runtime control-language changes, fetch files or reconstruct missing derived pins. Missing pins are not evidence of safety. This is an audit of available static inputs, not a claim of complete historical input reconstruction.

## Hits and result plausibility

| Input | Option | Scoring relationship and plausible effect of narrowing |
|---|---|---|
| corpus-g `PSEUDO/pseudo.cir` | `maxvalue=1.0e12` | Selected corpus-g `pseudo-pseudo-cir`. This is a Xyce LOCA continuation control, not an established ngspice numerical option. Narrowing is not a plausible explanation of the published loss: ngspice succeeds, spice-ts rejects BJT PTF, and zero analyses are numerically compared. Follow up by confirming native handling of the unknown LOCA controls; do not alter this loss. |
| fetched #652 `reproduce materials/nelistAndResults/107.cir` | `rshunt=1T` | Exact manifest pin. Plausibly changes weak-node voltages because it changes every shunt conductance, as measured for #737. The manifest records native success (437 rows), no independent vendor waveform oracle and a historical spice-ts RES rejection. Static risk only; no #652 causal replay or score correction is claimed. |
| fetched #737 `OPA890Test.cir` | `rshunt=1T` | Original attachment input before path/newline normalization, not a second scored fixture. Same physical risk as the next row; no substitute pin is introduced. |
| fetched #737 `OPA890Test.local.cir` | `rshunt=1T` | Exact original manifest pin. Demonstrated large OP effect in ROOTCAUSE.md: i(V159) relative difference remains 9.5488964467%, v(Q37-S) remains 98.3729561680%. Original transient loss and legacy unscored classification retained. |
| fetched #738 `OP1177ARM_OPA818.cir` | `rshunt=1T` | Original attachment source corresponding to a historical derived `.local.cir` pin that is unavailable here. Plausibly changes weak-node OP and transient initialization; not proven causal for the recorded LTPS timestep abort. Do not substitute this attachment for the missing pin or reinterpret the verdict. |

Non-737 follow-ups are corpus-g PSEUDO option handling, #652 shunt sensitivity and #738 shunt sensitivity after original-pin recovery. These are not fixes or new parity claims.

## Preparation and reproduction

Run from the repository root with TMPDIR pointing to a managed scratch directory.

1. `pnpm install --frozen-lockfile` (exit 0).
2. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 737` then `pnpm exec tsx benchmarks/corpus/ngspice-bugs/prepare-737.ts` (exit 0 each). The archive and derived deck match their existing pins.
3. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts` (exit 1). All runnable-ticket attachments were attempted. Known #725 log and #808 alternate-name collisions/drift are reported, not repaired. The scan includes available bytes, without asserting those changed attachments match their historical pins.
4. Extract only hash-verified `.zip`, `.7z`, `.tar.gz` and `.tar` attachments into their ignored ticket directories, with archive entries checked for absolute/parent-traversal paths (19 archives, exit 0). No vendor bytes are committed. Existing licence/provenance restrictions in the corpus manifest and SOURCES.md continue to apply.
5. `pnpm exec tsx benchmarks/results/issue-1049/option-audit.ts > benchmarks/results/issue-1049/option-audit.json` (exit 0). No simulator is invoked. Different available fetch-only inputs change the inventory and unavailable-pin list; retain those differences, not a fabricated identical receipt.
6. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts` then the same command with `--check` (exit 0 each, 58 generated files checked).
7. `pnpm exec tsx --test benchmarks/results/issue-1049/option-audit.test.ts benchmarks/corpus/ngspice-bugs/ngspice-bugs.test.ts` (exit 0, 24 tests). Parser and receipt checks are also wired into the required accuracy job's offline allowlist. Fetch-only absence on clean CI is permitted; available input bytes are hash-checked.
8. `pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --types node ../../benchmarks/results/issue-1049/option-audit.ts ../../benchmarks/results/issue-1049/option-audit.test.ts` (exit 0).
9. `pnpm build` and `pnpm lint` (exit 0 each). No local full-suite run; this card requires targeted local tests and exact-head CI.
10. `spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check` (exit 1 before any engine execution). Baseline provenance is already stale: SOURCES pinned `d6bb12d27b99cff81ac14244e2871e9d45b6144aedd39ff5340ba6cce55e27d7`, actual `bb7719f7e521dd75f6b1c0287c627a9004a33e291a0cbb45060ff422b53d1989`; aggregate fixture tree pinned `23aaa91cfde358550eec443e8b5aaec134d7a7f930b1810f6e7f7db2532d6307`, actual `4d8eff5cf369bd4220611beb91d1396591f271c0c8dec8311167307a6c036504`. Those files, all five aggregate corpus trees, core, and committed aggregate/accuracy reports are byte-unchanged from the baseline. No passing aggregate rerun is claimed and no provenance pin is updated by this card.

## Before/after totals

The complete NGSPICE_BUGS totals and category sections are byte-identical before/after rendering. Both contain 134 tickets (121 open, 13 open-accepted), 57 runnable simulator-relevant tickets, 31 defects reproduced on ngspice-47, 27 still on master, 3 fixed on master, 12 spice-ts-correct, 2 both-wrong, 17 unsupported, 26 not reproduced, and 77 not simulated. Ticket 737 remains error/error/unsupported with the original SHA256 pin. Only its explanatory `expected` text gains the root-cause attribution/link, which render.ts includes in the summary and ticket README. No new independent waveform oracle is asserted.
