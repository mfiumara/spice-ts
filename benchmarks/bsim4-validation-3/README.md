# BSIM4 static OP/DC validation (#3)

This validates the ngspice-47 `bsim4/` VERSION=4.8/default static port, not
bsim4v7 or a complete BSIM4 implementation. Supervisor's source-family and
ECL-2.0 decisions supersede the original card shorthand.

## Measured result

Six supported cards pass 648 native bias points / 2592 Id/gm/gds/gmbs comparisons.
Maximum relative discrepancy is 3.4008649204066223e-13. One shared unit-test limit
is 1e-8 with a 1e-18 native-zero denominator floor. The retained 4.3-family card
is rejected, never relabeled or fitted. These are device-kernel tests, not a
claim that model-bin selection works.

Of the four exact F/G gap fixtures, one is compared and three remain typed
unsupported. Full before/after outcomes and all per-signal max-abs/RMS/relative
errors are in [TABLES.md](TABLES.md) and machine-readable [after.json](after.json).
The BSIM482 original has six plots / 1236 points / 102 plot-signal metric rows.
Largest per-signal max-abs is 7.174183816332097e-13 (A); largest per-signal RMS is
5.785041538060496e-14 (A). Temperature sweeps now work using main's shared DC TEMP
implementation, not special-case circuit parameters. Near-zero relative losses
are published as well. No speed or superiority claim.

The four original files are named in TABLES.md. All were freshly executed in
both engines from identical bytes and checked against their committed SHA256.
Native log receipts are native/0..3/original.log. Native exits are all 0;
G nevertheless logs `Error: no function as { with that arity.` for its original
.print expression. That is an output failure, not full native success.

For numeric extraction, native output-only instrumentation is the fixture lane's
committed generator: original BSIM482 circuit/models/sources/DC command values
are unchanged, plots are omitted and ASCII writes added. Native regenerated
cases, pairDc and binningOp match the committed oracle exactly, including deck
hashes. No edited circuit is substituted for an original fixture. spice-ts runs
the original control script; every native solution vector is compared once to
its corresponding run in source order. Both nested coordinates are checked;
there is no interpolation, first-plot reuse or hidden missing-signal filter.

Binning-1 remains a loss: width-dependent model-family selection is not
implemented. A narrow compile-boundary guard now reports UnsupportedModel
(alias of UnsupportedModelParameterError / UNSUPPORTED_MODEL_PARAMETER), not
misleading unknown-model InvalidCircuitError or a default MOS fallback. Truly
unknown names remain invalid. 4.3 AC and G TRAN also fail closed. Missing
waveforms have null errors, never zero. Follow-up scope belongs to the supervisor.

## RED / GREEN and reproduction

The initial new grid checks passed. The bin-family typed-error regression failed
on the accepted implementation: 26 passed / 1 failed; retained at
packages/core/src/devices/bsim4/parity-red.log. It is a real InvalidCircuitError
vs UnsupportedModel assertion, not a fabricated numeric RED. No channel port
bug was discovered in the six-card grid. After the compile guard and four edge
checks, the targeted group passes 302 tests (31 new parity tests plus 271 existing).

```sh
pnpm install --frozen-lockfile
spice-heavy python3 benchmarks/bsim4-validation-3/native.py
pnpm exec tsx benchmarks/bsim4-validation-3/compare.ts
python3 benchmarks/bsim4-validation-3/render.py
pnpm -C packages/core exec vitest run src/devices/bsim4/parity.test.ts src/devices/bsim4-junction.test.ts src/devices/bsim4/setup.test.ts src/devices/bsim4/temp.test.ts src/devices/bsim4/load.test.ts src/devices/bsim4/device.test.ts src/parser/bsim-model-version.test.ts src/devices/mosfet-body-effect.test.ts
pnpm -C packages/core exec tsc --noEmit
pnpm build
pnpm lint
```

Native regeneration/original four-deck executions run serially inside one
spice-heavy reservation, with 60s individual deadlines. ngspice-47 binary banner
and actual SPARSE 1.3 selection are retained by the committed oracle; host is
Darwin arm64 (see oracle environment). No local unguarded monorepo suite was run;
required GitHub CI is the exact-head full gate.

Report sourceHead records the base commit on which the measurement worktree
ran, not a clean-tree claim. The PR and Kanban handoff bind the resulting final
commit and exact-head CI receipts separately. Generated duplicate oracle files
are ignored; running native.py recreates them and verifies exact equality.

## Provenance and scope audit

The port's additive benchmarks/SOURCES.md entry records pinned
ngspice-47 a80f6e3e95d51534905b1f23410a951802666656, b4ld/b4set/b4temp/b4geo/b4check,
University of California 2025, ECL-2.0. Full licence and original notices remain
in packages/core/src/devices/bsim4; no package-licence or publication change.
Existing F BSD-3-Clause and G GPL-3.0-or-later registrations cover the original
fixtures, which stay in the separately licensed benchmark tree. No new external
circuit source or source-row edit is introduced by validation.

No parser implementation or benchmarks/reference file is edited by this work.
The complete PR deliberately includes the supervisor-authorized expectation-only
migration in parser/bsim-model-version.test.ts. Therefore a claim of zero parser
file edits would be false. Also contains the legacy MOS body-effect test update.
Hotspots are circuit.ts, SOURCES.md and that MOS test; validation only adds the
narrow bin rejection to circuit.ts. No aggregate/parity snapshot refresh.

No merge, npm publish, changeset version, tags, releases or release PR action.
