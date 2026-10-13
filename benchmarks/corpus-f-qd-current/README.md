# Current-main reconciliation of historical corpus-f Q/D bucket (#526)

Diagnosis only. No core, parser, solver, shared corpus receipt, tolerance or fixture changes.

## Frozen inputs and provenance

- Frozen origin/main: `d4b1ce04b70f98986d825d1daee64fabcfc7ae61`.
- PR #924 (.temp, issue #871) was OPEN at kickoff and is deliberately absent from the frozen base. No unreleased branch was imported.
- Historical selection: the complete `device: Q/D instance forms (AREA=/M= keywords, thermal nodes, VBIC PNP)` gap bucket in `5014ae0bcfd6484a2ad4d5b25ed14672851b3ca2`, the original #490/#527/#484 receipt. Sorted IDs, exactly 22, not hand-picked.
- Upstream ngspice revision: `3ef069fb1f04177a153f342a32d941fc20ff047e`, https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/ . Modified BSD / BSD-3-Clause; source URLs, copyright/notice, original licence hash, SHA256 and byte lengths are in `selection.json` and unchanged `LICENSE.txt`. Per-file licence checks are preserved from the original manifest's redistribution decision.
- All decks are byte-identical to the original fixtures. No includes are needed; `includes: []` is tested against actual deck directives. The script verifies every SHA256 before export.

`selection.json` retains every original fixture outcome and ngspice-47 result, separately from `diagnosis.json`'s fresh current parse/native runs. No fresh ngspice/reference waveform was run. Historical success is NOT a fresh match; fresh reference/comparison and max/RMS metrics are null. No speed or accuracy improvement is claimed. Current machine, Node, package version, exact commands, exits, elapsed times and complete errors are recorded in the diagnosis.

## Results (all 22 accounted)

Historical: 22 spice-ts unsupported, 20 ngspice successes, 2 ngspice failures.
Current: parse 3 success / 19 unsupported; native 0 success / 22 unsupported; 0 failed, 0 timeout, 0 not-run. All 44 sequential children exited 0 with structured diagnostics; 17.673s total diagnosis wall time (not a simulator speed benchmark).

| Current first native blocker | Fixtures | Historical reference successes | Transition from original Q/D bucket |
|---|---:|---:|---|
| NBJT CIDER model, typed UnsupportedModelTypeError | 17 | 17 | unsupported Q-card syntax -> unsupported model |
| Diode thermal node, typed ParseError | 1 | 1 | unsupported diode instance syntax -> unsupported self-heating |
| `.temp 27`, typed ParseError | 1 | 1 | unsupported Q-card syntax -> unsupported directive |
| VBIC KFN, typed InvalidCircuitError | 1 | 1 | unsupported Q-card syntax -> unsupported noise parameter |
| VBIC PNP, typed InvalidCircuitError | 2 | 0 | unsupported -> unsupported polarity; not historical parity losses |

The old issue/#527 prose says **16** CIDER decks but lists only 21 total fixtures; the mechanically selected original receipt actually contains **17** CIDER decks. No fixture was dropped to match that prose. Every selected CIDER deck now stops at NBJT, including the jfet-named fixture. None currently stops at generic mesh/doping number parsing or `.options bypass`.

Three decks parse but still fail native simulation: `tests/vbic/diffamp.cir`, `tests/vbic/FG.cir`, `tests/vbic/noise_scale_test.cir`. Every other selected deck fails parse and independently fails native with the same first blocker. See both per-mode entries for all IDs in `diagnosis.json`; neither phase substitutes for the other.

## Next blockers, ranked by historical-reference-success impact

1. CIDER NBJT: 17/20 historical successes. Existing #497 and #526. #497's original 10 other CIDER fixtures are a separate bucket, not part of these 22 and must not be counted as tested here. Typed rejection is already present after merged #542 (model types) and #600 (options). Numerical simulation needs an explicit device-simulator scope decision; do not treat an analytic BJT substitute as parity or reopen policy in this receipt.
2. Diode self-heating: 1/20, existing #526; thermal rejection introduced by merged #527. RTH0/CTH0 network needs a separate owner-scoped model slice, not fixture edits.
3. VBIC `.temp`: 1/20, existing #871 / pending #924, plus #526. Static next-model evidence: original unchanged `vbic99_dc.sp` has a fifth thermal node `dt`, LEVEL=9, RTH=300, and additional model parameters. Thermal/model blockers may remain after `.temp`; this receipt does not remove the directive or claim an executed post-#924 result. Merged #473 explicitly rejects VBIC thermal nodes.
4. VBIC KFN/noise: 1/20, existing #526. `.noise`/KFN/AFN/BFN must be handled as an explicit VBIC model slice; merged #361/#457 DC/AC support does not imply noise support.
5. VBIC PNP: 0/20 historical-success impact; existing #526, broader device roadmap #5. Historical ngspice failed both decks. No fresh ngspice rerun or assertion about their present reference behavior.

All-state issue searches for CIDER/VBIC/self-heating, VBIC noise and VBIC PNP, and merged PR searches for those terms plus KFN/PNP/thermal were performed before these recommendations. Existing #497/#526/#871/#5 are reused; no duplicate issue or new simulator-writing child was created. The only new child is independent exact-head review. Supervisor owns subsequent scope and merge.

## Reproduce and verification

Requires the historical commit object (fetch its branch/object if using a shallow checkout), Node/tsx, Python3 and macOS for the recorded host metadata command. Run from the repository root on the frozen core source; `run.py` refuses a core diff from the base.

```
pnpm install --frozen-lockfile
python3 benchmarks/corpus-f-qd-current/export_bucket.py
spice-heavy python3 benchmarks/corpus-f-qd-current/run.py
node --test benchmarks/corpus-f-qd-current/diagnosis.test.mjs
pnpm build
pnpm lint
spice-heavy pnpm test
```

Budgets: 1 child at a time, <=12s wall and CPU each, <=600s total, 256 MiB V8 heap, 64 KiB per output stream, own process groups and scoped kill only. No global pkill and no per-deck overrides. Raw receipts distinguish unsupported/failed/timeouts/not-run.

Local receipts: install, build and lint exit 0; 8 offline diagnosis tests passed; guarded full suite exit 0 (core 271 files, 3477 passed / 2 skipped; package suites 17/11/76/209/64/20 passed; root benchmark tests 144 passed / 4 skipped). Logs are in this directory. Required exact-head test(20), test(22), build and accuracy CI must also be green before supervisor merge, alongside independent exact-head review. `/poteto-mode` availability and design receipt are recorded honestly in `POTETO.md`.
