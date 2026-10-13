# Later expanded-node diagnosis — Refs #917

Diagnosis only. Issue #917 remains OPEN. No production code or existing
benchmark receipt is modified. The passive whole-circuit fallback merged in
#927 is present at baseline `f807cd8a3368d344a3a21a9ee17ea52a84bfa748`, but
cannot admit the nonlinear originals. This delivery explains their **later**
recovery failures, not just the already diagnosed initial passive pivot2.

## Finding

The later block is an exact common-mode nullspace of an incorrectly compiled
TABLE controlled source, not evidence of a Gilbert-Peierls numeric defect:

| Original | Initial plain Newton | Later dynamic node-gmin | Elimination step | Right-null support |
| --- | --- | --- | --- | --- |
| base | original column2 | original column229 | 129 | nodes228+229 |
| variant | original column2 | original column232 | 135 | nodes231+232 |

The initial passive witness uses nodes1+2. The later witnesses use **different**
expanded identities. Hashes prove the same later identities across the two
originals, despite different original indices and Q permutations. In each of
nine later factors per original, the observed unpivoted workspace maximum is
exactly zero. Independent dense partial-pivot elimination in the observed Q
order rejects the same step and its recovered simple right-null witness
verifies `A*z == 0` exactly against the input CSC matrix. This is a mathematical
certificate of singularity of the *stamped system*, not a claim that the
original intended circuit is structurally singular.

All33 factor attempts per original have finite matrix, RHS and initial state.
All node and branch guesses are zero. There are no accepted factors/solves:
one plain Newton, nine dynamic node-gmin, nine true device-gmin, fourteen
source-stepping/final attempts. The terminal error rethrows the original
column2 failure, hiding the later blocker if only the final error is examined.
`trace.mts` captures the actual caller phase, source scale, device gmin,
state/matrix/pattern hashes, original column, elimination position, preferred
row and completed row/Q-permutation hashes. No source code instrumentation or
numeric substitutions are applied.

The later pair's sole incident device is a **linear VCCS**, not an ASRC. One
of its control nodes is the scoped `TABLE` syntax keyword; the other contains
a braced node-dependent expression. Only booleans, indices and identity hashes
are published, never the original names/expressions. This directly identifies
a compatibility lowering gap. `Circuit.expandSubcircuit` currently reads a
G card's fields3/4 as controlling node names and field5 as a numeric gain
(`packages/core/src/circuit.ts:3655-3663`); the controlled-source guard checks
only minimum field count (`parser/controlled-source.ts:98-107`). The current
preprocessor only lowers value=/vol=/cur= forms
(`parser/preprocessor.ts:706-720`). TABLE input and pairs can therefore be
silently misinterpreted as a linear controlled source in a subcircuit. The
self-written fixture demonstrates this without copying vendor expressions.

There is also a general **missing structural diagonal** weakness, exposed by
the malformed control nodes: both later node diagonal slots are -1.
`SparseMatrix.add(..., 0)` does not register a slot (`solver/sparse-matrix.ts:11-12`),
`MNAAssembler.lockTopology` unions only stamped G/C entries and initializes
missing diagonal indices to -1 (`mna/assembler.ts:233-242,255-265`), and the
locked Newton gmin loop adds via those indices (`analysis/newton-raphson.ts:125-131`).
A negative typed-array index cannot add the intended node conductance. Gmin
lifts the earlier resistor island, whose diagonals do exist, but not this
control-only common mode. Correctly registering diagonals alone would not
make a syntax keyword/expression a valid circuit node or restore TABLE
semantics. Do not use shunts to conceal the lowering gap.

### Distinguishing the hypotheses

- Structural common mode: proved for the later **native stamp**, with exact
  right-null residual and only a VCCS control-pair incidence.
- Stamp/model semantics: proved mismatch — TABLE syntax became node identities
  and a linear VCCS; ngspice instead supplies an ASRC input plus XSPICE PWL.
- Finite Jacobian/Newton initialization: all-zero finite state and finite
  stamps are observed, not overflow or a runaway iterate. The erroneous source
  is linear, so no finite nonlinear gradient at that source explains the loss.
  This does NOT prove every vendor device's Jacobian/model is otherwise correct.
- Numeric factorization: independent dense elimination and exact `A*z=0`
  confirm singular inputs for these later attempts. No LU fix is justified by
  these observations; this does not certify the solver for all other circuits.

## Self-written MIT reductions and limits

All three circuits are new, self-authored MIT examples, not vendor extracts.
Their generic node capitalization makes the passive failure appear first in
the combined reduction's ordering; no original deck/name/order is changed.

- `table.cir`: a passive floating RC island **and** a subcircuit G TABLE source,
  plus a simple nonlinear B source to exercise the same recovery chain. Plain
  Newton fails at original column1; node-gmin then fails at column4. During
  node-gmin an exact common-mode witness on the bogus TABLE/expression nodes
  remains, with absent diagonal slots and a single VCCS incidence.
- `table-isolated.cir`: remove the passive island entirely. The same TABLE
  semantic nullspace and node-gmin failures remain. This demonstrates that the
  later mechanism is not proved merely by the old passive reduction.
- `table-lowered.cir`: explicitly authored **top-level** B-input + XSPICE PWL +
  output G control. Both engines complete21 AC rows. This demonstrates that the
  existing top-level PWL machinery can represent this simple transfer, NOT an
  implemented parser fix, general nonlinear recovery, or vendor parity. No
  waveform error calculation is performed, so its max/RMS metrics remain null.

Independent dense back-substitution for the small malformed reductions may
produce a nonsimple null vector. `verified:false` for its rounded candidate is
retained honestly. Their TABLE common mode is instead proved by independently
adding the two input CSC columns and checking **every row** for exact zero;
this pair proof does not depend on the solver-selected failing column. The
original later dense witnesses *are* verified. Pivot index is not generally
the physical source of the nullspace.

`parity-red.mts` is an intentionally failing expected-correctness assertion:
TABLE must not become an MNA node (exit1, `red.log`). The diagnosis does not
turn that semantic RED into GREEN. `evidence.test.mts` contains five passing
offline receipt/redaction/phase/reduction tests and verifies that the known
semantic loss still exists. Passing evidence tests are not simulator parity.

## Pinned reference behavior and actual results

Reference source: https://git.code.sf.net/p/ngspice/ngspice, tag `ngspice-47`,
exact revision `a80f6e3e95d51534905b1f23410a951802666656`. Read-only checkout HEAD
was verified; `source.json` records SHA256 of files read from that exact tree.
Ngspice source is modified BSD; no source implementation is copied here.

- `src/frontend/inpcom.c:6498-6505,6516-6599,6652-6658`: PSpice G TABLE lowers
  to a linear output G, B-source input, XSPICE A transfer and PWL model with
  `input_domain=0.1 fraction=TRUE limit=TRUE`. Endpoint handling, smoothing,
  input limiting, multiplicity and scoped symbols must follow the actual
  compatibility semantics, not a guessed hard piecewise function.
- E TABLE lowering is the analogous path at `inpcom.c:6217-6249`.
- `src/spicelib/analysis/cktop.c:46-76`: Newton then dynamic/true gmin;
  `:85-103`: source stepping, then OPtran only if those fail.
- `src/frontend/init.c:77-93` and `analysis/optran.c` describe the default
  finite-time OPtran fallback pinned in the historical #927 evidence. That
  behavior is **not** the recovery used by these original reference runs.

Installed ngspice47 is built with KLU, but these actual runs select SPARSE1.3.
Each original's log confirms compatibility `ps lt`, presence of XSPICE devices,
**dynamic gmin completed**, exit0, and141 AC rows. No transient OP recovery is
observed. Do not extrapolate the #927 passive OPtran evidence to these decks.
Native remains failed, reference remains successful; max/RMS errors are null.

| Input | Historical #927 native after (ms/result) | Current instrumented native (ms/result) | Current reference child wall (ms/rows) |
| --- | --- | --- | --- |
| base | 55.910709 / failed pivot2 | 78.134084 / failed pivot2 | 77.198916 /141 |
| variant | 61.484541 / failed pivot2 | 94.887375 / failed pivot2 | 94.649666 /141 |

These are real single shared-host observations, **not comparable timings or a
speedup claim**: current native timing includes observational dense nullspace
checks, historical native timing does not. Reference timing includes startup
and raw I/O. Before/after correctness headline: **no change — 0/2 native
completions, 2/2 reference completions with141 rows each**. No production fix,
aggregate result or superiority claim is made.

## Fetch-only licence and byte preservation

Original source: https://sourceforge.net/p/ngspice/bugs/784/, attachment
`question.7z`. Existing `benchmarks/SOURCES.md` and corpus ticket metadata
remain the source of licence/redistribution policy; this card explicitly forbids
editing those shared records. Vendor models/decks are fetch-only, not MIT
licensed by this PR, and are never redistributed. `run.py prepare` fetches the
manifest attachment URL, checks its existing SHA256, extracts only into this
directory's ignored `.run/`, and changes only quoted absolute include paths.
Binary relocation preserves CRLF and every other byte. Original deck hashes,
path-specific relocated hashes and each include hash are in `inputs.json`.
Both engines consume exactly the same relocated deck/includes; before/after
input hashes are equal. Original hashes remain:

- base: `72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4`
- variant: `119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723`

Vendor raw output is ignored/private. Published receipts contain no complete
matrices, expanded expressions, libraries, device/node names or vendor logs;
only input filenames, type/terminal topology, scalar diagnostics and hashes.
The unrelated #738/#812 TEMP gap is not fetched or modified by this delivery.

## Next smallest general fix / ownership proposal — not implemented

1. First coherent safety slice: reserve
   `packages/core/src/parser/controlled-source.ts` and a new
   `packages/core/src/parser/controlled-source-table-917.test.ts`. Reject an
   unlowered TABLE form with a structured ParseError before treating keyword,
   expression and pair data as linear-source fields. Cover both E/G and root/
   subcircuit forms. This removes a false topology diagnosis but does **not**
   resolve the original execution loss or close #917.
2. For real parity, supervisor must reserve a dedicated
   `packages/core/src/parser/controlled-source-table.ts` lowering helper plus
   the integration points in `parser/preprocessor.ts`, `parser/index.ts` and
   `circuit.ts` for scoped generated A/model descriptors. Reuse the existing
   `devices/xspice/models.ts` PWL behavior; prove endpoint/smoothing/limiting,
   parameter/port mapping, multiplicity and AC derivatives with MIT tests and
   unchanged originals. Do not implement a solver pin or generic gmin tweak.
   Current A-card/model-in-subcircuit support is another dependency: the two
   attempted scoped explicit controls were rejected (PWL model type, then A
   card), so the successful control is top-level, not proof of scoped support.
   Coordinate with XSPICE #553 and parser #930 before any reservation.
3. Separately, after ownership clearance, reserve
   `packages/core/src/mna/assembler.ts` plus a new assembler regression test for
   zero-valued diagonal structural slots needed by homotopies. Use structural
   touches, not permanent conductance. This repairs a general infrastructure
   weakness but cannot fix malformed TABLE semantics. No file in solver #932
   is required or modified. No speculative node shunts/tolerance changes.

These are proposals for the supervisor, not expanded implementation scope.
The shared circuit/parser files are hotspots; do not collide with active lanes.

## Reproduce / verification / failed attempts

From this isolated worktree, frozen lockfile installed:

    python3 benchmarks/vendor-expanded-node-917/run.py prepare
    python3 benchmarks/vendor-expanded-node-917/run.py source
    spice-heavy python3 benchmarks/vendor-expanded-node-917/run.py reductions
    spice-heavy python3 benchmarks/vendor-expanded-node-917/run.py engines
    spice-heavy python3 benchmarks/vendor-expanded-node-917/run.py verify
    pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module NodeNext --target ES2022 --moduleResolution NodeNext --types node ../../benchmarks/vendor-expanded-node-917/trace.mts ../../benchmarks/vendor-expanded-node-917/evidence.test.mts ../../benchmarks/vendor-expanded-node-917/parity-red.mts

All engine/source/verification children use their own process group, a deadline
at most30s and a cumulative actual-child-wall600s ceiling. The helper now uses
an exclusive flock to serialize both execution and ledger writes. One initial
0.799s failed top-level TABLE trial was accidentally launched concurrently
with the6.830s source clone before that lock existed; both actual durations are
retained, and this is explicitly a deviation from the one-child-at-a-time
request, not a claim of perfect compliance. All subsequent launches are
serialized; no native/reference engine comparison was run in parallel. No
global pkill. Queued spice-heavy wait time is not child execution wall time.
One240s queue timeout happened before any engine launch; retry acquired a slot.
The early top-level TABLE trial rejected node-dependent parameter evaluation;
the subcircuit reduction is the mechanism actually tested. Initial scoped PWL
controls failed as described above; their failed child exits remain in the
budget ledger, not silently counted as successful controls.

`verification.json` and logs record: offline5/5 exit0, root build exit0, root
lint exit0. The guarded root full suite hit its29s child limit (SIGKILL/-9),
not a passing suite; exact-head required GitHub test20/test22/build/accuracy
checks are the authoritative full gate. Strict NodeNext/ES2022 typecheck exited0.
`child-budget.json` records67 children,130.142535288s total actual child wall at
the resumed verification checkpoint, including failed trials/source/verification. Regeneration
starts a fresh ledger if `.run/` is removed; total is not elapsed session time.
`resume-checks.json` records the final passing offline and strict type checks
after the resumed phase/budget assertions were added. Older typecheck receipts
are retained as history, not substituted for that final execution.

The requested `/poteto-mode` plugin lookup was attempted, but this unattended
profile has no loadable plugin skill or CLI command. No GSD substitute, UI,
production/release/tag/npm/deploy/web/secrets/spending action was used. Required
exact-head CI and independent review are recorded in the Kanban/PR handoff.
