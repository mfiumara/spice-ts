# Original-vendor pivot-2 diagnosis (#917)

Diagnosis only. Refs #917, not a fix. No production code, tolerance, vendor-byte,
corpus-outcome, aggregate, SOURCES, ROADMAP, CI or version changes.

Baseline `6d07f22d9de7bfa06d925bd5fa08de303c2ef871` includes actually merged #911
(`a7f2ea52efee723d6fd74999ff38760f63c7143b`). Parent #911 exact reviewed head
was `88ad271a198cde9f3a17e9fb16847621cc74fb98`. These receipts are independent
post-merge runs, not inherited parent local hashes.

## Source and licence boundary

Original inputs are fetch-only upstream ngspice SourceForge ticket 784
(https://sourceforge.net/p/ngspice/bugs/784/), attachment question.7z.
The existing manifest and benchmarks/SOURCES.md govern vendor licence policy.
No deck/library bytes, expanded vendor expressions or full vendor matrices are
redistributed. The circuit, scripts and tests written here are MIT, as marked
by their SPDX identifiers. Receipts contain hashes, topology metadata, a two-row
passive matrix fragment, engine diagnostics and timings. Expanded behavioral
node expressions in fallback errors are redacted, preserving pivot indices.

Original SHA256 (verified against issue917):

- base_159.cir: 72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4
- variant_159.cir: 119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723

Local SHA256, identical native/reference bytes in THIS worktree:

- base: 7c4a2e2a4587c98404c9fdbf2ef5a124ea25b9403417c7bd679fe7692133b21a
- variant: 7c6212a8c15c56e652d742789c498ceeb4e875149fbc95d9a7eb2f78d3b836b2

Absolute include-path relocation changes local hashes between worktrees.
`trace.json` records includes consumed by native parse; `comparison.json` hashes
the same relocated deck's three included files before and after each reference
run. Offline tests require equality of those hashes, not parent local hashes.
The native resolver uses the existing runner's basename matching; included
file contents remain unchanged. Include hashes are recorded individually:

- AD620.mod: 99c3a83c8e4a44fc1c2e5b878a061e03f959e223fa646bb849589e68f603f395
- lmx58_lm2904.lib: 467a3e573420d1f5a21fab57b76be0e13073e854f609a73459a191958e314726
- UA555.mod: e4b70989b2ca1cd9e3177bc4d35224098360461a2b6901a688542e2d1af6d7bf

## Reproduction

Run from repository root. Dependencies installed with pnpm 10.28.1 frozen lockfile.

    pnpm install --frozen-lockfile
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 784 738
    mkdir -p benchmarks/corpus/ngspice-bugs/fetched/784/extracted
    mkdir -p benchmarks/corpus/ngspice-bugs/fetched/738/extracted
    /usr/bin/tar -xf benchmarks/corpus/ngspice-bugs/fetched/784/question.7z -C benchmarks/corpus/ngspice-bugs/fetched/784/extracted
    /usr/bin/tar -xf benchmarks/corpus/ngspice-bugs/fetched/738/Test.zip -C benchmarks/corpus/ngspice-bugs/fetched/738/extracted
    spice-heavy pnpm exec tsx benchmarks/subckt-model-expressions-882/vendor.mts
    pnpm exec tsx benchmarks/vendor-singular-917/trace.mts
    spice-heavy pnpm exec tsx benchmarks/vendor-singular-917/compare.mts
    pnpm exec tsx --test benchmarks/vendor-singular-917/diagnosis.test.mts
    EXPECT_SUCCESS=1 pnpm exec tsx --test benchmarks/vendor-singular-917/diagnosis.test.mts

The existing #882 runner is used unmodified and read-only. Save its stdout as
vendor.json if refreshing receipts. It exits 0 while reporting unsupported
engine outcomes, not successful simulation. Fetch, extraction, trace and
comparison commands exited 0. Diagnostic tests exited 0 (4 passed); desired
success RED mode exited 1 (1 failed, 3 passed). RED intentionally remains RED:
this PR does not fix the simulator. build.log.gz/lint.log document exit-0 local
build and lint. `spice-heavy pnpm test` exited 0 (4030 passed, 6 skipped),
archived in full-tests.log.gz. An explicit NodeNext/ES2022 TypeScript check of
all three new scripts/tests also exited 0. Required exact-head CI is a separate
publication gate, not inferred from those local results.

The reference configuration comes directly from #911's parent #882 receipt:
local `.spiceinit` contains `set ngbehavior=ltps` and `set filetype=ascii`.
`compare.mts` writes those exact settings in its ignored `.run` directory and
invokes `ngspice -b -r <absolute-raw-path> <absolute-relocated-deck-path>` there.
Every invocation and cwd is recorded. Installed ngspice-47 advertises KLU,
but these actual logs report SPARSE 1.3; do not describe this run as KLU.

Host: Apple M5 Pro, darwin kernel 27.0.0, Node v22.23.1, ngspice 47.
Timings below are individual runs on a shared host, NOT speed comparisons.
Native vendor.json measures simulate parse/compile/failure wall time.
Trace timings include observational wrapping, with independent precompilation
outside that boundary. Reference timing includes process startup and raw I/O.
No production change means no meaningful before/after speed claim.

| Input | Native uninstrumented ms | Traced ms | Reference ms | Reference exit / AC rows | Native result | max/RMS error |
| --- | ---: | ---: | ---: | --- | --- | --- |
| original base | 175.586167 | 39.172084 | 79.292958 | 0 / 141 | DC-OP pivot 2 | null / null |
| original variant | 132.950333 | 21.301542 | 68.430791 | 0 / 141 | DC-OP pivot 2 | null / null |
| MIT floating RC | 15.359916 | not run | 18.678250 | 0 / 31 | DC-OP pivot 1 (b) | null / null |

Original #738 still reports undefined TEMP in vendor.json, separate #812 gap.
No #738 parity claim or new recovery experiment is made here.

## Mechanism established, and limits

`simulate.ts:236` computes DC operating point before AC. Both decks reach
`dc.ts:54` -> `newton-raphson.ts:135` -> `gilbert-peierls.ts:476`.
The first linearization is all-zero, finite, sourceScale=1, deviceGmin=1e-12,
maximum RHS magnitude 180. Native default node-diagonal gmin is zero
(`types.ts:332`); device junction gmin is not a ground shunt on every node.

Expanded base has 254 nodes / 57 branches, 311 matrix variables, 1160 structural
entries. Variant has 257 nodes / 60 branches, 317 variables, 1166 entries.
Node indices 1 and 2 are Net-_C1214-Pad2_ and Net-_C1215-Pad1_. Their only
attached devices are C1214, C1215 and R1292. Capacitors are DC opens
(`devices/capacitor.ts:52`), leaving the isolated resistor component.
Both first stamped rows have only columns 1 and 2:

    [ g  -g ]
    [-g   g ]     g = 0.005050505050505051 S

Multiplying by [1,1] gives [0,0] exactly. This is genuine DC common-mode
singularity, not evidence of a nonsingular-LU defect. The self-written matrix
test uses g=1/200, not copied vendor model values, and correctly rejects it.
Finite first stamps exclude initial expression overflow as the pivot-2 cause.
AC never starts natively; max/RMS errors cannot be computed and remain null.

Recovery is a separate problem. Each original makes 33 factorization attempts:
24 fail at pivot2; 9 diagonal-gmin trials pass that component and instead fail
at base pivot229 / variant pivot232, an expanded behavioral node. All attempts
and errors remain in trace.json. `dc.ts:55-71` finally rethrows the ORIGINAL
error, hiding those later failures from the public message. No factorization
succeeds, no candidate Newton solution is produced. Device-model semantics,
expanded-node identity, later matrix conditioning/stamping and recovery remain
unresolved for that second failure. Do not conclude that a floating-node fix
alone restores the original decks.

Ngspice succeeds on originals with dynamic gmin stepping. The MIT RC reduction
preserves the floating passive DC block and native DC-before-AC loss, but
changes recovery behavior. Its reference logs retain singular warnings,
failed dynamic gmin, failed true gmin and failed source stepping, followed by
successful TRANSIENT OP recovery and 31 AC rows. The reduction has no nonlinear
devices, so native `dc.ts:60` bypasses homotopy fallbacks entirely. Native has
no corresponding transient-OP fallback in this path. This reduction proves an
execution/recovery gap, not all vendor model semantics or waveform accuracy.
Ngspice exit0 does not imply that the DC block had a unique operating point.

## Smallest next reservation request, not authorization

Request supervisor reservation for `packages/core/src/analysis/dc.ts` and a new
`packages/core/src/analysis/dc-floating-recovery-917.test.ts` to investigate and
port reference recovery for floating passive DC components. First preserve the
RED reduction and prove reference-consistent recovery without permanent shunts
or per-circuit tuning. Do not lower LU thresholds or patch production now.
The exact semantics for a transient-OP fallback and its common-mode selection
need reference evidence before implementation; a new helper is not reserved.

A second bounded diagnosis of base229/variant232 remains necessary before
claiming original-vendor success. No parser/circuit/solver/device files are
reserved by this PR. Coordinate with #907 solver investigation and #908 devsup
review before reserving shared numerical files. Root-cause confidence is high
for the initial floating-block mechanism, unresolved for total vendor failure.

Roadmap handoff: #917 remains an OPEN execution loss for the next queued ROADMAP
reconciliation. The shared ROADMAP is intentionally untouched.
