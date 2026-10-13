# #930: retain evaluated .csparam control constants

## Scope and root cause

The preprocessor evaluated `.csparam` expressions for validation, then discarded
both their numeric values and their names. This was not an interpreter lifetime
bug: existing const-plot `let` vectors already survived `setplot` correctly.

Retain the already-evaluated numeric payload in PreprocessedDeck.controlConstants,
thread it through all four parser entry points into ControlScript.constants, and
install it in the interpreter's const plot before execution. Reuse numparam's
include, function, branch-selection and error handling. Do not expose `.param`
values as control vectors or alter unknown-vector/setplot behavior.

Initial RED base 541cb5f34dd1dd89074df9f9f737e4eb6aff110c (merged #925).
After supervisor-authorized seam expansion and #924 acceptance/merge, this branch
fast-forwarded to e1597e19 before any production edit. The resumed RED is committed
at ee4db496 (1 failing / 1 passing, exit 1). The after receipt records this base
and the SHA256 of the tested production patch. Final PR head and exact-head CI are
reported in the Kanban handoff and GitHub PR.

/poteto-mode activated from installed pstack SKILL.md and bug-fix playbook.
Only the authorized parser seam, control files and this receipt directory changed.
The accepted last-effective .temp precedence/warnings code is unchanged.

## Reproduce

```
pnpm install --frozen-lockfile
pnpm -C packages/core exec vitest run src/parser/control src/parser/temp-directive-871.test.ts src/parser/preprocessor.test.ts src/parser/numparam-extensions.test.ts src/parser/parse-preprocess-parity.test.ts
spice-heavy python3 benchmarks/control-loop-scalars-20261013/compare.py
python3 benchmarks/control-loop-scalars-20261013/check.py
pnpm build
pnpm lint
spice-heavy pnpm test
```

Node v22.23.1, macOS 27.0.1 arm64, Homebrew ngspice-47 with KLU.
The probe runs children serially in their own process groups, <=12 seconds per
child and <=600 seconds cumulative actual child wall (not queue time). All
commands, hashes, exits and timings are in diagnosis.json (before) / after.json.
Logs are engine outputs. No fixture bytes or per-circuit tolerances were changed.

All three originals were freshly run with `ngspice -b <unchanged-original>`.
A second headless `ngspice -b` readout sources the same unchanged original and
then prints its existing vnode2/r2val vectors at numdgt=17. The wrapper changes
output precision only, not the simulated circuit or loop. Recorded stdin files
make this explicit. Match n1 voltage by loop index and r2val coordinate (1000 to
100 Ohms, step -50). Relative error is abs(native-reference)/abs(reference).
Only n1 is compared; no claims about every internal quantity or speed.

## Before / after (all three unchanged originals)

| Original | Before native | Fresh ngspice | After native | Matched n1 points | Max relative | RMS relative |
| --- | --- | --- | --- | --- | --- | --- |
| instance-loop.cir | exit 1, missing end | exit 0, 19 OPs | exit 0, 19 OPs | 19 | 2.0539125955565395e-16 | 6.334367866879865e-17 |
| loop-instance.cir | exit 1, missing end | exit 0, 19 OPs | exit 0, 19 OPs | 19 | 2.0539125955565395e-16 | 6.334367866879865e-17 |
| loop-model.cir | exit 1, missing end | exit 0, 19 OPs | exit 1, altermod R2 unsupported | 0 | null | null |

loop-model advances beyond the scalar condition but exposes an independent host
limitation: altermod takes a model name, not the instance-to-model alias R2.
That host path is outside this card's reservation. This is still a loss. Issue
#930 remains open (Refs #930, not Fixes). No three-deck parity claim is made.

Original plot commands warn in ngspice batch mode; no GUI was used.
Final comparison total actual child wall is 2.183386625991261 seconds. The initial
before probe was 2.179815417 seconds; these are scoped execution receipts, not a
performance comparison. A failed pipe-mode readout attempt (ngspice reports no
graphics interface, no values) is preserved in failed-pipe-readout.zip; it is not
used as numerical evidence. Final batch readout succeeds for all three originals.

The identical MIT minimal control prints bounds 1000 100 -50 in both engines.
The MIT namespace control confirms ngspice's existing-vector assignment semantics:
let value=9 updates the pre-existing const vector even from a new plot, so both
engines print `9 9`, then `9` after destroying the new plot. An initial test
incorrectly assumed local shadowing and failed; green.log preserves that result,
namespace.cir and the fresh reference corrected the expectation without changing
interpreter assignment behavior.

## Test evidence

- red.log and resumed-red.log: 2 tests, 1 fail / 1 pass, exit 1.
- green-initial.log: original minimal tests both pass, exit 0.
- green-final.log: 277 tests / 13 files pass, exit 0, including 9 csparam
  regressions and 33 accepted .temp controls.
- build.log / lint.log: pnpm build and pnpm lint exit 0.
- evidence-check.log: offline hashes/counts/metrics/budget checker passes, exit 0.
- full-test.log / full-test-exit.txt: machine-gated local full-suite receipt.
  Required exact-head GitHub checks test(20), test(22), build, accuracy are the
  authoritative gate, reported in the PR/card rather than inferred here.

## Sources and licences

Originals are existing BSD-3-Clause ngspice examples at source revision
3ef069fb1f04177a153f342a32d941fc20ff047e:
https://github.com/ngspice/ngspice/tree/3ef069fb1f04177a153f342a32d941fc20ff047e/examples/loops
Their source/licence identities are already in benchmarks/SOURCES.md and
benchmarks/corpus/corpus-f/SOURCES.md. This card does not edit shared manifests.
minimal.cir, namespace.cir and the scoped comparison/check scripts are original
MIT-licensed spice-ts contributions under the repository LICENSE.
