# #948 mutual reference subset

Poteto route: feature/evidence publication. Decisions are fixed by the card.

Data shape: original Candidate (key, manifest circuit, verified input bytes), canonical reference Row (hashes, projections, native status/warnings, all comparison metrics), subset manifest (selected ids/hashes/analyses and every exclusion), descriptive disagreement buckets.

Plan: verify adapter merge, test deterministic candidate order and reference-only selection, reuse canonical/translation/native helpers, run every licensed original A..J fixture through spice-heavy, render hashes and all errors, audit before/after initial100 outcomes, verify build/lint/full tests/exact-head CI, publish PR and bind independent review.

The expanded adapter runner/receipt is immutable and source-hash checked. The new subset-runner mirrors its execution policy rather than invalidating the accepted receipt. No simulator or aggregate ledger edits. No per-circuit tolerances. No inferred model-equivalence claims.

RED: subset tests first failed on missing implementation. GREEN: three selection/bucket tests passed before native execution. Additional offline receipt checks are wired into the existing reference CI gate through compare.test.ts.
