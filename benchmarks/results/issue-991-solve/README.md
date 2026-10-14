# #991 solve-path receipt: watched-node delta candidate rejected

Refs #991. No simulator optimisation ships. The cold-wall gate was missed on both 10k decks, so the two-line candidate was reverted. The issue remains open. No parser, import/bundling, MOS3 or circuit temperature edits. This is not a superiority claim.

## Fresh profile

Baseline current main `d39157cd467ddd63ce501334b330609e7ee0a644`. One fresh cold V8 `--cpu-prof` run per circuit and requested size (1k/10k/50k), all under `spice-heavy`. Profiles and full receipt hashes are retained in `profile/`. `summary.json` lists the top 30 frames with weighted self % per profile; raw profiles retain every frame. Percent denominator is sum of sampled time deltas across the entire process, not parent wall. Single samples are diagnostic, not a statistical speed claim, and can include JIT work charged to application frames.

10k self-time leaders:

| Frame | RC10k self % | Mesh10k self % |
|---|---:|---:|
| attemptStep | 9.31 | not a transient deck |
| buildCompanionSystem | 9.22 | not a transient deck |
| GC (unattributed) | 7.23 | 17.87 |
| ESM compileSourceTextModule (excluded import) | 4.06 | 6.70 |
| acceptAll | 3.27 | not a transient deck |
| stampStaticDevices | 3.05 | below top 20 |
| analyzePattern | below top 20 | 6.87 |
| factorize | below top 20 | 5.43 |
| applySupernode | below top 20 | 5.03 |
| newtonRaphson | 1.92 | 5.02 |
| amdOrdering | 2.19 | 3.82 |

Largest eligible RC10k frame is attemptStep. Largest eligible Mesh10k frame is analyzePattern. At 50k the leaders change to evaluate (RC, 8.35%) and applySupernode (mesh, 15.72%). A single 10k winner must not be assumed to dominate scaling.

The candidate only computes `rawDelta` for watched nonlinear terminals, whose set includes all damped terminals. On attempts with no watched terminals it allocates an empty delta vector. It leaves convergence checks over ALL unknowns intact, including branch-current tolerances. No circuit-name/size branches, arithmetic changes at consumed deltas, or deck/tolerance/pin changes. `candidate.patch` is the exact rejected patch. This is not the previously rejected LU factor-growth candidate from PR1016.

## Ten-round cold comparison

180/180 cells, 60 native children, 126.853s total, zero failures/retries/trimming. Serial fresh processes, rotating control/candidate/native order each round, requested sizes 1k/10k/50k, two circuits, ten rounds each. Controller reuses #951 continuous/monotonic/realtime certification and process-group ownership. Uniform 120s child / 1800s overall limits. Journal, budget, ownership and full output hashes retained.

All times ms, median / IQR (linear-interpolated quartiles). Positive cut means improvement; negative means loss.

| Circuit | Size | Before parent wall | Candidate parent wall | Direct ngspice-47 KLU wall | Cut |
|---|---:|---:|---:|---:|---:|
| RC ladder | 1k | 181.170 / 62.163 | 180.648 / 36.061 | 43.456 / 9.986 | 0.288% |
| RC ladder | 10k | 529.741 / 109.957 | 578.069 / 88.239 | 253.004 / 43.522 | -9.123% |
| RC ladder | 50k | 1922.740 / 113.330 | 1832.723 / 143.157 | 1536.948 / 210.438 | 4.682% |
| Resistor mesh | 1k | 136.664 / 22.410 | 131.709 / 21.980 | 26.148 / 2.385 | 3.625% |
| Resistor mesh | 10k | 383.460 / 117.571 | 389.564 / 37.683 | 127.115 / 35.004 | -1.592% |
| Resistor mesh | 50k | 1217.893 / 125.536 | 1235.092 / 299.183 | 779.021 / 154.125 | -1.412% |

Both TS copies are uninstrumented. Parent wall includes Node startup/import and complete output hashing; direct native wall excludes its Node wrapper but includes complete native raw emission. Native wrapper wall is separately retained in the journal. IQRs overlap at 10k. Shared-host load is retained. The data reject this candidate, not prove that watched-node deltas are intrinsically slower. No eligible measured frame alone accounts for 15% of total RC10k sampled time.

## Matched-grid accuracy, before AND rejected candidate

Full TypeScript DC/transient voltage/current/time hashes are bit-identical across every before/candidate round for all six decks. Separate accuracy replay against the first pinned native raw file also matches those hashes.

Every emitted native voltage/current is compared, not only the printed n10 probe. For transient, linearly interpolate TS on native timestamps in the common closed interval. DC compares the single OP sample. Report retains per-signal count, absolute max/RMS and peak-normalized max/RMS; normalization is max(native signal peak, 1e-6 V or 1e-12 A). These floors only describe reported metrics, not simulator tolerances. Worst maxima/RMS below are independently selected across signals and may belong to different signals. `accuracy.json.gz` retains every signal with its name and counts. `summary.json` retains worst signal identities. Before and candidate errors are exactly equal, not merely within a relaxed threshold.

| Circuit | Size | Signals | Worst max absolute | Worst RMS absolute | Worst max normalized | Worst RMS normalized |
|---|---:|---:|---:|---:|---:|---:|
| RC ladder | 1k | 1001 | 1.110223e-15 | 4.329816e-16 | 2.804681e-15 | 1.273026e-15 |
| RC ladder | 10k | 10001 | 1.110223e-15 | 4.329816e-16 | 2.804681e-15 | 1.273026e-15 |
| RC ladder | 50k | 50001 | 1.110223e-15 | 4.329816e-16 | 2.804681e-15 | 1.273026e-15 |
| Mesh | 1k | 1025 | 1.779688e-13 | 1.779688e-13 | 4.806712e-13 | 4.806712e-13 |
| Mesh | 10k | 10001 | 1.754596e-12 | 1.754596e-12 | 4.425043e-12 | 4.425043e-12 |
| Mesh | 50k | 50177 | 8.075540e-12 | 8.075540e-12 | 1.989153e-11 | 1.989153e-11 |

## Commands and test evidence

- `pnpm install --frozen-lockfile`
- `pnpm build` (baseline, candidate, restored all exit 0)
- `node benchmarks/performance/linear-10k-prepare.mjs benchmarks/results/issue-991-solve/profile`
- Profiling command, inside a `spice-heavy python3 -c` serial loop over all six circuit/size pairs: `node --cpu-prof --cpu-prof-dir=<absolute-profile-dir> --cpu-prof-name=<circuit>-<size>.cpuprofile benchmarks/performance/linear-10k-worker.mjs control <absolute-profile-dir> profile-<circuit>-<size> <circuit> <size>` (120s timeout per subprocess). Exact built/deck pins retained.
- `spice-heavy python3 benchmarks/results/issue-991-solve/run.py benchmarks/results/issue-991-solve/matrix`
- `spice-heavy node benchmarks/results/issue-991-solve/accuracy.mjs benchmarks/results/issue-991-solve/matrix`
- `pnpm -C packages/core exec vitest run src/analysis/transient-delta-991.test.ts src/analysis/transient-step.test.ts src/analysis/transient-iteration-invariant-710.test.ts` (14 pass on before, candidate and restored source)
- `pnpm lint` (restored source, exit 0)
- `node --test benchmarks/results/issue-991-solve/receipt.test.mjs benchmarks/performance/linear-10k.test.mjs` (15 pass)
- `node benchmarks/results/issue-991-solve/verify.mjs benchmarks/results/issue-991-solve` (180 cells, 60 raw archive reconstructions, 6 profiles, 12 all-signal accuracy cells; thresholdMet=false)
- `shasum -a 256 -c benchmarks/results/issue-991-solve/SHA256SUMS`

Test-only commit precedes the experiment. This is semantics-preserving performance work, not a bug fix with a failing behaviour reproduction. The new literal RC solution/snapshot test passes before and after; existing damping/oscillation, singular-solve and iteration-invariance tests cover nonlinear fallback. No artificial RED claim. Root full tests not run locally; exact-head CI owns that gate.

Archives must be expanded for accuracy replay: `python3 benchmarks/results/issue-991-solve/expand.py benchmarks/results/issue-991-solve/matrix <NEW-copy-dir>` then `spice-heavy node benchmarks/results/issue-991-solve/accuracy.mjs <NEW-copy-dir>`. Run verifier against the published archived receipt directly. Fresh timing reproduction requires baseline build, then applying candidate.patch and rebuilding before `run.py <NEW-output-dir>`; that runner reads the published pinned control and current built candidate, never overwrites attempted journals. Restore the patch afterward. Do not benchmark a different revision and label it this candidate.

No production optimisation remains. Exact-head CI and independent review are required before merge; implementation lane does not merge. Sources, licences and hashing policy are in SOURCES.md.
