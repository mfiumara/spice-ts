# ngspice comparison harness v2

The v2 harness runs the same in-memory netlist text through spice-ts and native
ngspice. It does not rewrite the circuit or tune tolerances per fixture.

Prerequisites: Node.js 20 or newer, pnpm, and `ngspice` on `PATH`.

```sh
pnpm install --frozen-lockfile
pnpm bench:compare:v2 -- --output /tmp/comparison-v2-report.json
```

The default run covers an operating point, AC sweep, and transient analysis.
The JSON report records tool versions, runtime metadata, commands, a SHA-256 of
the netlist sent unchanged to both engines, convergence or execution failures,
grid alignment counts, and max/RMS absolute and relative errors for every
requested signal. Relative errors exclude ngspice reference
samples whose magnitude is at or below the single global `1e-15` threshold;
the exclusion count remains in the report. ngspice samples are linearly
interpolated onto spice-ts points inside the shared grid range.

Run the harness edge-case and schema tests with:

```sh
pnpm exec tsx --test benchmarks/comparison-harness.test.ts
```