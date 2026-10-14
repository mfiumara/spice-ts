## What and why

Refs #978. This is the card's explicitly requested ownership-stop receipt, not a fix for #978. Do not close the issue.

Measured the built core entry with 15 rotating cold control / CPU-profile / module-initialization runs. Uninstrumented import median 31.227 ms, IQR 4.704 ms. The largest measured source initialization is parser/tokenizer.ts at 0.818 ms, IQR 0.118 ms, due to eager decimal POW10 construction. The card prohibits editing parser/** and directs this lane to stop and publish evidence.

V8 bundled compilation is much larger (sampled median 26.917 ms, IQR 5.061 ms), but cannot honestly be attributed to individual source files by this bundle profile. Parser initialization does not dominate total import time. No optimization, before/after reduction, or numerical change is claimed.

All additions live in benchmarks/performance/results/cold-import-978/. No simulator source/build config/parser/model edits. The supervisor can route parser initialization or a separate measured bundling experiment.

## How to test

- pnpm install --frozen-lockfile
- pnpm build && pnpm lint
- pnpm -C packages/core exec vitest run src/parser/tokenizer.test.ts src/parser/inpevaluate-749.test.ts src/parser/parser.test.ts
- node --test benchmarks/performance/results/cold-import-978/profile.test.mjs
- python3 benchmarks/performance/results/cold-import-978/verify.py
- See README.md for guarded live reproduction using the pinned #960 harness archive. Run all cold workloads via spice-heavy.

## Evidence

- Build/lint exit 0. Targeted vitest 191 passed. New offline profile checks 4 passed. Offline native-raw/hash/probe verification exit 0.
- 15-round RC1k baseline via spice-heavy, 45 top-level + 15 native workloads, all successful/certified.
- spice-ts cold wall median 132.417 ms, IQR 14.529 ms. ngspice-47 native wall median 34.927 ms, IQR 2.748 ms. Remaining loss is 3.79x. Native wall plus external hashing median 42.406 ms.
- All 30 spice-ts full-output hashes unchanged from #960, 6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7. All 15 native raw hashes independently verified. Native and spice-ts hashes are not bit-identical.
- Diagnostic host load 7.634–7.903; RC1k baseline load 6.248–6.468. Different runs are not presented as a speedup.
- Raw profiles, all 165 module distributions, all baseline receipts/native raw outputs, host data and command/failure logs retained. No samples dropped.
- #966 remains OPEN; its exact 405e9dc6 harness source is archived here for reproducibility, not merged. Two original fixed-archive tests require that PR's separate old archive; 8 harness unit cases passed. All attempts are documented.
- Local full suite not launched for this evidence-only slice; exact-head required CI is the full gate. No merge or release publication.
