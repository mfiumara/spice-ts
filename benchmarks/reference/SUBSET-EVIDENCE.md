# #948 mutual reference report evidence

Result: first100 mutually accepted fixtures selected deterministically from661 original licensed A..J fixtures.124 total reference-eligible rows exist; the remaining24 eligible rows are explicitly excluded only because the target was reached, not because they disagree. All661 attempted rows and all537 unsupported/lossy/native-failure rows remain in the report. No spice-ts outcomes were used for selection.

Initial aggregate100 receipt before/after:26 comparable,54 unsupported,9 transformed-with-loss,11 native-failure. Status, eligibility and every eligible/partial metric are exactly unchanged. Expansion to100 selected fixtures is added coverage, not a parity or performance improvement.

Whole-run native statuses: ngspice453 success/208 failed; Xyce134 success/189 failed/338 unsupported. Whole-run eligibility:124 comparable/337 unsupported/163 native-failure/37 transformed-with-loss. Selection exclusion reasons:337 unsupported/163 native-failure/37 transformed-with-loss/24 target-already-reached.

Inherited adapter-label nuance: `corpus-f/examples-various-todo-temper-3-cir`
is in the `native-failure` eligibility bucket, but its actual Xyce receipt is
`unsupported`, `failureKind=translation`, `Unsupported DC sweep source`.
No Xyce native execution or convergence failure is asserted for this fixture.
The typed cause is retained in its projection in report.json; the legacy
eligibility label is an attempt-pipeline bucket, not a convergence classifier.
This explains338 Xyce unsupported statuses versus337 plan-unsupported labels.

Selected100 descriptive disagreement buckets:29 all-absolute-at-most1e-9;12 relative-at-most1e-3;58 relative-above1e-3;1 absolute-only disagreement. These are uniform descriptive buckets, not simulator scores or model-equivalence claims. Individual signal units and near-zero denominators matter; all max/RMS absolute/relative values and sample exclusions are retained.

Native commands:
- `XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce spice-heavy pnpm exec tsx benchmarks/reference/subset.ts` initially exited1 after632 saved rows, on V8 string-size RangeError while hashing a large diagnostic export.
- `XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --resume` exited0 and completed all661 rows.
- Interrupted632 receipt is retained as `interrupted-632-report.json.gz`. The resumed report preserves the first632 objects byte-semantically and records two execution segments with original/current source hashes, versions and environments. Native adapter policy and all manifest hashes were unchanged; the fix streams SHA256 over identical JSON bytes in4096-sample chunks, not downsampling.

Verification:
- frozen-lockfile install, build, lint and focused TypeScript noEmit check PASS.
- First three subset tests RED before implementation, GREEN after. Native RangeError is a real reproduced receipt bug; bounded-hash RED test then GREEN verifies equality with direct JSON hashing across chunk boundaries and empty series.
- Offline gate validates every original/canonical/shared/Xyce input/output hash, every selected id, counts, all632 resumed rows, execution provenance and unchanged initial100 outcomes. It is imported by compare.test.ts and runs in the existing required build CI check.
- Live reference tests PASS24/24 with Xyce enabled. Offline PASS16 with8 live skips,0 failures.
- `spice-heavy pnpm test` PASS before receipt repair (core3590 pass/2 skip;root144 pass/4 skip). Final rerun also exited0 and is separately logged in subset-final-full-tests.log.
- `git diff --check` PASS.661 Markdown fixture rows verified. No aggregate ledger, core simulator, npm, tags/releases or release PR edits.

Report SHA256: e6f0b90767b955f4309e6e167ac4c7777d74885f2b4908829174ce9af333bcc1.

Scoped report issue: #973 (Fixes in PR); umbrella #948 remains open.
Reference-disagreement investigations: #974 (nonlinear transient), #975 (RCA3040 AC). These are leads for three-engine triage, not asserted simulator defects. Historical aggregate receipts are context only and were neither regenerated nor used for selection.
