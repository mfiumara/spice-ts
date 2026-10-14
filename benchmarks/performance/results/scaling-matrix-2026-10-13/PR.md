## What and why

Fixes #958.

Publish one current-main M2 scaling matrix against ngspice-47 KLU with unchanged, byte-identical RC ladder, resistor mesh and CMOS inverter chain decks at 1k/10k/50k. Reuse #951 native continuous-clock controls with the authorized 120-second child and 900-second total limits. Include every engine cell, host load before/after each child, raw compressed output/acct receipts, deck/output hashes, provenance and the selected profile.

All 18 engine/deck children completed. With the selected profile, the plan took 90.987323 continuous seconds. No timeout, circuit failure or clock disagreement occurred. The longest child took 58.215365 seconds. All owned groups were reaped.

The largest observed cold-process wall loss is RC1k, 133.709 versus 51.680 ms (2.587x), rather than CMOS50k. Profile attribution is mixed between parse/compile, device load, GC and runtime, with visible inspector overhead. RC transient Newton iterations match at 238. There is no defensible core optimization from this short single sample, so this PR takes the card's permitted attribution/follow-up route. Follow-up https://github.com/mfiumara/spice-ts/issues/960 is filed and verified open.

No packages/core, parser/device semantics, CI, aggregate report or SOURCES.md changes. No per-circuit tuning. The CMOS probe gap is retained, max 3.937111e-4 V, max peak-relative 1.124718e-3. Single observed shorter CMOS wall times are not a correctness-backed superiority claim.

## Matrix

Parent-observed cold-process milliseconds including output handling and 10 ms polling quantization. One sample per cell, not a statistical comparison.

| Circuit | Requested nodes | spice-ts ms | ngspice ms | spice/ng | Status |
|---|---:|---:|---:|---:|---|
| RC ladder | 1k | 133.709 | 51.680 | 2.587 | both ok |
| Mesh | 1k | 91.946 | 51.304 | 1.792 | both ok |
| CMOS | 1k | 329.839 | 262.094 | 1.258 | both ok |
| RC ladder | 10k | 373.716 | 186.383 | 2.005 | both ok |
| Mesh | 10k | 268.071 | 153.136 | 1.751 | both ok |
| CMOS | 10k | 2347.867 | 3638.274 | 0.645 | both ok |
| RC ladder | 50k | 1313.992 | 1020.217 | 1.288 | both ok |
| Mesh | 50k | 981.927 | 736.731 | 1.333 | both ok |
| CMOS | 50k | 19402.218 | 58215.365 | 0.333 | both ok |

## How to test

From repository root, review offline without rerunning timing children.

    node benchmarks/performance/results/scaling-matrix-2026-10-13/prepare.mjs
    python3 -m unittest discover -s benchmarks/performance/results/scaling-matrix-2026-10-13 -p 'test_*.py' -v
    python3 benchmarks/performance/results/scaling-matrix-2026-10-13/summarize.py
    python3 benchmarks/performance/results/scaling-matrix-2026-10-13/verify_hashes.py
    python3 -m unittest discover -s benchmarks/performance/results/elapsed-controls-951 -p 'test_*.py' -v
    pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
    pnpm -C packages/core exec vitest run src/convergence-telemetry.test.ts src/solver/gilbert-peierls-reuse.test.ts
    pnpm build
    pnpm lint
    spice-heavy pnpm test

## Evidence

benchmarks/performance/results/scaling-matrix-2026-10-13/README.md documents commands, machine, Homebrew ngspice provenance, deck hashes, clocks, output differences, phase attribution, accuracy metrics and limitations. Local build/lint, 14 new offline checks, 22 unchanged #951 checks, six fixture checks, ten targeted core tests and the guarded full monorepo suite passed. The full suite reports 3,590 core tests passed with two skipped, and 144 root benchmark tests passed with four skipped. All logs and exact output hashes are included.

The selected sampled control preserves its baseline full-array output SHA256. The publication head's required CI and independent spice-ts-review acceptance will be recorded on Kanban. Supervisor only merges; this PR is not a release and publishes no package.
