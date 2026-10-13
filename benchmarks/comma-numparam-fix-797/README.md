# #797 raw X-call scanner and formal-default correction

## Accepted scope expansion and final implementation

The supervisor authorised formal-default normalisation and formal-aware comma
validation after the bounded attempt below stopped at RED. Production now scans
raw assignment boundaries before substitution, discards comma-prefixed names,
and preserves bare comma words until the called definition is resolved. Both
top-level and nested calls validate only comma words whose names match formal
parameters. No global tokenizer or device semantics changed. `.subckt` default
commas are separators, including defaults not overridden by the instance.

The original unchanged example01 now succeeds. Native V(N1) is
-7.2323399544815565 V. Full three-point max/RMS absolute errors improve from
8.329431883476111 / 4.808999740127627 V to
8.881784197001252e-16 / 5.127978741977898e-16 V. Both sibling controls are
unchanged. All 20 saved inputs and source/licence hashes remain represented in
`before.json` and `final.json`; no deck adaptation or tolerance adjustment.

Final results are **15 numerical agreements, 4 both-failed cases, 1 status loss**,
not 19 runnable successes. The preserved malformed `p1= p2=3` loss still reports
undefined p2 rather than using a per-case zero substitution. Issue 3/5 remain
reference failures. Original receipts and rejected prototypes are historical
evidence and have not been overwritten. The final production receipt records
implementation commit 88aed9d3; subsequent commits add evidence only.

| case | before max/RMS relative | final max/RMS relative | final status |
| --- | ---: | ---: | --- |
| issue-1 | null | null | both failed |
| issue-2 | 0.10900473933649289 / 0.10900473933649289 | 0 / 0 | agree |
| issue-3 | null | null | both failed |
| issue-4 | 0.012987012987012988 / 0.012987012987012988 | 0 / 0 | agree |
| issue-5 | null | null | both failed |
| issue-6 | 0.0947867298578199 / 0.0947867298578199 | 0 / 0 | agree |
| issue-7 | 0.0947867298578199 / 0.0947867298578199 | 0 / 0 | agree |
| defaults | 0 / 0 | 0 / 0 | agree |
| plain-whitespace | 0 / 0 | 0 / 0 | agree |
| braced-whitespace | 0 / 0 | 0 / 0 | agree |
| braced-comma-space | 0 / 0 | 0 / 0 | agree |
| braced-comma-tab | 0 / 0 | 0 / 0 | agree |
| explicit-first | 0 / 0 | 0 / 0 | agree |
| reordered-glued | 1.0526315789473684 / 1.0526315789473684 | 0 / 0 | agree |
| function-comma | 0 / 0 | 0 / 0 | agree |
| unbraced-trailing | null | null | both failed |
| unbraced-missing-value | null | null | native failed |
| example01 | 1.1516925277156995 / 0.6649301929672683 | 2.359223927328457e-16 / 2.0526421133915498e-16 | agree |
| example01_stringwriter | 2.02702507580167e-8 / 1.4582630755065776e-8 | 2.02702507580167e-8 / 1.4582630755065776e-8 | agree |
| example01_without_params | 2.02702507580167e-8 / 1.4582630755065776e-8 | 2.02702507580167e-8 / 1.4582630755065776e-8 | agree |

### RED / GREEN and execution receipts

Expanded RED was committed as f7d20254 before production edits.
`pnpm -C packages/core exec vitest run src/parser/comma-numparam-797.test.ts`
exited 1 in `expanded-red.log` (and the resumed pre-expansion RED also exited 1).

    pnpm -C packages/core exec vitest run src/parser/comma-numparam-797.test.ts src/parser/subckt-param-order-857.test.ts src/subcircuit-params.test.ts src/subcircuit-port-parens-864.test.ts src/subcircuit-dynamic-params-888.test.ts src/altermod-alias.test.ts src/parser/control/csparam-loop-930.test.ts
    pnpm -C packages/core exec vitest run src/parser src/circuit.test.ts
    pnpm build
    pnpm lint
    spice-heavy python3 benchmarks/comma-numparam-fix-797/run.py final
    python3 benchmarks/comma-numparam-fix-797/verify.py

All commands exited 0. The reserved parser, dynamic-scope, alias, order and port
regressions plus the csparam controls pass 90 tests. The
parser/circuit command is recorded in `green-parser-circuit.log`. Build/lint
receipts are `build.log` / `lint.log`. Early unsuccessful development runs are
retained under `green-targeted*.log` and are not claimed as passing.
No redundant full local monorepo suite was run. Required exact-head Node20,
Node22, build and accuracy CI remains the authoritative full gate.

Final owned serial child wall is 8.919235873 s. Cumulative owned child wall,
including the three earlier comparisons, is 28.231265000 s, below 300 s.
Every owned child is bounded to 12 s; no timeout or global kill occurred.
Offline verification checks all 80 receipt rows across four phases, raw OP
values, same-byte input hashes, source provenance and metrics/nulls. No speed
claim is made.

## Historical bounded attempt stopped at RED

This is not a production fix or a parity success. The rejected scanner is saved
as `rejected-prototype.patch` and has been removed from production. The dedicated
regression remains RED. No input deck, original receipt, shared source registry,
tolerance, tokenizer, solver, or default parser has been changed.

## Reservation boundary

The task reserves a raw X-call assignment scanner only, with minimal callsites.
The existing `bracedSubcircuitCallValues` hook runs before top-level expression
substitution and on nested X cards and continuations. Later parser callsites
receive already substituted numeric values, so they cannot alone distinguish
`p1={2},p2={3}` from `p1=2,p2=3`.

A source-derived prototype at that hook fixes the five synthetic numerical
mismatches and preserves the four reference failures. It cannot fix unchanged
example01 under the reserved X-call-only scope. Its header is

    .subckt entry m_in m_out v_vel params: a0=1, b0=1, ro=1, v=1, rout=1, rin=1, r1=1, r2=1

`parseSubcircuitHeader` stores every default except R2 as the string `1,`.
Previously all those defaults were overridden, masking this independent problem.
After correctly ignoring the glued R1/R2 overrides, `Circuit.expandSubcircuit`
at circuit.ts:3365 evaluates R1's default and rejects the comma. The final
prototype fails with `parameter 'R1=1,': Unexpected character ','`. This is a
new native failure on the original, NOT a numerical win. Its metrics are null.
The first attempt also mishandled `+rin=`; the second fixed continuation scanning
and still exposes the same default-parsing blocker. Both attempts are retained.

Another preserved loss is `p1= p2=3`: reference V(o)=11; native reports undefined
p2. Implementing its malformed expression semantics is not justified by a
per-case zero substitution. More generally, numeric comma validation belongs
after matching actual names against formals. Rejecting an unmatched named
actual too early would not implement ngspice's positional stage correctly.

Supervisor decision needed: expand/reassign the bounded seam to include formal
default normalization and formal-aware positional validation, or retain this
RED and route those prerequisites separately. No header fix is smuggled into
this X-call-only reservation.

## Actual execution

Prerequisites were verified after fast-forward to
3792ecc668f503f4fead57c37b1ed0b5b94e0900, containing merged #941/#944/#945.
Poteto SKILL.md and bug-fix playbook were read directly after skill_view's
plugin directory error. TDD reproduction committed as 1856f7e0 before the
prototype was written.

    pnpm -C packages/core exec vitest run src/parser/comma-numparam-797.test.ts

Exit 1, receipt `red.log`. Prototype targeted parser, parameter-order, dynamic
caller scope, alias, subcircuit parameters and port-parenthesis tests exit 1,
82 passed / 1 failed of 83, in `prototype-tests.log`. Only original example01
fails after the continuation correction. There is no GREEN claim, PR, CI
claim, full-suite run or merge. No need to consume the authoritative full gate
for a known rejected implementation.

    spice-heavy python3 benchmarks/comma-numparam-fix-797/run.py before
    spice-heavy python3 benchmarks/comma-numparam-fix-797/run.py after
    spice-heavy python3 benchmarks/comma-numparam-fix-797/run.py after-continuation
    python3 benchmarks/comma-numparam-fix-797/verify.py

All four commands exit 0; the comparison commands record failures rather than
assert parity. All 20 original saved cases are present in every JSON receipt,
including all three unchanged originals. Each engine received the same original
path and bytes. Hashes match #944, and fresh reference values match its saved
values. Full shared-node max/RMS absolute and relative errors are recorded for
each successful pair; every failure has null metrics. Original native expanded
nodes are retained, not selected away. The fixed threshold is the existing 1e-6.

| phase | numerical agreements | numerical losses | both fail | status losses | child wall |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 9 | 6 | 0 | 5 | 6.899618334 s |
| first rejected prototype | 14 | 0 | 4 | 2 | 5.725316293 s |
| continuation-corrected rejected prototype | 14 | 0 | 4 | 2 | 6.687094500 s |

Four both-failed rows are issue-1, issue-3, issue-5 and unbraced-trailing.
They are not runnable successes. Two remaining status losses are example01
and unbraced-missing-value. Baseline example01 max/RMS absolute errors are
8.329431883476111 / 4.808999740127627 V; max/RMS relative errors are
1.1516925277156995 / 0.6649301929672683. Prototype errors are null because it
fails. Both sibling controls retain max/RMS absolute errors
2.2238328956092346e-8 / 1.2839942664655665e-8 V and max/RMS relative errors
2.02702507580167e-8 / 1.4582630755065776e-8.

Cumulative owned child wall is 19.312029127 s, below the 300 s budget. The
runner serializes process groups, uses a 12 s per-group cap, retains stdout,
stderr, exits/signals/timeouts/raw OP data, and checkpoints each row and the
shared budget. No timeout occurred. No speed claim is made.

## Provenance

Inputs and upstream source provenance are unchanged from
`../comma-numparam-797/SOURCES.md`, `source.json`, `matrix.json` and the saved
receipt. Source revision is a80f6e3e95d51534905b1f23410a951802666656
(ngspice-47). The upstream BSD-3-Clause inpcom.c scanner and LGPL-2.0-or-later
numparam source were inspected, not redistributed here. Control decks are MIT;
original SpiceSharpParser decks are MIT with corpus-h provenance. All receipts
retain the source URLs, licences and SHA-256 values from #944.
