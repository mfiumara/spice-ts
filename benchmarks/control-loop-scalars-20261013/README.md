# #930 boundary diagnosis (implementation blocked)

Frozen base: 541cb5f34dd1dd89074df9f9f737e4eb6aff110c (merged #925).
/poteto-mode activated from the installed pstack SKILL.md and bug-fix playbook.

## Reproduce

```
pnpm install --frozen-lockfile
pnpm -C packages/core exec vitest run src/parser/control/csparam-loop-930.test.ts
spice-heavy python3 benchmarks/control-loop-scalars-20261013/probe.py
```

Node v22.23.1, macOS 27.0.1 arm64, Homebrew ngspice-47 with KLU.
The probe uses sequential process groups, a 12-second per-child cap and a
600-second cumulative actual-child-wall budget. diagnosis.json records commands,
hashes, exits and actual timings. Logs are the unmodified engine outputs.

RED: 2 tests, 1 failing and 1 passing, Vitest exit 1 (red.log).
The minimal identical MIT deck prints `bounds 1000 100 -50` in ngspice and
fails with `no such vector 'end' in plot 'unknown1'` in spice-ts. Replacing
.csparam cards by let commands in the const plot already succeeds in spice-ts.
Thus this is not loss of existing interpreter constants across setplot.

All three unchanged BSD-3-Clause originals freshly complete in ngspice-47
(exit 0, 19 one-row OP analyses each), but fail in native spice-ts (exit 1).
All three are still losses. Matched points are zero and max/RMS errors are null;
no parity or performance improvement is claimed. The original output-only plot
command warns in ngspice batch mode. No fixture bytes were modified.
Source/license identities are already recorded in benchmarks/SOURCES.md and
benchmarks/corpus/corpus-f/SOURCES.md at ngspice source revision
3ef069fb1f04177a153f342a32d941fc20ff047e. No shared source manifests were edited.

## Root cause and blocked seam

packages/core/src/parser/preprocessor.ts lines 129-135 evaluates .csparam solely
for validation, discarding the return value. PreprocessedDeck has no control
constant payload. parser/index.ts lines 83-89 and 99-103 pass only parameters,
blocks and warnings onward. The interpreter only receives ControlScript with
statements and correctly resolves current-plot then const vectors.

A general fix must retain the preprocessor's already-evaluated .csparam values
and pass them into the control script's const plot. Re-parsing the raw cards
inside control/source.ts would bypass include resolution, branch selection,
numparam function handling and proper source diagnostics, so is not a safe
in-scope substitute.

The card explicitly excludes preprocessor.ts and index.ts. No production code
was changed. Scope expansion/coordination with the #924 preprocessor owner is
required before implementing and obtaining GREEN, exact-head CI, PR and review.
Issue #930 remains open. The reproduction test deliberately remains RED in this
isolated worktree; no PR has been published.
