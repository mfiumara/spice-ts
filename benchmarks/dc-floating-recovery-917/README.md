# Bounded passive floating-DC recovery (#917)

Refs #917. This fixes the MIT passive RC reduction, not the original vendor
models. Both unchanged originals still fail. The issue must remain OPEN.
Only dc.ts and the named new core regression test change production/test code.

## Sources and licences

All new scripts/tests are self-written MIT code. The reduction is the existing
MIT `benchmarks/vendor-singular-917/floating-rc.cir`, used byte-for-byte.
Existing `benchmarks/SOURCES.md` and the diagnosis README govern the fetch-only
vendor licence boundary. Upstream is ngspice SourceForge ticket 784,
https://sourceforge.net/p/ngspice/bugs/784/, attachment question.7z. No vendor
netlist/library bytes or expanded behavioral expressions are committed here.
Only absolute include paths are relocated, identically for both engines.

Reference source is ngspice tag `ngspice-47`, exact revision
`a80f6e3e95d51534905b1f23410a951802666656` at
https://git.code.sf.net/p/ngspice/ngspice. `git ls-remote` verified the tag,
and `source.json` records SHA256 of files read from that exact git tree.
Ngspice source uses its modified BSD licence; no source implementation is
copied into this directory.

Source evidence:

- frontend/init.c:77-93 sets default `optran 1 1 1 100n 10u 0`.
- analysis/cktop.c:94-103 invokes OPtran only after Newton/gmin/source failure.
- cktop.c:494-501 resets the source-stepping guess and charge state to zero.
- analysis/optran.c:290-294 describes a finite-time transient, with no output
  vectors, whose final solution becomes the operating point.
- optran.c:361-365 uses the configured step/horizon; :415-419 starts
  MODETRAN/MODEINITTRAN with charge history.
- devices/cap/capload.c:49-79 initializes and integrates capacitor charge.

This is NOT a steady-state pin or a pseudoinverse. With 1u/2u capacitors,
ngspice returns a=0.9518289887645057 and b=0.02408550561231978 after 10us.
With 1n/2n it approaches a=b=1/3. A permanent ground shunt would instead pick
zero common mode and is not equivalent. `reference-probes.json` retains the
singular warnings, all failed homotopies, successful transient recovery, and
raw MIT-only values. No source stepping/gmin output is falsely called a DC
steady-state solution.

## Implemented bound

After an initial SingularMatrixError only, admit exact built-in positive
resistors/capacitors and constant independent V/I sources. At least one
floating static component and one capacitor must be present. Nonlinear/custom
models, waveform sources, RF ports, IC=, .ic, .nodeset, supplied initial
solutions and nonzero configured node gmin are outside this proved subset.
Existing nonlinear homotopy and finite/infinite B-source paths are unchanged.

Reuse the existing transient driver with a zero-charge seed, 100ns maximum
step and a 10us horizon. The explicit seed avoids a recursive DC solve through
the dc/transient-driver import cycle. This adds no new public API or helper
module. Limit recovery to 10000 driver advances; propagate protocol
cancellation/resource errors and dispose the driver on every path. A failed,
unfinished or nonfinite recovery rethrows the original singular error. The
10000-advance limit is a fixed work ceiling, not a circuit-specific tuning knob.
The fallback uses a private driver telemetry object; no new telemetry schema
or recovery counters are introduced in this bounded reservation.

Reject a nonzero net DC injection into a floating resistive/voltage-source
component before attempting recovery. Ngspice's finite-time OPtran actually
accepts this inconsistent current-source control too. This intentional retained
policy loss is published, not hidden. Conflicting ideal-source constraints and
unanchored capacitive common modes remain failures. No ground conductance,
held-node row, LU threshold or tolerance change persists in the original DC
assembler. A test restamps it and confirms its true static nullspace remains.

The original nonlinear models are not admitted. Extending recovery to those
models requires a separate reservation proving MODEINITTRAN initialization and
the pivot229/232 failures. Do not extrapolate this passive result to vendor
model correctness, device coverage or full SPICE parity.

## Same-byte results

Baseline is diagnosis merge d4b1ce04b70f98986d825d1daee64fabcfc7ae61.
`comparison.json` runs that archived source tree and this change in bounded
separate Node processes on each identical relocated deck. It records every
invocation, exit/signal, include hash and timeout budget. Native child exit0
means the worker reported an outcome, not that the simulator succeeded.
Reference configuration is exactly `set ngbehavior=ltps` and
`set filetype=ascii`. Installed ngspice47 advertises KLU, but these actual logs
report SPARSE 1.3. Host is Apple M5 Pro, darwin27.0.0, Node22.23.1.

| Input | Before native ms/result | After native ms/result | Reference ms/AC rows | Max/RMS relative voltage error |
| --- | --- | --- | --- | --- |
| MIT RC reduction | 10.775042 / pivot1 | 20.767125 / success | 22.094750 / 31 | 6.05355206622835e-14 / 1.023545913178503e-14 |
| original base | 63.130750 / pivot2 | 55.910709 / pivot2 | 60.241375 / 141 | null / null |
| original variant | 65.419959 / pivot2 | 61.484541 / pivot2 | 69.868458 / 141 | null / null |
| ordinary divider | 10.968625 / success | 12.509417 / success | 48.794416 / OP only | null / null |
| inconsistent island current | 12.154250 / failure | 14.265250 / failure | 19.861375 / 31 | null / null |

These are single shared-host runs, NOT a speed comparison. Native time includes
parse/compile/analysis; reference includes startup/raw I/O. AC error compares
all 93 complex node-voltage phasors at 31 matched frequencies. Relative error
denominator is the reference phasor magnitude; RMS covers every node/row.
No interpolation or per-circuit tolerance is applied. The ordinary divider's
DC values are bit-identical before/after. Null metrics mean no native waveform
exists, or no AC comparison was performed for the OP-only divider.

The native driver probes without UIC match the 1u/2u reference OP within
1.2649992164881496e-11 V max / 7.344457504359817e-12 V RMS over all three
nodes. The 1n/2n control differs by 2.2521799425412325e-9 V max /
1.8298476635249317e-9 V RMS. Both use 107 advances to 10us. The alternate UIC
bootstrap probe also succeeds but is NOT the implementation's selected mode.
`native-probes.json` and `summary.json` retain both observations.

Reduction SHA256 is
23c05174610397c199ae3ad79444f830645ad1f04c29064d2a8442978edd5486.
Original input SHA256 remains:

- base: 72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4
- variant: 119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723

Local hashes are path-specific and recorded in comparison.json/vendor.json.
Each native/reference invocation consumes the same local bytes/includes, whose
before/after hashes are equal. trace.json confirms 33 attempts per original:
24 pivot2 failures, 9 later base229/variant232 failures, all finite matrices.
Unavailable vendor max/RMS values remain null. #738 undefined TEMP is preserved
in vendor.json as the separate #812 loss, not treated as this fix's scope.

## Reproduce and verify

From repository root, pnpm10.28.1 with frozen lockfile:

    pnpm install --frozen-lockfile
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 784 738
    mkdir -p benchmarks/corpus/ngspice-bugs/fetched/784/extracted benchmarks/corpus/ngspice-bugs/fetched/738/extracted
    /usr/bin/tar -xf benchmarks/corpus/ngspice-bugs/fetched/784/question.7z -C benchmarks/corpus/ngspice-bugs/fetched/784/extracted
    /usr/bin/tar -xf benchmarks/corpus/ngspice-bugs/fetched/738/Test.zip -C benchmarks/corpus/ngspice-bugs/fetched/738/extracted
    spice-heavy pnpm exec tsx benchmarks/subckt-model-expressions-882/vendor.mts > benchmarks/dc-floating-recovery-917/vendor.json
    mkdir -p benchmarks/dc-floating-recovery-917/.run/baseline
    git archive d4b1ce04b70f98986d825d1daee64fabcfc7ae61 packages/core/src | tar -x -C benchmarks/dc-floating-recovery-917/.run/baseline
    pnpm exec tsx benchmarks/dc-floating-recovery-917/trace.mts
    spice-heavy pnpm exec tsx benchmarks/dc-floating-recovery-917/probe.mts
    pnpm exec tsx benchmarks/dc-floating-recovery-917/native-probe.mts
    spice-heavy pnpm exec tsx benchmarks/dc-floating-recovery-917/compare.mts
    pnpm exec tsx benchmarks/dc-floating-recovery-917/summarize.mts
    pnpm exec tsx --test benchmarks/dc-floating-recovery-917/evidence.test.mts
    pnpm -C packages/core exec vitest run src/analysis/dc-floating-recovery-917.test.ts src/analysis/dc.test.ts src/parser/bsource-finite-jacobian-overflow-899.test.ts src/parser/bsource-pow-zero-base-886.test.ts src/parser/bsource-caret-initial-iterate-891.test.ts
    pnpm build && pnpm lint && spice-heavy pnpm test

RED log: exit1, one genuine simulator failure and three passing controls.
A separate test-first commit preserves regression assertions before the fix.
Final targeted GREEN: exit0, 38 tests in five files (18 new tests). Offline
receipts: exit0, five tests. Explicit strict NodeNext/ES2022 TypeScript checking
of all new .mts scripts: exit0. Build/lint: exit0. The first guarded full suite
passed4047 tests with six skips, before the last budget-ceiling test was added.
The repeated guarded full suite passed4048 tests with six skips (18 new core
tests). Both verification chains exited0. Build/full-suite logs are compressed
as build.log.gz/full-tests.log.gz and final-build.log.gz/final-full-tests.log.gz.
The exact-head required CI gate is separate and recorded in the handoff.

## Failed attempts and boundaries

An initial heavy reference launch timed out after180s waiting for both heavy
slots, before any ngspice run. The queued retry completed. A test fixture path
had one extra parent directory; the setup failed with zero tests, was corrected,
and only the genuine pivot1 RED is retained as red.log. The first native probe
used a nonexistent parser module path, corrected to the existing parse API.
An initial baseline archive command had a mistyped object ID; the provisional
before workers reported module-not-found, not simulator outcomes. The corrected
archive and full comparison replaced those unusable receipts. An initial
script typecheck used a shell glob from the wrong cwd, then a non-strict mode
that exposed existing narrowing errors; the strict correctly-scoped command
passed. No failed engine path, timeout or unavailable metric is called success.

No aggregate/corpus/sharedSOURCES/ROADMAP refresh, nonlinear solver rewrite,
original-vendor input adaptation, release action or merge is part of this PR.
