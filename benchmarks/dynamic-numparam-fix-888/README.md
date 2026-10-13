# Dynamic numparam caller scope, Refs #888

Implementation and preserved RED/GREEN evidence for #888. Only circuit.ts changes production code.
No shared corpus, CI, changeset, or release changes. No speed superiority claim.

## Before/after result

Fresh baseline `e1597e192c26a231dd576c668524d887b6e63844` is preserved in before.json.
The fixed circuit.ts working tree on test commit `fc531d5d6cfb0a442ca778d8463def5dd74e99f9`
is measured in after.json. Its metadata records HEAD, not a claim that the fix was committed
at that SHA. The final PR SHA is supplied in the PR/card handoff.
All 16 fresh ngspice-47 references and all 16 fixed native runs complete.
Six native failures and two precedence losses become GREEN; the other eight controls
have exactly unchanged native values and max/RMS errors. Deck hashes, observations,
reference values and the shared tolerance are unchanged from diagnostic PR #934,
`bc2e42d0b56e1c624ca5590e6f09d274a4c1068c`, merged as
`6d46a713c0bd77b4e2f43cd554893ea629a8d1b1`. provisional-receipt.json retains that evidence.

issue-888 and caller-shadows-global now give v(o)=0.25 with zero max/RMS error.
lexical-definition-dynamic-param now gives v(o)=0.2 with zero max/RMS error.
All repaired voltage cases are exact except local-reads-caller, whose max/RMS absolute
error is 5.551115123125783e-17 V and max/RMS relative error is 3.88578058618805e-16.
The unchanged lexical-model-854 current residual is max absolute 4.294823637354672e-9 A,
RMS absolute 3.0368989179737622e-9 A, max relative 3.6078183149255644e-7 and
RMS relative 2.5511127957728895e-7. lexical-model-not-dynamic keeps max/RMS absolute
2.574980159653073e-19 A and relative 2.1689590586026365e-15. These are not zero-error claims.
The diode controls keep the same lexical model selection; full currents are in after.json.

Fresh before/after direct-child wall totals are 7.422279413 s / 7.982766916 s,
15.405046329 s cumulative across both batches, below the original 300 s experiment budget.
These are startup-inclusive process timings, not a performance benchmark. No batches were
rerun after worker recovery. Build/lint/targeted tests were rerun and exited 0.
RED recorded 8 failed / 25 passed (33), exit 1. GREEN and recovery GREEN record
62 passed (six files), exit 0. No parser, evaluator or model-lookup code changes.

## Preserved diagnostic evidence

Baseline `f807cd8a3368d344a3a21a9ee17ea52a84bfa748`, main after #929.
ngspice-47/KLU, Node v22.23.1, pnpm 10.28.1, Darwin arm64.
One 16-case matrix, all 16 references complete. Six native failures have null metrics,
two completing native cases lose on precedence, eight agree within the one future-parity
tolerance (`rel_tol=1e-6`, `abs_tol=1e-12`). No tolerance is used to alter the recorded metrics.

Every row records exact commands, cwd, exit, signal, wall time, stdout/stderr, input hashes
before/after, reference ASCII raw bytes, native JSON, and OP max/RMS absolute/relative errors.
Both backends read the same file, including the unchanged minimal #888 deck. No .control
block, output card, parameter rewrite, or compatibility mode is added to either input.
`ngspice -n -b -r` disables user .spiceinit and writes the OP raw externally.

| Case | ngspice OP | Native OP / failure |
| --- | --- | --- |
| issue-888 | v(o)=0.25 | Undefined variable pp; null metrics |
| caller-shadows-global | 0.25 | 0.1; max/RMS absolute 0.15 V, relative 0.6 |
| global-fallback | 0.1 | 0.1 |
| callee-default-shadows-caller | 0.2 | 0.2 |
| callee-local-shadows-caller | 0.2 | 0.2 |
| explicit-shadows-default | 1/3 | 1/3 |
| default-reads-caller | 0.25 | Undefined variable pp in header default; null metrics |
| override-reads-caller | 1/7 | 1/7; max/RMS absolute 5.551115123125783e-17 V |
| local-reads-caller | 1/7 | Undefined parameter pp in body .param; null metrics |
| three-level-nearest | 0.2 | Undefined variable pp; null metrics |
| three-level-fallback | 0.25 | Undefined variable pp; null metrics |
| repeated-siblings | (0.25, 0.2, 0.25) | Undefined variable pp; null metrics |
| lexical-param-857 | 0.25 | 0.25 |
| lexical-model-854 | i(V1)=-0.0001187196295587072 A, i(V2)=-0.01190421263617118 A | max absolute 4.294823637354672e-9 A, RMS absolute 3.0368989179737622e-9 A; max relative 3.6078183149255644e-7 |
| lexical-model-not-dynamic | i(V1)=-0.0001187196295587072 A | max/RMS absolute 2.574980159653073e-19 A |
| lexical-definition-dynamic-param | 0.2 | 0.25; max/RMS absolute 0.05 V, relative 0.25 |

The runtime boundary includes process startup, TS loading, parse, compile, OP and output.
It is not a speed benchmark. The full captured matrix consumed 5.513440246 s actual direct
child wall including five metadata commands. Each simulation child owns its process group,
with a 12 s deadline and 300 s cumulative actual-child budget. Only a timed-out owned group
is killed. No global kill or detached background simulation. Source fetch/install and
build/lint/test gates are outside this circuit-matrix budget.

## Contract derived from the references

1. An unbound callee expression searches its dynamic caller instance, then nearest dynamic
   ancestors, then global parameters. Caller pp=3k shadows global pp=9k. An unbound middle
   preserves the outer pp; a bound middle pp=4k wins.
2. A callee's literal header default or local body binding shadows caller pp. An explicit
   declared X-line override shadows the header default. X-line expressions read the caller;
   default and body dependency expressions can also resolve caller names.
3. Binding lifetime is per instantiation, not per definition. Repeated sibling calls with
   pp=(3k,4k,3k) yield (0.25,0.2,0.25), without leaking the previous sibling's values.
4. Parameter ancestry is not definition ancestry. A leaf lexically declared under outer
   pp=3k but called from middle pp=4k reads 4k, not 3k.
5. Keep definition/model lookup lexical. A top-level leaf D uses the global DX, not its
   caller's local DX. Independent local DX definitions in #854 still differ. Preserve
   dependency-reordered .param evaluation from #857.

These statements cover the measured matrix, not every ngspice parameter corner case.
No new claim about duplicate header/body names, undeclared overrides, .func scoping,
recursion, temperature handling or behavioural deferred evaluation is made.

At pinned upstream revision `a80f6e3e95d51534905b1f23410a951802666656`:
`numparam/xpressn.c:377-393` (`entrynb`) searches stack depth down through global zero.
`xpressn.c:1713-1727` pushes an instance scope before assignments; `1741-1744` pops it.
`numparam/spicenum.c:697-703` drives those operations from instance/end markers.
See SOURCES.md for licences and SHA-256 receipts. The evidence is measured first;
source inspection corroborates, rather than substitutes for, those observations.

## Implemented seam and file ownership

The pre-fix root cause was in `packages/core/src/circuit.ts:3324-3347`.
`definitionScopes` is empty for a top-level leaf. `parentParams` therefore fell back to
`parameterScope()` instead of the caller, even when the caller has pp. For a lexically
nested leaf it used the lexical enclosing scope, incorrectly discarding a closer dynamic
middle. Recursive expansion at `circuit.ts:3741-3751` carried definition/model scopes but
had no independent dynamic caller-parameter argument.

The implementation threads a separate `Record<string, number>` caller parameter scope
through `expandSubcircuit`, uses it as the prototype of the fresh local parameter object,
and passes the current local object to recursive X calls. `definitionScopes`, `bodyScopes`,
model mapping and definition lookup remain unchanged. Top-level expansions start from
the global parameter scope. The existing `evaluateSubcircuitParams` handles dependency
ordering; no duplicate evaluator was introduced. The 16-case test file is
`packages/core/src/subcircuit-dynamic-params-888.test.ts`.

The live RED preceded the circuit.ts edit; the fresh matrix and targeted GREEN verify
the fix. Existing #854/#857 tests are green. No parser/index or preprocessor change
is needed for this matrix. Those files remain reserved to the lane named by the card;
this PR does not compete with that writer, solver #932, floating recovery #917 or XSPICE #553.

## Reproduction and offline verification

From repository root:

```
pnpm install --frozen-lockfile
python3 benchmarks/dynamic-numparam-fix-888/verify.py
pnpm -C packages/core exec vitest run src/subcircuit-dynamic-params-888.test.ts src/subcircuit-model-scope-854.test.ts src/parser/subckt-param-order-857.test.ts
git clone --depth 1 --branch ngspice-47 https://git.code.sf.net/p/ngspice/ngspice benchmarks/dynamic-numparam-fix-888/.run/upstream
spice-heavy python3 benchmarks/dynamic-numparam-fix-888/compare.py
```

If `.run/upstream` already exists, use its pinned checkout instead of cloning again.
The runner refuses any source revision other than the full pin. Reference batches must
use spice-heavy. A rerun overwrites receipt.json, so preserve the baseline if comparing
against a later implementation.

verify.py requires only Python. It verifies complete counts, deck hashes, same-byte
command paths (relocatable), decoded raw values, native output, null failure metrics,
recomputed max/RMS metrics, versions, matching source hashes, cumulative child budget,
six baseline failures, two baseline losses, fixed parity and unchanged eight controls.

compare.py writes receipt.json, leaving before.json and after.json unchanged. Compare
new receipt.json with preserved after.json for independent review. Do not rewrite
historical evidence. The Vitest test executes the current implementation using the
fresh baseline references, and is part of the ordinary suite.

Build, lint and lexical test receipts are scoped alongside this file. The full-suite
command writes ignored full-tests.log; its result and exact-head CI belong in the PR/card handoff.
Independent spice-ts-review must accept the full PR SHA; only the supervisor may merge.
