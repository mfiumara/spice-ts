# Repeated dot-card investigation (#1009)

Evidence only. No simulator, fixture, tolerance or comparison-adapter changes.
The requested parser fix would address the wrong layer. All repeated cards
already parse and execute. The native aggregate result overwrites earlier
results of the same type. Protocol v1 already returns every analysis.

## Reproduce

From the repository root, with ngspice-47, Python 3, Node and pnpm installed:

```sh
pnpm install --frozen-lockfile
spice-heavy python3 benchmarks/repeated-dot-1009/probe.py
spice-heavy pnpm exec tsx benchmarks/repeated-dot-1009/core-probe.mts
```

The first command runs all five unchanged fixtures and one original synthetic
probe, writes ASCII raw files and stdout/stderr under ignored `raw/`, and
asserts one raw plot per card. The second asserts parsing and actual execution,
then records the retained native result and protocol-v1 analysis list.
Scalar receipts are committed. Raw files are a Kanban attachment; their SHA-256
hashes are in `ngspice-semantics.json`. Dates, timings and raw hashes will change
when rerunning. Recorded machine is macOS, ngspice-47, Node v22.23.1.

## Measured ngspice batch behavior

The ASCII raw plot names are descriptive, not unique identifiers. Duplicate
identical cards produce distinct raw sections with the same `Plotname`.
The observed type order for these decks is AC, DC, OP, TRAN, with absent types
omitted. Distinct repeated cards execute in reverse source order within a type,
not source-card order. This is demonstrated without changing any corpus deck
by the interleaved synthetic probe:

- Source order: AC(10..40, 4 points), OP, DC(0..1), AC(30..50, 3 points), OP,
  DC(2..4), OP.
- Raw file order: AC(30..50, 3), AC(10..40, 4), DC(2..4, 3), DC(0..1, 2),
  OP, OP, OP.

| Fixture | Cards retained by core parser | ngspice raw order (point counts) | Exit |
| --- | --- | --- | --- |
| bjt-diffpair-current-source | OP, TRAN, AC, OP, AC | AC(22), AC(22), OP(1), OP(1), TRAN(59) | 0 |
| vcvs-operating-point | OP, OP, OP, AC, AC, AC | AC(1), AC(1), AC(1), OP(1), OP(1), OP(1) | 0 |
| diode-temperature-sweep | OP, DC, DC, OP | DC(3), DC(11), OP(1), OP(1) | 0 |
| mos1-nand-transient | OP, OP, OP, OP, OP, TRAN | OP(1) five times, TRAN(114) | 0 |
| dual-lc-uic-rejection | TRAN, TRAN | TRAN(1011), TRAN(1011) | 0 |

The diode deck's 11-point sweep is the *first* DC source card, not the second.
ngspice writes the 3-point second card first. An adapter must not equate raw
occurrence index with source-card index.

## Measured core behavior and root cause

`Circuit.addAnalysis` appends each directive (`packages/core/src/circuit.ts`,
`addAnalysis`). `solveCompiledAnalyses` loops over every directive
(`packages/core/src/simulate.ts:208`) but assigns the results repeatedly to
`result.dc`, `result.dcSweep`, `result.ac` and `result.transient`.
That is result retention loss, not skipped execution.

The original execution probe contains two distinct DC sweeps and two identical
OP cards. The native call returns both DC `.meas` averages, 1 and 4, and reports
8 accepted DC solves (six sweep points plus two OP cards). Its retained DC
sweep is only [3, 4, 5], the last source card. Protocol v1 returns DC, DC, OP, OP
because its adapter already executes and serializes each directive separately
(`packages/core/src/protocol/adapter.ts:109`). These checks pass on unchanged
core code. No claimed RED/GREEN cycle or plot-pairing improvement.

## Stop condition and remaining scope

The task explicitly requires evidence before code and stopping if semantics
differ from the hypothesis. The evidence contradicts the skipped-run premise
and establishes ngspice ordering that differs from the core's source order.
No simulator fix is shipped and #1009 must remain open.

A revised implementation slice needs an explicit native result-retention
contract, preserving legacy last-per-type fields, plus a decision about whether
execution order itself should change to ngspice batch order. Straight-line
`.control` lowering and its source-order contract must remain distinct. Then
an adapter slice can consume the per-run results with one-to-one identities.
Do not fix this by rerunning already-executed cards or by calling the protocol
adapter merely to hide native result loss. Those approaches change execution
and do not repair the native result contract.

Before/after paired/unmatched counts and normalized mismatch are not measured
in this stop-condition slice. There is no before/after solver change and no
claim that the five #970 losses are fixed.

## Sources and licences

The five unchanged fixtures are from the existing corpus-e and corpus-e-spice3
Gnucap regression collection at `5acb027125d6ea7c546badd03e026d8781c6a400`,
GPL-3.0-or-later, with retained notices and sources in `benchmarks/SOURCES.md`.
The interleaved order probe and core execution probe are original spice-ts
project work under MIT. No new third-party netlists are introduced.

## Validation

- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm build`: exit 0, existing CJS import.meta/browser-bundle warnings.
- `pnpm lint`: exit 0, includes 6 artifact-guard tests.
- `pnpm -C packages/core exec vitest run src/parser/parser.test.ts src/parser/control-analysis.test.ts src/protocol/envelopes.test.ts`:
  exit 0, 77 tests in 3 files.
- Both reproducibility probes: exit 0. Six ngspice batch invocations exit 0.
- `spice-heavy pnpm test`: exit 124 at the 180-second local timeout during
  benchmark tests. This is not a full-suite pass; exact-head CI is authoritative.
- Initial core-probe invocation used `.ts` with top-level await and failed;
  renamed to `.mts`. A second invocation exposed the documented protocol
  titleless-input convention; the synthetic title is now removed only for the
  protocol call. Neither failure required a simulator change.
