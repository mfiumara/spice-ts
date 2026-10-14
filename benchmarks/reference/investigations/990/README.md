# Xyce bare BJT model assignment adapter (#990)

## Change and boundary

The Xyce-only reference adapter converts bare numeric `name value` pairs on
NPN/PNP model cards to explicit assignments. It canonicalises ngspice BJT
aliases, including VA to VAF, without evaluating or changing literal values.
This is a general syntax rule, not an RCA3040-specific replacement. It handles
continuations, comma/parenthesis separators, signs, scientific notation and
SPICE suffixes. Explicit assignments and non-BJT records are preserved. Bare
symbol/expression values fail closed as unsupported instead of guessing their
cross-engine meaning. Model inline comments are retained as comment lines when
a model is rewritten. The change list records each assignment conversion.

No simulator/core source, ngspice input, headline comparison, tolerance,
aggregate ledger, or PR993-owned file changes. This is a second-reference parse
fix, not a speed improvement or simulator superiority claim.

## Native before/after evidence

`run.ts` verifies the historical shared AC and Xyce export hashes before running
ngspice 47 and Xyce 7.10.0. The before column executes the saved pre-fix Xyce
export deck directly. The after column executes today's adapter output. Both
compare against the same unmodified ngspice-47 run. The exported signal list is
six fixed nodes, not selected by the observed errors. All native grids contain
101 points; the unchanged harness aligns 100 and excludes one out-of-range
floating-point endpoint. Its relative error denominator is Xyce (the second
series), with its original zero-reference policy. Full complex samples, native
outputs/warnings, commands and all absolute/relative metrics are in `report.json`.

Machine: Apple M5 Pro, darwin arm64, Node v22.23.1. The receipt records the
base Git head and the SHA-256 of the modified adapter actually executed, rather
than pretending the uncommitted change was already part of that Git head.

| Signal | Before max abs V | After max abs V | Before RMS V | After RMS V |
|---|---:|---:|---:|---:|
| v(8) | 8.00015550075e-4 | 8.51682577963e-7 | 7.20279546153e-4 | 1.80508561902e-7 |
| v(9) | 1.16180573712e-3 | 9.78634524923e-7 | 1.05421912756e-3 | 2.07293884582e-7 |
| v(14) | 1.77294243627 | 0.00262028464509 | 1.38640454172 | 0.00222167664468 |
| v(15) | 1.77109905769 | 0.00262030045235 | 1.38487658000 | 0.00222161944529 |
| v(10) | 0.0605931897755 | 1.49140788155e-5 | 0.0523038683659 | 3.56894382869e-6 |
| v(11) | 0.0605841608203 | 1.48710809928e-5 | 0.0522966767661 | 3.55355846581e-6 |

The parse discrepancy is removed. Perfect parity is not claimed: the remaining
nonzero reference-model residual remains published. The existing [#975
investigation](../975/README.md) attributes the matched-OP conductance difference
to historical k/q constants and documents native VAF=0 versus VAF=50. The new
adapter result reproduces that investigation's explicit-assignment diagnostic.
No new full-corpus eligibility/count claim is made.

## Provenance and immutable historical receipts

The existing classic RCA3040 source and licence are recorded in
`benchmarks/SOURCES.md`. No new upstream material is imported.

- Shared original AC SHA-256: `52c10c8ef864808b39f2df52898fbdf6bde0eebe78d812a6cbb8f6f4513e107a`.
- Before Xyce deck SHA-256: `292b5cbf679a8462205e83625a19358be318d7b0dbae68a53499180a0dd3b6b1`.
- After Xyce deck SHA-256: `897138ced8226ed4cfe3830919401f165b93240a12039deaecd553147b640866`.

The #948 and #975 historical reports/decks/outputs remain byte-identical.
Their source hash for `xyce.ts` is still
`693517918cf1e5dadf653123e900bbeeb98a4d9a7e7bb23b9e895913166d0023`.
That original adapter is available at
[f89aed9b/benchmarks/reference/xyce.ts](https://github.com/mfiumara/spice-ts/blob/f89aed9be3b8f3e56d7cbe18f708661bc6d099c1/benchmarks/reference/xyce.ts).
Historical receipt tests now pin that historical hash rather than assert that
old measurements came from the changed adapter. Every existing deck/output hash
check stays active. The new receipt separately checks today's adapter hash and
exact translated output, and recomputes both columns from native samples.

## Reproduce from repository root, headless

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
export XYCE_BIN="$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce"
spice-heavy pnpm exec tsx benchmarks/reference/investigations/990/run.ts
spice-heavy pnpm exec tsx --test benchmarks/reference/xyce.test.ts
pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts benchmarks/reference/investigations/975/receipt.test.ts
```

Use an existing Xyce 7.10.0 binary at XYCE_BIN; the scripts do not install one.

RED: `pnpm exec tsx --test --test-name-pattern='BJT' benchmarks/reference/xyce.test.ts`
failed both new scalar rewrite cases on the original adapter (0 pass, 2 fail).
GREEN: the focused offline command above passes 25 tests, skips 8 live tests,
and fails none; its nested canonical Vitest invocation also passes. The guarded
live adapter command passes all 18 tests with no skips. `pnpm build && pnpm lint`
passes, including 6 artifact-guard tests. A mistaken initial invocation of the
Vitest-global canonical file with node:test failed; its supported Vitest entry
is run successfully by compare.test.ts. The first guarded native command timed
out waiting for a heavy slot after 120 seconds; a queued retry completed.

No root monorepo suite or corpus batch is run on this card, per its targeted-test
scope. Required exact-head GitHub test (20), test (22), build and accuracy checks
are the final authoritative gate and are recorded in the Kanban handoff and PR.
