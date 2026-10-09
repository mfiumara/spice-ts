# Benchmark sources

## Chua & Lin circuit, issue #48

- Fixture: `benchmarks/circuits/chua-issue-48.cir`
- Source: [spice-ts issue #48](https://github.com/mfiumara/spice-ts/issues/48), opened by Mattia Fiumara on 2026-05-05, including an LTspice schematic labelled “Chua & Lin, 8-7 page 343”.
- Reconstruction: transcribed from that issue screenshot. The issue text explicitly confirms `C12 ic=2 V` and `C3 ic=5 V`; the screenshot additionally shows `L8 ic=2 A`, the three coupling coefficients, component values, source parameters, and `.tran 0 200 0 0.2 uic`.
- Licence: the fixture is an original plain-text reconstruction contributed to this MIT-licensed repository. The source screenshot is linked for provenance but is not redistributed.
- Reference simulator: ngspice-47. Because ngspice rejects LTspice’s zero print-step extension, the reference run changes only the first `.tran` operand from `0` to `0.2`; `tstop`, `tstart`, `tmax`, topology, values, and initial conditions remain identical.
- Reference command: `pnpm exec tsx benchmarks/chua-ngspice.ts`. The script applies the documented `.tran` adaptation, runs ngspice in batch mode, and prints the waveform metrics as JSON.
- ngspice-47 reference (56,663 accepted points): after 20 s, `V(y)` spans 0.454439238–1.03693966 V and crosses its post-20 s mean five times. These envelope/crossing metrics are used instead of pointwise chaotic-waveform equality.
- spice-ts diagnosis after adding bounded K-element/UIC support: the unmodified fixture still ends with `TimestepTooSmallError` at `t=0.2000001908939091 s` (`dt=2.498001805406602e-16 s`) with the normal transient iteration budget. The run took 45.664 s on the development machine. This is reported as a remaining transient-convergence gap, not parity.
