# #1077 MOS2 prepared-slot candidate

Decision: receipt only. Refs #1077. The prepared-slot candidate misses the
required 15% median reduction on both fixtures. No simulator changes ship in
this PR. `candidate.patch.gz` preserves the measured implementation and its tests.

Measurement base is `4f4d957c3d0e52827a255861e56069a55135c110`.
The patch adds optional locked-topology conductance storage to StampContext,
then caches the 16 possible terminal-pair CSC slots per MOS2 instance. Static
and transient charge stamps preserve the original addition order. Slot caches
reset when the storage identity changes. Unlocked and callback-only contexts
keep the existing stamping path. This does not eliminate existing voltage
callbacks, channel-result allocations, or all per-load closures.

## Five-cold-run medians

| Fixture | Before JS ms | Candidate JS ms | Reduction | Before native ms | Candidate-series native ms | Remaining gap |
|---|---:|---:|---:|---:|---:|---:|
| ngspice/mos-amplifier-transient | 4667.35 | 3674.31 | 21.28% | 424.10 | 436.21 | 8.42x |
| classic/mos-amplifier | 4081.95 | 3591.21 | 12.02% | 425.14 | 475.17 | 7.56x |

The classic result fails the gate. These are substantially the same 27-MOS2
amplifier, not two independent topologies. The remaining native gap is large.
No superiority claim or issue-closing reference is justified.

Each engine/fixture/build group has five fresh processes. OS filesystem caches
are not dropped. `run.py` alternates build order and engine order each round
inside one spice-heavy slot. Before and after use separately built ESM snapshots
in separate Node processes. Native uses ngspice-47 with `-n -b -r` and the same
original deck bytes. The JS wall includes module loading, simulation, selected
waveform hashing, and receipt serialization. The worker's internal API time is
also retained, but is not the headline metric. Native raw files are temporary;
accounting and completion logs are retained. No native waveform error score is
newly computed here.

The shared Mac was busy. The initial sequential before-only series rose from
roughly 4.3 seconds to 11 seconds. It is retained in `exploratory-before/`, not
used as a favorable baseline. The interleaved series in `before/` and `after/`
is the headline comparison. It still has host-load outliers, including a
1076.68 ms native classic sample. No sample is removed from either median.
These local measurements do not establish a universal speedup.

## Numerical evidence

All ten JS cold runs per build retain exactly 2429 timepoints, 2428 accepted
advances, 766 rejections, and 82710 transient Newton iterations. The complete
convergence telemetry is identical before/after. SHA256 fingerprints of the
full time, v(20), and v(66) arrays are bit-identical in every run and both
fixtures. This proves those recorded waveforms did not drift, not that every
internal state or every output node was compared. Required accuracy CI tests
the shipped receipt-only head separately from this experimental candidate.

The candidate's 113 targeted MOS2/assembler tests pass. Its added comparisons
exercise grounded/aliased terminals, both polarities, reverse/zero bias,
repeated static/charge loads, and topology invalidation. Two assembler API
tests first failed on the pristine implementation, then passed with the patch.
No protected mos3, charge-state, transient-driver, dc, or bjt file was edited.

## After CPU profiles

Sampled self-time percentages, from separate diagnostic runs excluded from
headline medians. Full profiles and bundled line/column identities are retained
compressed, with the top 12 frames in `summary.json`.

| Frame | ngspice fixture | classic fixture |
|---|---:|---:|
| MOS2 stampTransientCharge | 14.28% | 15.06% |
| MOS2 stampConductance | 9.84% | 10.05% |
| MOS2 stamp | 8.88% | 8.55% |
| assembler getVoltage | 8.83% | 8.84% |
| garbage collector | 7.99% | 10.56% |
| MOS2 evaluateChannel | 7.59% | 8.19% |
| MOS2 evaluateCharges | 5.59% | 5.11% |

The direct-write helper itself remains expensive. Inference, not a measured
follow-up: resolving/checking storage outside each individual scalar stamp and
reducing voltage/channel/charge allocations might help. This receipt does not
ship or promise that next candidate.

## Reproduce

Use a disposable checkout at the measurement base with dependencies installed.
Keep the original decks and ngspice-47 unchanged. From its root:

```
pnpm install --frozen-lockfile
pnpm -C packages/core build
cp -R packages/core/dist "$TMPDIR/issue-1077-before-dist"
gzip -dc benchmarks/results/issue-1077-fix/candidate.patch.gz | git apply
pnpm -C packages/core exec vitest run mos2 assembler
pnpm build
pnpm lint
spice-heavy python3 benchmarks/results/issue-1077-fix/run.py paired "$TMPDIR/issue-1077-before-dist/index.js"
python3 benchmarks/results/issue-1077-fix/summarize.py
spice-heavy pnpm test
spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
```

Copy this receipt folder into that checkout first. The snapshot destination
must not already exist. Reproduction overwrites before/after receipts, so keep
a copy of the published samples. `summarize.py` validates 40 cold receipt rows,
five distinct run indices per group, exit codes, canonical fixture hashes,
ngspice version, stable work counts, and before/after waveform hashes. It reads
plain or gzip CPU profiles. The candidate is intentionally not applied to the
published PR head.

## Provenance and receipts

Only existing licensed fixtures are used. Their source URLs, pinned upstream
revisions, and licenses are in `benchmarks/SOURCES.md` under public ngspice
corpus A and classic corpus B. No new third-party circuit is introduced. These
measurement scripts and the candidate patch are original project code under
the repository license. `host.json` records versions, input and build hashes,
measurement SHA, and candidate source diff.

Local verification receipts and exact-head CI are reported separately. The
candidate aggregate check is not silently repaired when current-main provenance
pins are stale. The final PR leaves #1077 open and requires independent review.

Measured candidate verification (all logs retained as `candidate-*.txt.gz`):

- `pnpm install --frozen-lockfile`, exit 0.
- `pnpm -C packages/core exec vitest run mos2 assembler`, exit 0, 113 tests.
- `pnpm build`, exit 0. `pnpm lint`, exit 0.
- `spice-heavy pnpm test`, exit 0. Core reports 4335 passing tests, two expected
  failures, and six skips; the remaining workspace and benchmark tests pass.
- `spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check`, exit 1
  before simulation. SOURCES SHA256 is pinned to
  `d6bb12d27b99cff81ac14244e2871e9d45b6144aedd39ff5340ba6cce55e27d7`
  but actual is `aa003d40a89754c60c5cf79bd4760994aa33762faa6c0889ebcc8ccbce5e2ced`.
  The aggregate fixture-tree pin is
  `23aaa91cfde358550eec443e8b5aaec134d7a7f930b1810f6e7f7db2532d6307`
  but actual is `4d8eff5cf369bd4220611beb91d1396591f271c0c8dec8311167307a6c036504`.
  The exact diagnostic is in `candidate-aggregate.txt.gz`. No unrelated pin is
  changed and no aggregate pass is claimed.

The candidate was then removed. The receipt-only branch was rebased onto
`c7b88920dae45017f6b36969b308765956b2b4a6` before publication. Its simulator
files are unchanged from that base. Receipt build/lint and exact-head required
CI results are recorded in the PR and Kanban handoff.
