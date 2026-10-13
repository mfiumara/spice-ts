# #797: comma X-instance assignments, diagnosis only

Refs #797. No production fix, tolerance tuning, transformed original deck, or speed claim. This pins the ngspice-47 reading before anyone reserves the shared parser/circuit seam.

## Measured results

Baseline native HEAD is recorded in receipt.json. Both engines received each identical file path and SHA-256; original fixture hashes also match the corpus-h manifest. ngspice `-n -b -r` with `SPICE_ASCIIRAWFILE=1`, no user startup file/compatibility mode. All 20 cases completed: 9 agree at a fixed 1e-6 maximum relative threshold, 6 numerical losses, 5 success/failure differences. Child wall including startup was 9.797s (not a performance comparison). Prior recovered attempts left no simulation receipts; the initial Python 3.9 annotation failure spawned no engine. Completed evidence is never overwritten by the runner.

| case | ngspice V(o) | native V(o) |
|---|---:|---:|
| issue-1 `p1=2,p2=3,p3=4` | failure, no raw | 234 |
| issue-2 `p1={2},p2={3},p3={4}` | 211 | 234 |
| issue-3 `p1=2, p2=3, p3=4` | failure, no raw | 234 |
| issue-4 `p1={2}, p2={3},p3={4}` | 231 | 234 |
| issue-5 `p1=2 p2=3,p3=4` | failure, no raw | 234 |
| issue-6 `p1={2},p2=3` | 211 | 231 |
| issue-7 `p1=2 ,p2=3` | 211 | 231 |
| defaults | 111 | 111 |
| plain/braced whitespace | 234 | 234 |
| braced comma+space / comma+tab | 234 | 234 |
| explicit first only | 211 | 211 |
| reordered glued | 114 | 234 |
| function comma inside braces | 234 | 234 |
| unbraced trailing comma | failure, no raw | 211 |
| missing unbraced value | 11 | parse failure |

Important correction: the new no-startup ngspice-47 run does NOT reproduce the issue table's claimed successful issue-3 (211) or issue-5 (231). Their exact lists instead fail with `; sign expected`, with no raw data. Keep these failures; do not replace them with historical values or assert that comma always means truncating the list.

Unchanged example01: V(N1) reference -7.232339954481557 versus native 1.097091928994553. All three shared nodes: max absolute 8.329431883476111 V, RMS absolute 4.808999740127627 V, max relative 1.1516925277156995, RMS relative 0.6649301929672683. Both sibling controls agree: each max absolute 2.2238328956092346e-8 V, RMS absolute 1.2839942664655665e-8 V, max relative 2.02702507580167e-8, RMS relative 1.4582630755065776e-8. Native-only expanded internal nodes are retained but excluded from shared-node metrics; nothing is selected by node importance. Failure metrics are null, not zero. Zero-reference matches contribute zero relative error; nonzero error at zero reference makes relative aggregates null. Raw output, errors, exit/signal/timeout/wall receipts and node sets are retained for every case.

## Source explanation (pinned source.json revision)

The effect is a staged assignment parser, NOT a universal comma termination rule:

1. `inpcom.c:4091-4144` (`inp_get_params`) finds assignments; a name is the whole non-whitespace span immediately left of '='. A braced value ends at its matching closing brace; otherwise the value extends to whitespace. The next search resumes at that end. Comma is not an assignment-name delimiter here.
2. `inp_fix_inst_line`, `inpcom.c:4167-4172`, replaces defaults only for exactly matching parameter names, then emits positional actual values in formal order (`4174-4181`). Thus after `p1={2}`, the following glued name is `,p2`, not `p2`, and the next glued name can include preceding text. Those names don't override defaults. Comma+whitespace before the next name avoids that mismatch. Reordering the glued list proves it is the first matching override, not always p1, that survives (114).
3. Unbraced `2,` is retained in the whitespace word, not cleaned into `2`. `nupa_subcktcall`, `xpressn.c:1665-1707`, initially skips comma/whitespace then consumes numeric words through whitespace or uses getexpress for braces, fills formal assignments with the positional values and calls nupa_assignment (`1713-1727`). `getexpress:1391-1453` recognizes comma/semicolon/closing delimiters, while skipping parenthesized subformulas; `nupa_assignment:1529-1531` requires semicolon between generated assignments. A retained comma in a numeric word therefore produces the measured `; sign expected` failure. Conversely `p1=2 ,p2=3` keeps first value `2` and fails to match the comma-prefixed second name, giving 211. Commas in `max(2,1)` stay inside the braced expression and work.

This accounts for the measured numeric, braced, whitespace, reordered and malformed boundaries without per-deck substitutions. It does not establish every quote/string/nesting/compatibility-mode behavior outside this bounded matrix. A future implementation must preserve upstream errors, not silently drop every comma suffix.

## Reproduction and RED preparation

Offline, no engine runs:

    python3 benchmarks/comma-numparam-797/verify.py
    python3 benchmarks/comma-numparam-797/verify_test.py
    python3 benchmarks/comma-numparam-797/verify.py --parity

First two exit 0 (6 verifier tests); last intentionally exits 1 for the 11 retained parity gaps. It is an offline snapshot parity assertion, NOT a claim to test a future native implementation automatically. Do not wire this known RED check into required CI.

To produce fresh same-byte evidence in a separate disposable checkout without receipt.json, with dependencies installed and ngspice-47 present:

    python3 benchmarks/comma-numparam-797/fetch.py
    spice-heavy python3 benchmarks/comma-numparam-797/compare.py

17 controls are committed, so regeneration is unnecessary. `generate.py` writes only those controls and matrix, never original fixtures. The runner serializes owned process groups, kills only its own group on a 12s timeout, checkpoints each row and caps cumulative direct-child wall at 300s. Existing receipt causes refusal rather than resetting the budget. Offline verifier checks all paths/hashes, raw numeric values, native payloads, metrics, counts and wall totals. Six tests cover retained evidence and rejected tampering. Source is downloaded for analysis only and checked before simulation; offline verification needs no upstream downloads.

Local `pnpm build && pnpm lint` exit 0; targeted three parser files exit 0, 86 tests. No local full suite rerun per supervisor recovery instruction; required exact-head CI is the authoritative full gate. No before/after simulator improvement: production unchanged, all losses above remain.

## Proposed smallest later reservation (not held by this card)

Use a raw X-card assignment scanner in `packages/core/src/parser/subcircuit-syntax.ts`, before general tokenization discards comma positions (`tokenizer.ts:193-195`). Integrate at top-level `parser/index.ts:1303-1309` and nested `circuit.ts:3730-3736`; both currently use comma-erased tokens with parseInstanceParams. Preserve general tokenizer/device behavior. These three existing files plus a dedicated #797 test file are the smallest plausible reservation, but the shared circuit writer #888 and parser review #937 must finish and supervisor must reassign ownership first. Do NOT reserve or modify them from this diagnosis card. Source-derived scanner/error handling, expression evaluation and malformed-value compatibility require a separate RED/GREEN implementation slice. No broad production patch is proposed here.
