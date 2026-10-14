Reference-only cross-check for #948 / #973 exposes an AC reference disagreement on classic/rca3040-wideband-amplifier. This suggests a compact-model/AC-linearization or reference-semantics investigation before treating an apparent spice-ts parity residual as a simulator defect. It is not proof that either reference or spice-ts is wrong, or that their models are equivalent/inequivalent.

Measured ngspice47 vs Xyce7.10.0 on the identical canonical AC projection in benchmarks/reference/mutual-948/report.json:
- v(9): max absolute0.001161805737116448 V, max relative437595.61817558727.
- v(8): max absolute0.0008000155500750313 V, max relative346933.28718035185.
- Relative maxima are amplified by near-zero Xyce responses. Per-signal max/RMS absolute/relative and zero-denominator counts are retained. Do not interpret relative maxima alone as a parity threshold or model evidence.

Both references produce numeric output without ignored/unsupported semantic marks. Source/canonical/projection hashes and native logs are retained in the separate report; no aggregate ledger/scoring edits or tolerance tuning.

Historical context only: #385 and #593 are closed. The existing aggregate receipt (not regenerated) reports spice-ts-vs-ngspice AC v(9) max absolute0.001161805742382074 V. Similar residual scale is a lead, not a direct three-engine comparison: the existing ledger uses original decks and a different execution policy.

Follow-up: reproduce the saved canonical AC input in all three engines, isolate BJT operating-point/model-default versus AC-stamping behavior, validate physically material outputs, and add a failing core regression only if a spice-ts defect is proven. Keep ngspice/Xyce outputs separate and do not pick whichever reference matches spice-ts. This report itself does not implement a simulator fix.

Reproduction: XYCE_BIN=<pinned Xyce7.10 serial executable> spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --output-dir benchmarks/reference/subset-rerun
