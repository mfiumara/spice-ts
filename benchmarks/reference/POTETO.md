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
