# Behavioral capacitor C= support (#1098)

## Semantics and implementation

ngspice-47 tag a80f6e3e95d51534905b1f23410a951802666656, [inpcom.c:6952-6988](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/frontend/inpcom.c#L6952), uses the enabled six-device G/R/C/V/R/B transformation. C= means C(expr)*dV/dt, **not** d(C(expr)*V)/dt. Q= has a separate charge formulation.

The parser uses that derivative probe and existing capacitor/ASRC devices, including native 1e-6 F probe, 1e-9 ohm resistor and 1e15 ohm shunt. It avoids generated-name collisions and preserves subcircuit scope. No transient driver, circuit, device interface, MOS or control-language changes. Unsupported Q=, IC, SCALE, explicit m= and unrecognized parameters fail with structured ParseError. Explicit m= native double-exponent defect is tracked in #1122. The new diagnostic deck is authored under the repository MIT licence. Original corpus provenance/licences are unchanged in benchmarks/SOURCES.md.

## RED / GREEN

Base e85c2d79c8f237ef36a817870929ce17ef75f48f (core tree 3ef1474ca1c9b3ce2122a04bba2ab967abc86ff3): the original four regressions failed before implementation. Both quoted/braced parser tests and the transient test rejected Unknown function V; the unsupported-parameter test lacked the behavioral-capacitor diagnostic.

After: 178 focused tests across 8 files pass, including 14 capacitor tests. Coverage includes independent voltage control, non-ground terminal polarity, local per-instance subcircuit parameters, continuations, reciprocal temperature coefficients, live time, generated-name collisions, ordinary capacitor preservation, unsupported forms and AC.

Commands:

```
pnpm install --frozen-lockfile
pnpm -C packages/core exec vitest run src/parser/behavioral-capacitor-1098.test.ts src/parser/preprocessor.test.ts src/parser/behavioral-expression.test.ts src/parser/parser.test.ts src/parser/passive-lead-value-719.test.ts src/parser/passive-value-less-733.test.ts src/parser/bare-param-rlc-837.test.ts src/parser/parse-preparation-perf.test.ts
node benchmarks/results/issue-1098/native-semantics.mjs
pnpm build
pnpm lint
spice-heavy pnpm test
pnpm exec tsx --test benchmarks/results/issue-1098/receipt.test.ts benchmarks/corpus/corpus-n/corpus-n.test.ts
```

Native ramp diagnostic: 108 points, 70 checked, max absolute analytical current error 2.168404344971009e-19 A. Its independently varying C control distinguishes capacitance and charge semantics.

Frozen install, updated build and lint passed. Wrapped full suite passed: core 4354 passed, 4 expected failures, 8 skipped; all other package suites passed; root benchmark tests 198 passed, 4 skipped, zero failures. Initial CI/full-test attempt exposed an ordinary capacitor continuation text regression; it was fixed without weakening its existing test.

## Original corpus-n n-2 before / after

Before (baseline dist built before edits):

```
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-n/parity.ts --engine spiceTs n-2 n2-before-1098.bin
```

Result unsupported/not-run, no analyses: `Parse error at line 31: Unknown function 'V' C2 6 3 C = 'cn + 0.033 * cn*V(c2)' ; behavioral capacitor`.

After full 24-deck run:

```
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-n/parity.ts
```

Measured core tree 58a5e5b36461875209311cba9c5183c459971bba (code head 4dde8cd9fdf15eec865a0350da209a5ef03e7516). `outcomes.json` here preserves the complete regenerated report. Historical canonical corpus-n outcomes/README are untouched because their tests pin the older integration receipt.

n-2: both engines succeed. Native transient 24866 points; TS original transient 25787 points and linearized transient 24001 points. Unchanged harness returns **not-compared**, 0 compared signals and null normalized error. Null is not zero and success is not matched parity. The plot retention/pairing gap is tracked in #1124; stochastic TRRANDOM also requires an honest seed boundary in follow-up. Cold owned engine-group wall: ngspice 1569.221583 ms, TS 2610.461333 ms. Not solver-only timing; no speed claim.

Full snapshot: 24 ngspice successes; TS 17 successes, 4 failures, 3 unsupported. Outcomes: 3 matched, 5 mismatch, 9 not-compared, 7 spice-ts-loss. Every loss remains published. These full-suite counts are a current-tree snapshot, not a causal before/after claim about unrelated fixtures. In particular n-17 IC and n-5 pre_set remain losses on this isolated branch despite separate sibling fixes.

Input bytes, uniform 1% metric and 119 s engine-group bounds are unchanged. Environment: Apple M5 Pro, darwin 27.0.0 arm64, Node v22.23.1, ngspice-47, spice-ts 0.3.0. Outcome digest: 2faa2e4e51340744ed177cbc6208fd5ce0b60efedb08faa868a8a4234daaa105.

## PR #1123 logical-card review remediation

The rejected head `4ea59790d3cbf6ca6b471758662b907ef7e2dced` classified the
first physical line before folding continuations. Both valid layouts failed:
`Ctest p n C={1u*` followed by `+ (1+v(ctrl))}`, and `Ctest p n` followed by
`+ C={1u*(1+v(ctrl))}`. Classification now uses the complete logical card,
with comments removed per physical line. Folding is speculative: only
behavioral cards replace their original text, so ordinary capacitors and
their continuation/source metadata remain unchanged. Structured rejection
retains the originating card's line and complete logical context.

RED on that old implementation: 7 failed / 15 passed, including both parser
and both transient regressions (`continuations-red.txt`). GREEN: 186/186
across the same 8 focused files, 22 capacitor tests (`continuations-green.txt`).
Additional regressions cover comment/blank interleaving, ordinary physical
cards and structured source locations. No fixture or tolerance changes.

Run `node benchmarks/results/issue-1098/native-continuations.mjs` to regenerate
`native-continuations.json`. Both authored MIT diagnostics use the identical
ramp input as the TS regressions (only native `.control` output commands are
added). ngspice-47 succeeds for both: each has 108 points, 70 checked points,
max absolute analytical current error 2.168404344971009e-19 A. The TS regressions
now pass the existing analytical tolerance. This is scoped correctness
evidence, not a new full-corpus parity or performance claim; the historical
corpus snapshot above is unchanged and was not rerun for this remediation.

Frozen install, `pnpm build`, `pnpm lint`, and `spice-heavy pnpm test` pass.
Core: 4362 passed, 4 expected failures, 8 skipped; all other package suites
pass. Root benchmark tests: 198 passed, 4 skipped, zero failures.

## Original publication receipt

PR https://github.com/mfiumara/spice-ts/pull/1123. Required test (20), test (22), build and accuracy passed on code head 4dde8cd9fdf15eec865a0350da209a5ef03e7516 in https://github.com/mfiumara/spice-ts/actions/runs/38625201857. The documentation/snapshot commit gets a separate exact-head CI check before handoff. Vercel is externally rate-limited, non-required and untouched. Independent review is required; this worker does not merge.
