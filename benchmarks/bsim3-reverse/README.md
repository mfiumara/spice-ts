# BSIM3 reverse-mode / SRAM write diagnostics

This is a partial fix for [#582](https://github.com/mfiumara/spice-ts/issues/582), not a waveform-parity claim. The SRAM now writes the intended bit, but its switching waveform still differs substantially from ngspice-47. The broader approximate DC/capacitance model is tracked in [#589](https://github.com/mfiumara/spice-ts/issues/589). Do not close #582 on the strength of the final state alone.

## Root cause and bounded change

- The DC evaluator accepts forward NMOS-convention bias only. Previously a negative Vds produced zero channel current, so the access transistor could not discharge the SRAM node. The device now interchanges the effective drain/source nodes for the DC stamp.
- Card-supplied PMOS VTH0 must be multiplied by type before the NMOS-convention evaluator uses it. A negative enhancement threshold was previously treated as a depletion threshold. The existing positive internal default is retained; ngspice default-value parity remains outside this slice.
- The approximate capacitance evaluator now interchanges intrinsic drain/source charge partitioning in reverse mode. Physical overlap and junction capacitances stay attached to their physical terminals. This is still the existing Meyer-like approximation, not an implementation of ngspice capMod.
- No integration, solver, parser, tolerance or per-circuit parameter changes.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/bsim3-reverse/compare.ts --output benchmarks/bsim3-reverse/after.json
    pnpm -C packages/core exec vitest run src/devices/bsim3v3-reverse-mode.test.ts src/devices/bsim3v3-cap.test.ts

The comparison exits zero when all eight comparisons produced metrics, NOT when they meet parity. It intentionally retains losses. The shared harness sends identical bytes to both engines, aligns ngspice by linear interpolation onto the spice-ts grid, and excludes reference magnitudes <= 1e-15 from relative errors. Receipts retain input hashes, versions, environment, runtime, metrics and first/last values; raw waveforms are omitted. Sources and licences are in `benchmarks/SOURCES.md`.

`before.json` was run against an archived copy of main `bf2e4169` with the diagnostic script added, not the patched engine. `after.json` uses the engine changes in this branch, rebased onto main `e2d384ce`; every metric, point count and end value matches the earlier run on `bf2e4169` (only runtime samples and the timestamp differ). All eight before/after input hashes match. Environment: Apple M5 Pro, macOS/arm64, Node v22.23.1, ngspice-47. Runtime samples are from a shared host and support no speed claim.

To reproduce RED, archive `bf2e4169` into a separate directory inside the worktree, including `packages/core`, `tsconfig.base.json` and `package.json`; supply its dependencies, copy the two current test files over the archived test files, and run the Vitest command above from the archived `packages/core`. Five tests fail and five pass on that baseline; all ten pass on this branch. To reproduce `before.json`, also archive `benchmarks/comparison-harness.ts` and `benchmarks/circuits`, copy this `compare.ts` into the same relative location, build the archived core, and execute the archived script.

## Measured errors against ngspice-47

Absolute max / RMS; volts for SRAM nodes, amperes for currents. Full relative max/RMS, point counts and runtime samples are in the JSON receipts.

| Fixture / signal | Before max / RMS | After max / RMS |
| --- | ---: | ---: |
| SRAM q | 1.940743 / 1.675041 | 0.645187 / 0.099217 |
| SRAM qb | 1.712110 / 1.490329 | 0.986685 / 0.171906 |
| NMOS forward i(VD) | 4.033934e-4 / same | 4.033934e-4 / same |
| PMOS forward i(VD) | 9.952115e-4 / same | 3.408283e-4 / same |
| NMOS reverse i(VD) | 1.652005e-4 / same | 4.033934e-4 / same |
| PMOS reverse i(VD) | 1.401348e-4 / same | 3.408283e-4 / same |
| PMOS off i(VD) | 1.131990e-4 / same | 1.800139e-12 / same |
| PMOS Id-Vgs i(VSD) | 0.020793 / 0.011790 | 0.006708 / 0.002647 |
| NMOS Id-Vds i(VDS) | 0.009536 / 0.007298 | 0.009536 / 0.007298 |

SRAM end state at 10 ns:

| Engine | q (V) | qb (V) |
| --- | ---: | ---: |
| Baseline spice-ts | 1.799999999 | 0.087889836 |
| Patched spice-ts | 1.810708e-11 | 1.799999999986 |
| ngspice-47 | 4.580770e-9 | 1.799999987991 |

The SRAM uses 1076 baseline spice-ts samples, 1180 patched samples and 1032 ngspice samples. RMS values weight samples rather than time, so changes in adaptive sample density affect RMS. The target grid differs from the earlier issue #589 measurements on ngspice points; those RMS values are not interchangeable.

Published losses: reverse-mode absolute current errors INCREASE. Enabling reverse conduction exposes the existing model's overdrive instead of its former zero current. The forward NMOS error is unchanged. PMOS errors improve but remain large. Endpoint agreement does not establish transient parity.

## Remaining acceptance

The full #582 waveform criterion is not met. It needs the broader BSIM3 DC/default/charge work tracked in #589, followed by a new identical-netlist waveform comparison. No tolerance is widened here and no expected-loss envelope is presented as a parity pass.
