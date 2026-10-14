# Literal nested DC coordinates (#1008)

This is a saved-sample replay, not a simulator accuracy or speed improvement. Both columns use the same `afterEngine` and `afterReference` samples from #970. Only reference secondary-coordinate metadata changes. No core code, decks, thresholds, reset-ordinal policy, historical #970 receipts or aggregate parity report change.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
pnpm exec tsx --test benchmarks/plot-alignment.test.ts benchmarks/comparison-harness.test.ts benchmarks/literal-dc-1008/adapters.test.ts
spice-heavy pnpm exec tsx benchmarks/literal-dc-1008/replay.ts --check
spice-heavy pnpm test
```

`raw/*.v8.gz` are byte-identical copies of the eight saved #970 receipts from the remediation worktree (`t_bf6b6077`), not new simulations. `results.json` records each raw receipt SHA-256, fixture SHA-256, provenance diagnostics and full after-comparison metrics. The original inventory fixes their index/key mapping. Replay checks the unchanged fixture bytes against the saved input hashes, compares both columns with the current strict harness, and checks exactly eight unique fixtures. Use Node 22 or newer to read the V8 serialization.

Sources and licences are already recorded in [SOURCES.md](../SOURCES.md) and the ngspice/corpus-f/corpus-g/corpus-h manifests. No new upstream decks were imported. The adapter smoke-test circuit is project-authored (MIT) and exercises two independent sources and two resistors with the same input bytes in object, packed and control reference paths.

## Scope and remaining losses

A literal nested `.dc` is accepted only when its declaration uniquely identifies the plot. Straight-line literal control `dc` retains numbered command selection; a descriptive raw plot label requires one DC declaration. Repeated dot cards and mixed dot/control declarations remain unknown. All sweep bounds must be numeric literals. The existing ngspice-47 `dctrcurv` outer increment and absolute `DBL_EPSILON * 1e3` endpoint semantics are unchanged.

Dynamic scripts still return undefined. In particular, the two VDMOS decks and the WRspice JFET2 deck contain `run` in `.control`; their losses remain visible rather than guessing the relationship between a retained plot and a dot card. No interpreter or exception for these decks was added.

The RED command was `pnpm exec tsx --test benchmarks/plot-alignment.test.ts`: 31 passed, 1 failed with `undefined` for a nested dot-card declaration. The original expected floating-point literal was subsequently corrected to match the existing suffix parser's `700 * 1e-3` conversion. No production numeric semantics changed for that correction.

## Measured replay

See `results.json` for the complete eight-row before/after receipt. A null normalized mismatch means no aligned signal was available, not zero error. Matched/unmatched classifications use the existing corpus normalization and match policy.

| Fixture | Aligned before → after | Normalized mismatch before → after | Unmatched groups before → after | After matched |
| --- | ---: | ---: | ---: | --- |
| ngspice/vbic-fo | 0 → 707 | null → 0.00032168127636619185 | 14 → 0 | yes |
| corpus-f/examples-vdmos-vdmos-out-ir-mtr-sp | 0 → 0 | null → null | 10 → 10 | no |
| corpus-f/examples-vdmos-vdmosp-out-sp | 0 → 0 | null → null | 12 → 12 | no |
| corpus-f/tests-mesa-mesa11-cir | 1 → 1 | 0 → 0 | 8 → 8 | no |
| corpus-f/tests-mesa-mesa21-cir | 0 → 405 | null → 9.24261360409458e-16 | 10 → 0 | yes |
| corpus-g/nmesfet-nmesfet-cir | 0 → 72 | null → 8.523725735549254e-8 | 4 → 0 | yes |
| corpus-g/nmos3-dc-mos3-dc-cir | 0 → 2404 | null → 1.2593239592837579e-15 | 8 → 0 | yes |
| corpus-h/xictools-wrspice-devlib-jfet2-docs-id-cir | 0 → 0 | null → null | 10 → 10 | no |

The hypothesis is confirmed for all eight receipts. The spice-ts DC plot has secondary metadata, the reference plot has none, the primary samples are not exactly equal, and baseline alignment is reset-ordinal. Four fixtures regain coverage. Four remain losses.

MESA11 now has reference metadata but still fails the unchanged exact secondary-value identity rule. The engine's outer coordinates are `[-1.2000000000000002, -0.8000000000000002, -0.40000000000000013, -1.1102230246251565e-16]`; literal declaration accumulation yields `[-1.2, -0.7999999999999999, -0.3999999999999999, 1.1102230246251565e-16]`. None are bit-identical. Its single aligned point belongs to OP, not DC; a normalized mismatch of zero does not make this fixture matched. Changing identity policy or core accumulation is outside this card.

Local verification passed with Node v22.23.1. `pnpm build`, `pnpm lint`, `spice-heavy pnpm test`, the replay generation and replay `--check` exited 0. The targeted adapter/alignment/harness command passed 100 tests. The full suite passed with core 4049 passed / 2 skipped, plus the other workspace suites and benchmark tests (final benchmark TAP 180 passed / 4 skipped).
