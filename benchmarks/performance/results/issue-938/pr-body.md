## What and why

Diagnosis-only follow-up to #932. Uses unchanged-bundle V8 line sampling, not per-call solver timers, to distinguish checked row work from dense-range execution. All changes stay in `benchmarks/performance/results/issue-938/`; production is unchanged and no candidate or speedup is claimed.

Fixes #938 by delivering the permitted no-candidate evidence slice. Remaining timing/observability work is explicitly reported to the supervisor.

## Evidence and limitations

- Immutable baseline `a58cfe6c2edb7ac5a408a07f77575b0c181b226f`, all core source hashes identical to control.
- Fixed 72-child matrix, 71 exit0 and one CMOS50k baseline warm timeout. 18 raw V8 profiles retained. No recovery remeasurement.
- Dense versus checked mesh50k ticks are cold `19/15/62` versus `3/2/13`, warm `19/19/195` versus `5/4/37`. Counts are not native self-time or ms; checked mixes activation and arithmetic.
- Probe calibration and reproducibility FAIL. Seven Node/Python clock disagreements mean charged monotonic wall `294.1393443360139s` is NOT certified actual elapsed wall. Completed phase wall totals alone are `5758.755780915002s`. The 45s deadline/900s actual elapsed budget cannot be certified; all raw outliers and timeouts are published, not filtered.
- 18 paired full factor/solution phases and 53 paired full simulation phases have identical complete hashes/counts/permutations/convergence. The missing warm phase is not imputed.
- Full medians/ranges/RSS, apparent losses, process ownership/cleanup, source hashes, profiles and commands are in README/summary/raw journals. Historical ngspice references remain HISTORICAL; no fresh parity claim.
- Next investigation must establish suspend-safe elapsed accounting and reproducible controls before choosing an arithmetic-order-preserving dense-range candidate. No speculative production rewrite.

## How to test

All following local commands exit0. Offline tooling has missing-module RED then four GREEN corruption/censoring checks, not candidate mutation tests.

```
python3 benchmarks/performance/results/issue-938/test_summary.py
python3 benchmarks/performance/results/issue-938/summarize.py
pnpm build
pnpm lint
pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts src/solver/gilbert-peierls-u-alias-926.test.ts src/solver/gilbert-peierls-equivalence.test.ts src/solver/gilbert-peierls-reuse.test.ts
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
```

52 focused solver tests, six fixture tests pass. Local full-suite rerun is prohibited by supervisor recovery instruction; exact-head required test20/test22/build/accuracy CI is authoritative. Do not rerun the archived measurement runner to certify elapsed bounds. Independent `spice-ts-review` must review exact head; supervisor alone merges. No release/npm/versions/tags/deploy changes.
