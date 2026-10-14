# #1053 current-main attribution receipt

Refs #1053. Evidence only. No runtime, tolerances, step controller, device model or corpus changes are shipped. The proposed step-count explanation is rejected on current main; no new optimization has demonstrated the required >=25% reduction at both sizes. This receipt does not close #1053 and does not claim that no future optimization can meet that gate.

## Reproduce

From the repository root, with Node 22 and ngspice-47 (KLU enabled):

```sh
pnpm install --frozen-lockfile
pnpm build
spice-heavy python3 benchmarks/results/issue-1053/run.py /absolute/path/to/new-output
node benchmarks/results/issue-1053/check.mjs /absolute/path/to/new-output
node --test benchmarks/results/issue-1053/evidence.test.mjs
```

The output directory must be fresh. The committed `run/` is immutable. The scripts reuse the existing MIT-licensed M2 generator and raw-output reader; source provenance is already in `benchmarks/SOURCES.md`. The same deck file is passed to both engines, without `.options` edits. An isolated HOME containing `.spiceinit` selects KLU outside the shared deck.

Base `08072804291785b2ca9213f3689551eb325fc5f6`, Node v22.23.1, pnpm 10.28.1, Homebrew ngspice-47. Darwin 27.0.1 arm64. Shared machine, 1-minute load 10.47–21.43. Ten serial cold-process rounds, alternating engine order each round, four decks, 80 uninstrumented samples; two separate instrumented diagnostic runs. No warmups, retries, dropped outliers or timing selection. `run/receipts.jsonl` preserves each parent elapsed time, engine times, load, probe/grid, full-output digest and convergence counts. Bundles are pinned in `prepared.json` and archived as gzip. Native raw plots and acct stdout are retained for every sample.

The primary wall comparison is the public in-process spice-ts parse+simulate API against a fresh native `ngspice -b -r` invocation (including full binary plot output). It excludes Node startup/import and the worker's post-simulation hashing. This is an embedding comparison, not equal startup or output paths. The independent parent elapsed times include those costs and remain in the journal. Analysis comparisons include compilation/OP/transient on the spice-ts side and ngspice's internal analysis timer on the other side.

## Byte-identical decks

| Deck | Size | SHA-256 |
|---|---:|---|
| cmos-inverter-chain-tran | 1k | `1a9866593c778a9fa26e23c1916c7b00b1bdb1adc2e7a246d9e3f4aa4f1ca1e1` |
| cmos-inverter-chain-tran | 10k | `2ce663326238609299d8628016b1211632f1474e9d40b6c39747fff964999a18` |
| rc-ladder-tran | 10k | `eb21933fd99fcbc32276816a4f389ba216dcdddc29683551a67f606f352dfca7` |
| resistor-mesh-op | 10k | `c88e6076daf2523437e3da014d7a3c329f679a7405f789530c5c805f447ed0dc` |

## Wall and analysis distributions

All values are milliseconds. Each cell is median [Q1, Q3], using linearly interpolated quantiles; IQR is Q3−Q1. Exact medians/IQR and all samples are in `summary.json` / `run/receipts.jsonl`.

| Deck | spice-ts API wall | ngspice CLI wall | spice-ts compile+analysis | ngspice analysis | API/native wall |
|---|---:|---:|---:|---:|---:|
| CMOS 1k | 423.40 [412.10,429.53] | 298.78 [279.62,311.74] | 394.03 [383.77,398.93] | 257.87 [241.41,269.94] | 1.42x slower |
| CMOS 10k | 3375.36 [3279.21,3514.12] | 6297.05 [5618.46,6817.31] | 3223.78 [3123.44,3338.29] | 6072.95 [5444.13,6619.99] | 0.54x |
| RC 10k | 512.53 [492.02,560.18] | 309.16 [294.71,330.92] | 395.34 [384.95,450.33] | 229.97 [214.66,249.57] | 1.66x slower |
| mesh OP 10k | 352.86 [340.89,365.92] | 147.79 [142.52,163.85] | 233.58 [226.03,254.03] | 63.36 [58.20,72.64] | 2.39x slower |

Losses remain at CMOS 1k and both controls. The 10k chain reads faster in this run, but it is not a new change or a general engine-superiority claim. OP strategies differ, output paths differ and load is high. In particular, the chain 10k API maximum is 13.11 s versus a 3.38 s median. There is no candidate A/B, no before/after improvement attribution, and no claimed >5% regression gate: shipped runtime bytes are unchanged, so that gate is inapplicable rather than tested by comparing different engines.

## Counts: the 671-vs-214 premise is obsolete

At both 1k and 10k, every uninstrumented spice-ts run has:

- 213 accepted advances after the initial point, zero rejected steps, zero NR retries and zero LTE retries;
- 466 transient Newton iterations;
- 214 output rows including t=0.

ngspice acct reports 214 accepted timepoints (including the initial point), zero rejected timepoints, 483 transient iterations and the raw plot has 214 rows. These are the same accepted-grid size, not a 3x step-count difference. ngspice acct does not classify rejected points into NR versus LTE; with zero total rejections there are none of either kind on these decks, but no separate native LTE counter was measured.

Spice-ts initial-OP Newton counts are 138 / 226 at 1k / 10k; native total iterations are 902 / 1115 with 483 transient iterations. These counters are not equal work because their gmin/OP schedules differ. The existing #878 targeted regression still passes and binds the transient iteration schedule to an independently instrumented ngspice-47 reference.

## Phase attribution

Exclusive benchmark-copy instrumentation wraps function bodies with a nested span stack. It changes no source or original dist bundle and the diagnostic waveform digests/convergence counts match the uninstrumented bundle exactly. It substantially slows the simulator (1k analysis 1765 ms, 10k 6162 ms), especially 4.76 million per-device convergence spans at 10k. **These are diagnostic elapsed times, not production costs or speedup evidence.** Both device evaluation and stamping happen inside `batchStamp`; they cannot be separated honestly by these hooks.

| Exclusive phase | spice-ts 1k diagnostic ms | spice-ts 10k diagnostic ms | ngspice 1k acct median ms | ngspice 10k acct median ms |
|---|---:|---:|---:|---:|
| MOS device load+stamp | 515.11 | 2005.47 | not split | not split |
| remaining load+stamp | 235.60 | 295.23 | combined 157.42 | combined 4104.13 |
| factor | 137.02 | 515.06 | 21.90 | 257.23 |
| solve | 14.77 | 126.54 | 17.00 | 204.83 |
| MOS convergence | 236.95 | 997.72 | not split | not split |
| charge truncation | 48.08 | 422.00 | not split | not split |
| timestep selection | 8.20 | 1.14 | not split | not split |
| node LTE | 0.68 | 4.61 | not split | not split |
| order control | 0.37 | 0.40 | not split | not split |
| output materialization | 4.36 | 45.49 | not split | not split |

`summary.json` retains all other exclusive spans and residual. Native acct exposes combined matrix load, factor, solve and reorder timers, not independent device evaluation, step control or output clocks. Missing native splits are explicitly unavailable, not zero or invented residual assignments.

An independent, uninstrumented 10k V8 profile (`cmos10k.cpuprofile.gz`, `profile-summary.txt`) corroborates the largest bucket. MOS batch stamping is 26.8% self / 29.8% inclusive of the whole worker profile, device convergence 10.2% self, GC 6.7%, charge truncation 4.8%. Initial OP is 26.9% inclusive and transient is 58.4%. Sampled times cover imports/parsing/hashing as well as simulation and do not sum to the matrix median.

Hypotheses rejected for this slice:

1. Fewer accepted steps. There are already exactly 214 rows in both engines and zero rejected trials. No redundant 671-point schedule remains to remove.
2. Convergence checks or result output alone. Their sampled shares cannot yield a 25% whole-worker cut even if removed entirely. Removing correctness checks/output is not a valid optimization anyway.
3. A simple stamping-only change. Stamping is the largest measured bucket, but a 25% total cut would require removing most of it, not a demonstrated cheap general change. No correctness-preserving candidate has been established here. This receipt leaves batching/fusing device-load work for a separately scoped follow-up instead of shipping an unverified kernel rewrite.

## Accuracy and verification

On native linear interpolation to the spice-ts accepted grid, v(s20) max/RMS error normalized to native probe peak is 0.00112467 / 0.000120498 at both sizes (0.1125% / 0.01205%). RC v(n10) max error is 2.26e-15 of native peak. This is probe evidence, not full-vector cross-engine equivalence. The complete same-engine waveform digest is stable across all ten samples and unchanged by instrumentation.

Local `pnpm build`, `pnpm lint`, `spice-heavy pnpm test` (full monorepo plus root benchmark tests), targeted 6/6 step-control/predictor tests, `spice-heavy pnpm exec tsx benchmarks/accuracy.ts --ci` and 3/3 offline evidence tests pass. The accuracy script's native comparison columns are empty on this host; its successful CI-threshold exit is not substituted for the real native waveform comparisons above. Compressed receipts are retained here. Required exact-head CI and the independent review are recorded on the PR/card, not asserted by this base-SHA measurement.
