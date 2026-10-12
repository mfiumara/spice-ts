# Transient step after a breakpoint (#608)

`measure.mjs` runs spice-ts (built `packages/core/dist`) and ngspice-47 on
identical netlist bytes and prints the accepted time grids at start-up and
around one PULSE corner, the number of leading grid points that agree to 1e-9,
and the max |spice-ts - ngspice| of one vector (spice-ts linearly interpolated
onto the ngspice grid), over the whole run and from a settle time on.

    pnpm -C packages/core build
    node benchmarks/tran-savedelta-608/measure.mjs        # or --json

Decks: corpus-f `examples/ddt/ddt-test1.cir` and `ddt-test3.cir` (unchanged,
already recorded in benchmarks/SOURCES.md as part of corpus-f) and the RC
PULSE deck written in issue #561.
