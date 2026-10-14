# #978 lazy analysis entry experiment

Prior #981 profile identifies whole-bundle V8 compilation as the largest bucket (26.917 ms sampled median). Largest source initialization is tokenizer, which is owned by another lane and is not edited here. #1034 minification missed the 25% gate.

Two seams considered:
- Change synchronous parse/Circuit construction to defer device models. Rejected for this slice because it changes synchronous API semantics and touches parser ownership.
- Keep synchronous parser/Circuit/createTransientSim APIs eager. Put async simulation/stream entry points behind dynamic import, extracting the synchronous backend factory into that facade. Chosen. This defers rare analysis engines without circuit-specific logic. It might leave too much eager model/parser compilation to meet the gate; measure and reject if so.

Data shapes remain existing SimulationOptions, SimulationResult, ProtocolExecutionGuard and AsyncIterableIterator<TransientStep | ACPoint> / AsyncIterableIterator<StepStreamEvent>. No new public type or API. Facade forwards arguments and yields, preserving Promise rejection, generator cancellation and constructor names. createSimulator remains synchronous.

Controls: retained built baseline from a521e9e221f4445639d899265589e5893a07e165; build candidate with identical tsup config; #1034 runner with #951 continuous-clock certification, 15 alternating cold import rounds, 15 alternating cold rounds for RC1k/Mesh10k/CMOS1k, full-output hashes and ESM/CJS runtime names. Run through spice-heavy. No excluded samples. Reject and revert production changes if import median improvement is below 25% or compatibility fails.
