# VDMOS comparison/export boundary (#1106)

## Root cause

Two independent generic boundary failures produced zero compared signals. Neither
is a VDMOS solver or parser defect. No production core file changes.

1. n-8/n-9/n-12 retain spice-ts control plot IDs (`ac1`, `tran1`, `dc1`, `dc2`),
   while `ngspice -b -r` raw headers carry descriptive names and no IDs. `pairPlots`
   rejected any ID-bearing plot against an ID-less header. n-8 actually exports
   51 points on both sides and ten common vectors, not missing i(vs) or v(d).
   The fix permits only the first numbered control plot against a single
   descriptive same-type raw plot. Later plots and ambiguous multiple descriptive
   targets stay unmatched; explicit mismatched IDs still never pair. Packed
   singleton batches carry the identity already resolved against the full inventory.
2. n-10/n-11/n-13 paired their plot names correctly but compared zero samples.
   `declaredSecondaryGrid` refused all control `run` commands and all mixed
   dot/control provenance. It therefore omitted the ngspice outer DC coordinates.
   The reset-ordinal fallback requires bit-identical primary grids; real engine
   primary samples differ by up to 8.88e-16 (n-10) or 5.33e-15 (n-11/n-13).
   Every outer group became unmatched. n-12 has this second failure too.
   The batch raw exporter now explicitly supplies dot-card provenance to the
   existing coordinate extractor. A single literal .dc card determines the batch
   raw secondary coordinates even with a straight-line control block. Dynamic
   flow/reset/source, repeated cards and nonliteral coordinates remain rejected.
   Existing secondary-value alignment can then compare within the correct outer
   group without modifying the strict ordinal rule or any error tolerance.

Actual plot names, IDs, point counts and every vector for all six affected decks,
plus n-6/n-7 controls, are in [inventory.md](inventory.md). The complete captured
exports are `before-n-*-*.json.gz` and `after-n-*-*.json.gz`. Captures were produced
by the unchanged corpus-n worker on the actual byte-identical inputs, not invented
waveform fixtures. The runner records input SHA-256 hashes, environment, versions,
commands, uniform deadlines, and full comparison receipts.

## Coverage and losses

The existing corpus metric compares common vector names. This policy is unchanged.
`after.json.gz` additionally publishes `coverage.missingFromSpiceTs` and
`coverage.missingFromNgspice` for every plot pair, including unpaired plots.
Different internal-node naming (`#` versus `.`) is visible, not silently normalized.
The saved vectors `i(@d1[id])`, `i(@m1[id])` on n-8 and `@d1[cd]`, `@m1[cds]` on
n-9 remain absent from the spice-ts export. A common-vector match is not a claim
that these saved device vectors are supported or that every exported vector was
compared. Saved-device-vector support is remaining scope for the supervisor.

n-12 remains `mismatch`: the 1566-point dc1 now compares ten common signals, but
the 486-point dc2 is unmatched because the batch raw file exports only the dot-card
sweep. The unmatched record and all its missing vectors remain visible. No plot is
dropped to inflate matches. Control/batch inventory parity is remaining scope,
not a numerical VDMOS mismatch. No revealed numerical error exceeds the unchanged
0.01 threshold, so no distinct numerical mismatch issue is filed.

n-6/n-7 retain identical outcome, signal count, normalized error and full comparison
receipts. `report.py` also checks every before/after exported waveform and plot
inventory is exactly unchanged, ignoring only added reference secondary metadata.
No fixture edits, fine-step adaptation, per-deck rules, tolerance changes, solver
changes, or aggregate report refresh.

## RED, GREEN and reproduction

RED commit `5e52d9e8b0140b99c2ed8c56e31610da9d97078d` contains captured real exports
and six failing deck regressions. `red.log.gz` records the failing execution.
GREEN adds shared pairing and reference-metadata fixes, a packed/unpacked receipt
equivalence check at one-signal batch size, explicit-ID/ambiguous-plot guards and
control-only/dynamic-provenance guards. The regression is included in root tests
for both required CI Node versions.

    pnpm install --frozen-lockfile
    pnpm build
    pnpm lint
    pnpm exec tsx --test benchmarks/vdmos-1106/comparison.test.ts benchmarks/dot-analysis-pairing.test.ts benchmarks/plot-alignment.test.ts
    spice-heavy pnpm exec tsx benchmarks/vdmos-1106/run.ts after
    python3 benchmarks/vdmos-1106/report.py
    spice-heavy pnpm test

`before.json.gz` was measured on fresh origin/main at the RED baseline before
changing the comparison/export helpers. `after.json.gz` was measured with the
fix. Receipts contain the then-current committed HEAD; modifications were not yet
committed when the after run executed. Their accompanying PR commit identifies
the exact code diff. Both runs used ngspice-47 and eight original input hashes.
Compressed build/lint/test logs are retained alongside the receipts. Runtime is
serial cold owned-engine process-group wall time, not solver-only performance;
this PR makes no speed claim.
