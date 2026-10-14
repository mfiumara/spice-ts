## Gap

corpus-k k-13, `Xyce_Regression/Netlists/CircuitSim90/MOS2/pump.cir`, fails spice-ts on `.options timeint maxord=1` with `Unsupported .options maxord value: '1' (order-1-only integration is not implemented)`. ngspice-47 succeeds on the same original bytes. This is one reference-backed spice-ts loss in #980.

Source: https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/CircuitSim90/MOS2/pump.cir (GPL-3.0-or-later).

Determine ngspice-compatible behaviour for TIMEINT MAXORD=1 and native MAXORD=1. If mapped to a solver option, implement order-1-only integration rather than silently use order 2; if ngspice ignores the package, distinguish package semantics from native options. Test both paths against ngspice, keeping a structured warning for intentionally ignored fields. This benchmark does not prescribe unverified semantics.

Reproduce after corpus-k lands: `pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts`. Do not edit the fixture to make it pass.

Duplicate search: all-state searches `MAXORD` and `"maxord=1"`. Closed #713 records package parsing (including MAXORD=5), not this remaining order-1 gap. #840 uses MAXORD=2.
