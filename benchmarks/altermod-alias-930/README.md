# #930: altermod device aliases resolve the shared model

`Circuit.alterModel` previously looked up only a model name. ngspice-47 accepts
an instance name too, and changes that instance's shared model, not a private
instance parameter. The minimal identical deck demonstrates this for two
resistors. targets.cir also proves the instance wins when a model has the same
name. The production change resolves an existing descriptor's model first, then
looks up a named model only if no descriptor exists. X descriptors name
subcircuits, not device models, and are deliberately excluded. Unknown targets
and model-less devices still return the existing unsupported error. This is not
full parity with ngspice's implicit/default device models or error continuation.

Only circuit.ts, a dedicated regression test and this directory change. No
parser, control, solver, device or shared benchmark edits. PR941 was verified
MERGED at 8e32f51f555a2941a30ccfa9281a75f8ef2dbe30 before editing circuit.ts;
that commit is the tested base and contains PR937's csparam retention fix.
/poteto-mode loaded from the installed pstack SKILL.md.

## Reproduce

    pnpm -C packages/core exec vitest run src/altermod-alias.test.ts src/parser/control src/subcircuit-model-scope-854.test.ts src/subcircuit-dynamic-params-888.test.ts
    spice-heavy python3 benchmarks/altermod-alias-930/compare.py after
    python3 benchmarks/altermod-alias-930/check.py
    pnpm build
    pnpm lint
    spice-heavy pnpm test

The before run was on the base production code, after temporarily reversing the
production patch. `compare.py before` is for that baseline only. A rerun writes
phase logs, so archive existing receipts first. Reference version assertion pins
ngspice-47 (Homebrew KLU build), Node v22.23.1, macOS 27.0.1 arm64.
Children are serial, owned process groups, capped at 12s each and 300s cumulative
actual child wall. Only a timed-out owned group is killed, never global processes.
Commands, exits, deck SHA256s, patch digest, machine and timings are in JSON.
Raw root logs are preserved byte-for-byte in receipts.zip. Failed-runner and
intermediate logs are in failed-runner.zip and pre-precedence.zip, with their
JSON summaries also unpacked. Extract the archives to inspect the named logs.

## Fresh identical-original numerical evidence

All three original corpus-f decks are unchanged, including the plot command.
They run with `ngspice -b <original>`. A second batch readout sources the same
original and prints its existing vnode2/r2val at numdgt=17. This changes only
output precision, not the circuit. ngspice emits batch plot warnings, not errors
in the numerical analysis. Readout stdin files are retained. Match n1 by loop
index and r2val (1000 to 100 Ohms in steps of -50).
Relative error is abs(native-reference)/abs(reference), RMS over matched points.

| Deck | Before native | After native / ngspice | Matched n1 | Max relative | RMS relative |
| --- | --- | --- | --- | --- | --- |
| instance-loop.cir | 19 matched, same errors | 19 OP / 19 OP, exits 0 | 19 | 2.0539125955565395e-16 | 6.334367866879865e-17 |
| loop-instance.cir | 19 matched, same errors | 19 OP / 19 OP, exits 0 | 19 | 2.0539125955565395e-16 | 6.334367866879865e-17 |
| loop-model.cir | exit 1, altermod R2 unsupported, 0 matched, null errors | 19 OP / 19 OP, exits 0 | 19 | 2.0539125955565395e-16 | 6.334367866879865e-17 |

minimal.cir previously fails at altermod r1 (0 matched, null errors). After the
fix both branches match 1/3. Its unchanged ngspice print uses default precision,
so the two printed values have max/RMS relative error 1.000000099473654e-7.
This output-rounding loss is retained, not hidden or tolerance-tuned.
No speed claim, internal-quantity claim or general corpus parity claim is made.
Cumulative reference/native child wall including failed runner attempts and the
lookup-order probe is 5.580905500000001s, not a performance comparison.

## Tests and failures

red.log: exit 1, 6 failing / 9 passing tests on base, including identical deck,
resistor and diode aliases. green-final.log: exit 0, 185 tests across 12 files,
including 16 new tests, csparam/setplot/error/restoration controls, lexical model
scope and dynamic caller scope. build.log and lint.log: exit 0.

failed-runner/ retains both first comparison runs: the original adapter tried
to read nonexistent nodes (a/b on originals, n1 on minimal), so those are harness
losses, not simulator evidence. The corrected adapter reads only the deck's
nodes. pre-precedence/ retains the successful intermediate patch receipts.
targets.cir and targets stdout/stderr prove instance-first collision behavior;
ngspice reports a missing target and a missing parameter but continues. spice-ts
retains its existing fail-fast behavior and rejects explicit model-less targets.
An initial new loop test failed by reading a user vector in the wrong plot; it
was corrected to setplot the saved plot, without changing interpreter behavior.

The single guarded full-suite attempt timed out at the terminal's 180s cap
(exit 124). full-test.log is retained, including an example slow-start server
error; no local full-suite success is claimed, and no retry or unrelated fix was
made. Exact-head GitHub test(20), test(22), build and accuracy are authoritative.
PR/card handoff records the final SHA and actual CI results.

## Sources and licences

Originals are existing BSD-3-Clause ngspice examples from immutable revision
3ef069fb1f04177a153f342a32d941fc20ff047e:
https://github.com/ngspice/ngspice/tree/3ef069fb1f04177a153f342a32d941fc20ff047e/examples/loops
Already registered in benchmarks/SOURCES.md and corpus-f/SOURCES.md; those shared
manifests are intentionally untouched. minimal.cir, targets.cir, runner scripts,
tests and receipt prose are original MIT contributions under repository LICENSE.
