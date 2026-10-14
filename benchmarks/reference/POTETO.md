# Xyce reference bootstrap (#948)

## Grounding

The existing comparison seam is `ComparisonFixture -> Promise<EngineRun>` in
`benchmarks/comparison-harness.ts`. `SampleSeries` stores numeric grids and complex
signal arrays. The classic corpus runner exports multiple native ngspice plots.
No simulator model is changed here. spice-ts currently treats LEVEL=260 as MOS1
for ngspice parity, so its numeric EKV-deck result must be labelled a fallback.

## Design

Two candidates: parse Xyce rawfiles into the ngspice plot parser, or explicitly
print CSV and return the existing series type. Choose CSV: output selection is
explicit, AC real/imaginary parts are visible, and malformed data fails closed.
Only output cards are mechanically translated. No unknown option is discarded.
The report records original and translated hashes and the exact translation list.
Native circuit/model statements are retained, including LEVEL=260.

## Throughput checkpoint

Installation discovery and contract discovery block live verification. Adapter
and tests are one independent delegated unit. Parent owns installation recipe,
fixture provenance and report script. No shared edits between those workstreams.
A separate report avoids the aggregate history and outcome ledger hotspot.

## Slice boundary

Deliver a verified upstream macOS serial installation, DC/TRAN/AC adapter, EKV
2.6 reference evidence and attempted cross-check of all 100 aggregate fixtures.
OP/control/options translation, 100 mutually accepted fixtures, verified source
build/Linux execution, and true spice-ts EKV parity remain follow-up work.
This is not completion of all #948 acceptance criteria and must not close #948.

## Canonical adapter expansion (t_8223ca21)

The domain shape is `CanonicalCircuit` with logical records, ordered analyses,
explicit changes and limitations. The seam is a shared ordinal analysis projection
fed to both native references, with only output directives differing. Live Xyce
cannot export mixed DC/AC/TRAN in one process, so projections replace that invalid
assumption without changing circuit or model statements.

Atomic lowering prevents unsupported control programs from being partially executed.
Only proven shared DEVICE TEMP/TNOM/GMIN options map; other solver semantics fail
closed. Export/parse failures and ignored-statement losses remain separate from
convergence claims. The reproducible 100-row receipt and hash verifier live in
`adapter-948/` and the existing offline CI reference gate. No parallel worker edits,
SOURCES.md hotspot edits, core changes, or aggregate regeneration in this slice.
