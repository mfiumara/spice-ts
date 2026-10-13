# #797 bounded production attempt stopped at RED

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
