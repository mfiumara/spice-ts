# #803 / #812: bounded original-pin recovery and #737 oracle search

Baseline: origin/main `e358f89b` (after #1038), Node v22.23.1, darwin arm64 Apple M5 Pro, Homebrew ngspice-47. Evidence-only: no simulator changes, model/device changes, original pin changes or comparison-tolerance changes. Original #812 counts remain 43 selected variants / 25 tickets, 38 executions / 21 tickets, five missing pins / four tickets, eight correctness verdicts. Before → after: restored pins **0 → 0**, complete independent #737 waveform oracles **0 → 0**. These are losses, not new benchmark wins.

## Original pins: outcomes after bounded effort

| Ticket / variant | Authoritative SHA256 | Unique attempted hashes | Outcome / representative candidate SHA256 |
|---|---|---:|---|
| 158 dot.cir | `7e943e7c63cfbb2a5724ab5d01f2d91591d9f78a60e2966ecd91d62f92cd9b35` | 3,024 | gap; `e1ce54429baf985034972f1424548d05f8bada6b9947371228f6c85134acfcfb` (2,592 B) |
| 738 OP1177ARM_OPA818.local.cir | `ade3ace7fd9c3649d7f1f4fa2590748bc33fed2b7526679472af831a9d89d02d` | 32,256 | gap; `cbe95d092897db7b081ba2b96d37114040a1f236b40b5153be240efe8f73cdfe` (1,122 B) |
| 791 variant_62.local.cir | `c973882f1606dd1c3f4c1d837d30b16de11863713e729a58ded40232dd70d464` | 64,512 | gap; `62bbfadcd9be8eeb489ca26dda48594b6bd1168c13fd3244195e16374439af1e` (1,549 B) |
| 794 NGspice/06101.local.cir | `5fcebb2af191add8dae40125f927d24e2d05fbbd36a0a54a08c39e9a87fc210a` | 64,512 | gap; `167817c2fe196931720eee62cbe49287534040e6c53e4c70298171536a5309ec` (1,371 B) |
| 794 KiCad/06101/06101.local.cir | `688b77c210b7cb33aa5bad84bb8ecd4f8f8013cb08e5b83f1221feb034243357` | 64,512 | gap; `167817c2fe196931720eee62cbe49287534040e6c53e4c70298171536a5309ec` (1,371 B), not the recorded 1,441 B |

Neither engine received any of these candidates. `refresh.ts` confirms all five original rows remain hash-gated provenance gaps. No substitute/new corpus pin was introduced. A missing input is not a present-day parser or convergence verdict.

[reconstruction-803.json](reconstruction-803.json) contains per-source hashes, original pins, representative attempted hashes with complete recipes, attempt counts, and SHA256 of each sorted unique attempted-hash set (`hex + LF` per hash). [reconstruct.py](reconstruct.py) reproduces the search deterministically from hash-verified fetch-only archives. Representative examples include both LF and CRLF, uniform quoted/unquoted includes and every path style; the count/hash-set digest covers mixed quotes, encodings and whitespace permutations too. The receipt stores hashes/recipes, never vendor deck or model bytes.

Search boundary:

- Inspected original harvest commits `9df3f792` and squash `c0ea4516`, plus subsequent corpus history. They record pins and edit prose, but contain no derived fetch-only bytes or exact preparation code for these five variants. This investigation does not recover a lost original script from prose.
- Archive source bytes are verified against unchanged manifest attachment hashes before extraction via macOS `tar`.
- Common formatting product: retained trailing spaces / rstripped lines / stripped document; LF / CRLF / CR; 0–3 terminal newlines; UTF-8 / UTF-8 BOM / UTF-16 LE BOM / UTF-16 BE. No device values, model parameters or analysis arguments are tuned.
- 738/791/794 include variants: original Windows path, drive-stripped relative tree, `./` relative tree, `../` relative tree, basename, `./` basename, relative backslash tree; retain/lower/upper path case; independently quoted/unquoted each include. The representative baseline is LF, one final newline, unquoted drive-stripped relative tree, retaining spaces/case.
- 158: original control TF/PZ arguments converted to dot cards, print converted to `.print pz all`, lower/uppercase card variants, blank-line variants, in-place/before-end placement; equivalent `v(VOUT)` versus `v(VOUT,0)` and case spellings. Its documented candidate uses `.tf v(VOUT) VIN`, one blank-after replacement newline, LF/one terminal newline. No device/model/options/measurements were removed.
- KiCad check: the 794 archive's NGspice and KiCad `.cir` files are byte-identical, 1,433 B, SHA256 `93d787f4b0709cec7d74c27f6101a687ed35f1e3a8c6bef4a0199104b8ec1946`. Thus export ordering or line endings alone cannot explain two different recorded derived pins/lengths. A schematic re-export with a different KiCad version is a new input, not proof of restoration; none was substituted.

Zero matches is bounded evidence, not a proof that no recipe exists. Recovering the exact original preparation/bytes remains the remaining scope for #803. Original gap rows must stay intact even if a later separately sourced variant is added.

## #737: partial reference found, full-waveform verdict remains unscored

[oracle-737.ts](oracle-737.ts) checks both the archive pin and the unchanged original derived deck pin `b58eda0bc033ac63358e66f275efeff0af13534ffe7cb3efbe391f13b1c15965`. Original preparation is CRLF→LF, remove quoted Windows drive prefix and surrounding include quotes; preserve `spice_lib/...` relative trees and unchanged libraries. Identical input bytes and include files go to both engines for each trial. Only native configuration selects LTPS for the PSpice libraries, through a temporary local `.spiceinit`; there is no circuit-specific tolerance tuning.

NEW short/OP probes are diagnostic variants only (own SHA256 in [oracle-737.json](oracle-737.json)), not replacements for the original pin, not new scored corpus rows. Short probes change only `.TRAN 1m 10m` tstop; OP changes that card to `.op`. All native-mode trials fail to parse the PSpice library. LTPS outcomes:

| Trial | spice-ts | ngspice-47 LTPS | Oracle scope |
|---|---|---|---|
| Original 10 ms | succeeds, 30,771 points, final 0.01 s | exit 1, 13 partial points to 2.899990792104854e-10 s | incomplete reference, unscored |
| NEW stop 1e-10 s | succeeds, 304 points | exit 1, 8 partial points to 1.000014767961141e-14 s | no completed reference |
| NEW stop 1e-9 s | TimestepTooSmall at 5.562971581351822e-11 s | exit 1, 6 partial points to 1.016002540883672e-13 s | both engines fail; published loss |
| NEW stop 1e-6 s | succeeds, 1,588 points | exit 1, 14 partial points to 3.693557213579291e-10 s | no completed reference |
| NEW OP | succeeds | exit 0, 1 operating point | independent-engine partial reference, disagreement below |

| OP quantity | spice-ts | ngspice-47 LTPS | Absolute difference | Relative difference to native |
|---|---:|---:|---:|---:|
| i(V159), A | -0.0013554713473383079 | -0.001237320859729758 | 0.00011815048760854992 | 0.09548896446662594 |
| v(Net-_Q37-S_), V | -0.0016983367337954761 | -0.1043817443873431 | 0.10268340765354762 | 0.983729561679931 |

The DC sources' +15/-15/2 V node constraints agree; these trivial analytic constraints cannot validate the nonlinear vendor macromodel waveform. Native OP is an independent-engine reference, not first-principles proof that its vendor operating point is unique/correct, and is not a 10 ms transient oracle. Xyce is not on PATH on this machine; no Xyce execution or comparison is claimed. Result: partial OP evidence/loss found, **no independent complete transient oracle**, no `right` verdict. Route OP disagreement and short-stop failure to the supervisor using existing #803/#812 context, without expanding this evidence card into core work or making duplicate issues.

## #725 attachment drift (not executed)

Fresh `fetch.ts` exits 1 for discussion attachment `.../_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415.log`: actual 2,314 B / `bfc5ea49f206bda2371c50aa21cdc7af986dcce6f02f20d7dbddd8d958d4b7e4` versus recorded 2,205 B / `04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2`. Primary same-named `/bugs/725/attachment/...` log and `-klu.log` still match the recorded hash. The fetch script overwrites same-named files in URL order, so the final local basename contains the changed discussion log. Original manifest pins retained; all minimal executed deck pins unchanged. Never silently accept the drift as a new pin.

## Reproduce and validation

Source URLs/hashes are unchanged in manifest.json; licence/redistribution policy is the existing ngspice-bugs section of benchmarks/SOURCES.md: public tracker attachments have no explicit redistribution grant; vendor material remains fetch-only/git-ignored. No vendor bytes, exports or schematics are committed.

1. `pnpm install --frozen-lockfile` — exit 0.
2. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 158 738 791 794 737 725` — exit 1 solely for the disclosed log drift; all selected archives match.
3. `pnpm build` — exit 0.
4. `python3 benchmarks/corpus/ngspice-bugs/reconstruct.py <new-receipt.json>` — exit 0, five explicit gaps. Compare generated JSON to reconstruction-803.json.
5. `spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts <new-refresh.jsonl> 158 738 791 794 737` — exit 0, five hash-gated gaps plus original #737 execution; no candidate supplied.
6. Extract fetched/737/Test.zip with `tar -xf ... -C ...`, then `spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/oracle-737.ts <new-oracle.json>` — exit 0, trial failures are receipt data. Two runs reproduce all statuses/counts/OP values. Receipt paths sanitized; native plot counts and signal endpoints retained, not full sample arrays.
7. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/render.ts` and `render.ts --check` regenerate/verify summary and ticket READMEs.
8. `pnpm exec tsx --test benchmarks/corpus/ngspice-bugs/ngspice-bugs.test.ts` — 12 pass, 4 fetch-dependent skips, 0 fail (16 tests). New receipt assertions initially failed without evidence; pass with real receipts. Existing #871 exact binary equality failed after merged #782 decimal formatting: -0.16666666666666663 versus analytic -1/6. The analytic unit assertion now admits one relative Number.EPSILON; no harness/corpus metric threshold changes.
9. `pnpm lint` — exit 0. Full suite is run only under `spice-heavy`; exact-head GitHub required checks are the authoritative gate.

The prior refresh-812.jsonl.gz is intentionally retained as the original complete 25-ticket receipt; no unrelated decks were reclassified. The generated summary links this follow-up and distinguishes legacy enum labels from actual provenance/oracle coverage.
