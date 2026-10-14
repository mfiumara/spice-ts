# #812 ngbehavior option slice

Refs #812. This is option parsing, not a complete vendor-compatibility layer.

## Scope and source

`SimulationOptions.ngbehavior` retains the lower-case canonical `mode` and
immutable `flags`. Circuit and compiled options retain it; `toNetlist()` emits
it. Singular `.option`, mixed case, repeated assignments (last wins), synchronous,
async and titleless parsing are tested. No global compatibility state is used.

The flag computation follows ngspice-47
[`src/frontend/inpcompat.c:set_compat_mode`](https://github.com/imr/ngspice/blob/ngspice-47/src/frontend/inpcompat.c#L61-L111).
Canonical tokens are hs, ps, xs, lt, ki, a, ll, all, s3, eg, spe, mc and their
concatenations. Upstream uses substring matching; spice-ts deliberately rejects
noncanonical strings with contextual ParseError. `all` sets a and ll, not every
vendor flag. Spectre clears ps/lt/ki/eg; ps overrides hs; mc clears vendor flags
but leaves s3, as upstream does. Mixed-case normalization is a spice-ts parser
convention, not a claim about upstream accepting every raw spelling.

Existing PSpice expression helpers are already unconditional extensions (see
behavioral-expression.ts). They stay available in native mode. No new evaluator
mode branch or vendor syntax translator is added; these parsed flags currently
have no effect on expression evaluation. That limitation is intentional for this
supervisor-approved narrowed slice, not a claim of full ps/lt semantics.

The original sqrt requirement was corrected after source/runtime verification.
ngspice-47 [`PTsqrt`](https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/parser/ptfuncs.c#L316-L320)
rejects every negative argument, with no ps/lt gate. Numparam
[`mathfunction`](https://github.com/imr/ngspice/blob/ngspice-47/src/frontend/numparam/xpressn.c#L115-L116)
also uses ordinary sqrt. The supervisor chose headline ngspice-47 parity rather
than the proposed vendor extensions ps=sqrt(abs(x)) or lt=0. Negative sqrt
remains an InvalidCircuitError at B-source evaluation, not option/expression
syntax rejection. Default behavior is unchanged.

## Unchanged corpus before/after

The retained `.jsonl.gz` files are raw output of the existing hash-gated #812
refresh adapter. Before was measured at original RED commit
8d05a6f5b56dbe972fb47ddc9e494cb1ff6e859a, before implementation. Rebase changed the
RED commit identifier to 497d4990bf02e685cf58fc65116aa4998cecdaea. After was
measured on that original base plus the production diff before rebasing.

| Ticket / deck | Before spice-ts | After spice-ts | ngspice-47 | Matched points / errors |
|---|---|---|---|---|
| 695 dot.cir | ParseError ngbehavior at line 2 | ParseError savecurrents at line 3 | TRAN timestep too small at t=0.5; 41 partial rows, run failed | 0; max/RMS absolute/relative N/A |
| 828 foo.cir | -2 out of range for sqrt | unchanged | same domain rejection | 0; all errors N/A |
| 828 sqrt_neg_cards.cir | -4 out of range for sqrt | unchanged | same domain rejection | 0; all errors N/A |

Pinned SHA256 values respectively:

- 51b4d83c0df6c64af8e313b395bcf6a17975577e37f302adb45e983dedbc5102
- cccfbcb5043759a4bc96b978c7126b8d0a753d2f33dd1a74518f8830393b4a16
- 80e64fb4779dcec3af382b12a8b98a83809eff6d84e679d7dd80d670433e0378

The harness has no matched-both-reject verdict. Its status remains `failed`;
828 is qualitatively matched rejection, NOT a numerical match or scored win.
695 is still a loss/gap. Savecurrents or eventual convergence work is follow-up
scope; this PR neither ignores that option nor edits the deck to make it pass.

Important upstream detail: the unchanged `.options ngbehavior=psa` 695 deck
prints `No compatibility mode selected!` in this ngspice-47 batch path. The
existing adapter uses `-n`. `probe.py` separately selects ps/lt with a local
`.spiceinit` and verifies the printed selected mode, while keeping the original
828 deck bytes identical. All native/ps/lt runs exit 1 with the -4 domain error.
These direct-mode receipts are in mode-probe.json.gz.

## Self-decks and test evidence

`verify.ts` generates original MIT self-decks for native, ps, lt, psa and mc,
each with positive and negative sqrt. Both engines receive identical bytes.
Five positive OP comparisons have one aligned point per signal (v(a), v(y),
i(va), i(b1)): absolute max/RMS are exactly 0. Relative max/RMS are 0 for
nonzero references v(y)/i(b1); zero references v(a)/i(va) are excluded, N/A.
All five negative decks produce the matching domain rejection, zero aligned
points, no numerical error metrics. See self-check.json.gz for complete signals,
commands, durations and netlist hashes. No speed improvement is claimed.

Initial targeted RED invocation exited 254 because vitest was not installed.
After `pnpm install --frozen-lockfile` (exit 0), actual RED execution exited 1:
31 tests, 26 failed, 5 passed. This was before production edits. The final
five-file targeted run exited 0 with 360 tests passed, including 31 new tests.
One invalid-mode test was corrected from comma-delimited `ps,lt` (tokenizer
separates option fields on commas) to invalid `psx`; sqrt tests were strengthened
to assert the actual domain error rather than any rejection. red.log.gz and
green.log.gz retain these executed receipts.

Commands (all after dependency installation unless noted):

    pnpm build                                                   # exit 0
    pnpm lint                                                    # exit 0
    pnpm -C packages/core exec vitest run src/parser/ngbehavior.test.ts src/parser/options-directives.test.ts src/parser/expression.test.ts src/parser/behavioral-expression.test.ts src/parser/solver-selection.test.ts
                                                                 # RED 1; final GREEN 0, 360 passed
    spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts scratch-ngbehavior/before.jsonl 695 828
                                                                 # exit 0; benchmark outcomes failed
    spice-heavy pnpm exec tsx benchmarks/corpus/ngspice-bugs/refresh.ts scratch-ngbehavior/after.jsonl 695 828
                                                                 # exit 0; benchmark outcomes failed
    spice-heavy pnpm exec tsx benchmarks/results/issue-812-ngbehavior/verify.ts
                                                                 # exit 0; 10 self-decks asserted
    spice-heavy python3 benchmarks/results/issue-812-ngbehavior/probe.py
                                                                 # exit 0; 3 ngspice rejections asserted

Refresh refuses to overwrite output; use a fresh output name for another run.
Local full-suite runs were not performed per card instructions; required
GitHub CI on the PR exact head is the full gate. No corpus deck, manifest pin,
comparison tolerance or aggregate outcome was changed.
