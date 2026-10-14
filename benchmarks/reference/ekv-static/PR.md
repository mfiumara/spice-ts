## What / why

Fixes #4. Implement real nominal-temperature EKV2.6 static DC for NMOS/PMOS LEVEL=260, using the owner-approved Xyce 7.10 second reference (#948, PR #953). Remove the silent MOS1 dispatch for this exact level. No aliases are registered by Xyce 7.10.

Independent MIT TypeScript implementation from public EPFL equations. Includes weak/moderate/strong inversion, body/charge-sharing effects, RSCE, THETA/E0 mobility, velocity saturation and CLM. Three-variable analytic forward-mode derivatives are checked against finite differences. No GPL device code is copied or redistributed.

Unknown parameters throw structured named errors; deferred parameters and intrinsic/junction charge, AC/NQS, noise and impact-ionization ceilings emit warnings. TEMP != TNOM is rejected. Scope is static DC, not full EKV/transient parity. M4 follow-ups #962 and #963 retain the remaining model work and loss buckets.

## Evidence

Both spice-ts and Xyce receive identical deck bytes, including output adaptations. The existing 3 published hash-pinned decks and corpus-g inverter path are retained; the corpus-g path is the same third circuit, not a fourth novel circuit. Baseline is main ead0642d (MOS1 fallback). Full waveforms, warnings, tool versions, production file digests and per-sweep metrics are in `benchmarks/reference/ekv-static/`.

| Fixture/signal | Before max abs | Before RMS abs | After max abs | After RMS abs |
| --- | ---: | ---: | ---: | ---: |
| NMOS i(vdmon), A | 0.00229454302 | 0.000804740361 | 3.41455894e-10 | 2.92876957e-10 |
| PMOS i(vdmon), A | 0.00596812271 | 0.00251432532 | 2.59071537e-10 | 1.42621710e-10 |
| Inverter v(1), V | 2.10188451 | 0.631576564 | 0.00943929264 | 0.00135369550 |

`metrics.md` publishes all max/RMS absolute + relative errors for every signal and all six ascending/descending DC sweeps. Residual losses are not hidden: NMOS max relative remains 100% at five zero-VDS reference points around 1 fA; inverter supply-current max relative is 30.6%; input alignment max relative is 2.90 near zero. No denominator-floor tuning.

Expected corpus-g divergence from ngspice-47 is explicitly labelled `ngspice-lacks-model (MOS1 fallback)`: output max 2.10228131 V / RMS 0.632253918 V. Against the real Xyce EKV reference, corpus-g improves to the inverter errors above. Historical aggregate reports remain untouched. Single-run wall times are receipts, not a speed claim.

## How to test

- `pnpm install --frozen-lockfile`
- `pnpm build && pnpm lint`
- `pnpm -C packages/core exec vitest run src/devices/ekv.test.ts src/parser/model-level-limit-747.test.ts src/devices/mosfet-body-effect.test.ts`
- `pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts benchmarks/reference/ekv-static/evidence.test.ts`
- `spice-heavy pnpm test`
- With Xyce 7.10 / ngspice-47: `XYCE_BIN=/path/to/Xyce spice-heavy pnpm exec tsx benchmarks/reference/ekv-static/compare.ts --output /path/to/new-receipt.json`
- `python3 benchmarks/reference/ekv-static/summarize.py`

All final local gates exit 0. Core full suite passed 279 files / 3603 tests (2 skipped); targeted tests 39/39. Initial RED dispatch/error reproduction and initial stale supportedLevels failures remain in receipts. CI includes offline evidence checks. Required exact-head CI and independent review will be recorded in the Kanban handoff; this PR is not self-merged.

## Coordination / boundary

hotspot: circuit.ts and parser/model-parser.ts require LEVEL dispatch changes only; no X-call scanning changes. SOURCES.md is additive. npm/tags/releases/Changesets/#679 are untouched.
