# Loading-time `pre_set` regression and corpus-n evidence (#1097)

Implementation: PR #1118. Follow-up comparison gap: [#1121](https://github.com/mfiumara/spice-ts/issues/1121).

## Source semantics and supported boundary

Checked the ngspice-47 release source from
https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz.
`src/frontend/inp.c:786-858` strips `pre_`, separates those commands from the ordinary
control script, reverses the collected list into source order, and executes it
before circuit setup. Consequently `pre_set` is not a runtime alias for `set`:
it is hoisted even out of an ordinary `if` block and takes effect before earlier
ordinary commands. A native probe prints `7 1` then `9`, exactly as the unit test.

This implementation accepts an explicit presentation-variable allowlist and
`strict_errorhandling`; unknown loading, compatibility or solver settings fail
with `UnsupportedControlCommandError` before device parsing. Values use the
existing `set` quoted/list assignment syntax. Substituted assignments are checked
again so they cannot inject an unsupported loading option. No state leaks into
other decks. Other `pre_` commands are not implemented.

For `strict_errorhandling`, ngspice-47 `src/frontend/options.c:329-335` enables
fatal frontend/source errors and exits for a prior spinit error. spice-ts has no
spinit or process-exit API; fatal input errors already throw to its caller. The
flag preserves that fail-fast behavior. It does not turn model warnings into
fatal errors (`src/frontend/inp.c:1486-1508`) and does not promise interactive
ngspice error-recovery semantics. Ordinary runtime `set` policy is unchanged.

## RED / GREEN

Base: `e85c2d79`. The original nine-test regression failed 8 tests and passed 1
before implementation. After implementation and two additional guards, all 11
regression tests pass. The wider selection passes 325 tests in 16 files:

```
pnpm install --frozen-lockfile
pnpm -C packages/core exec vitest run src/parser/control/pre-set.test.ts
pnpm -C packages/core exec vitest run src/parser/control src/parser/control-analysis.test.ts src/parser/options-directives.test.ts
pnpm build && pnpm lint
spice-heavy pnpm test
```

## Corpus rerun: execution success is not waveform parity

```
pnpm build
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-n/parity.ts
```

The unmodified 24-fixture harness completed successfully on ngspice-47, using
core tree `0af9fe306e4b6673de13758a4c28c1dc77ab80e6` (source commit
`6cade9393af2a3e86c5aa5555ce1331338095e5c`). Full machine/tool/policy metadata,
all losses, grids and per-signal metrics are in `corpus-n-outcomes.json.gz`:
this is the exact regenerated `corpus-n/outcomes.json`, compressed, not a
hand-edited subset. Its embedded outcome digest is
`0ed6a1824cae64aa84fee28f1c07220840b735b108ba412e04f5d4c5b4da129c`.
The shared corpus baseline files are deliberately preserved: their pinned
integration snapshots are not rewritten by this narrow parser PR.

| n-5 adder_mos | Before (committed corpus baseline) | After this fix |
|---|---|---|
| ngspice | success, tran:1827 | success, tran:1827 |
| spice-ts | unsupported `pre_set` at line 67 | success, tran:1827 |
| compared signals / aligned points | 0 / 0 | 0 / 0 |
| matched / mismatched signals | 0 / 0 (unmeasured) | 0 / 0 (unmeasured) |
| outcome | spice-ts-loss | not-compared |
| max/RMS waveform error | null | null |

The unchanged comparator leaves native `Transient Analysis` index 0 and TS
`tran1` unmatched, despite both successful 1827-point runs. Native exports 14
signals and TS 90; common signals were not paired. This is **not** a parity win
and does not establish BSIM3 accuracy. #1121 requests a real comparison after the
generic plot-pairing work (#1106 / PR #1115); no comparator or device change is
included here.

n-5 cold owned-child wall times were 1342.925333 ms native and 17620.063833 ms
TS under shared-host load (startup, adapter, parse/solve/export, not solver-only).
Baseline times were 5496.131417 ms native and 4027.100500 ms TS **for an unsupported
TS parse**, so they are not comparable execution timings. No speed claim.

Whole-corpus baseline: 2 matched, 5 mismatch, 2 not-compared, 15 spice-ts-loss.
Rerun: 4 matched, 5 mismatch, 9 not-compared, 6 spice-ts-loss. All 24 native runs
succeed; TS has 18 success, 3 unsupported, 3 failed. Only n-5's execution delta is
attributable to this parser fix. n-6..n-13 changes reflect VDMOS fixes already on
the source base since the older committed baseline; they are not this PR's wins.
No netlist, fixture, tolerance, solver or benchmark-harness change was made.
