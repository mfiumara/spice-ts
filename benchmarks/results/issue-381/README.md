# Issue #381 ngspice `.control` / `.endc` contract receipt

This receipt covers the explicit `.control` … `.endc` contract and the identical-fixture AC comparison for `ngspice/probe-ac`. It does not add a control-language interpreter.

## Identical fixture

- Fixture: `benchmarks/corpus/ngspice/fixtures/examples/probe/ac-test.cir`
- SHA-256: `3afb9105918f939cbbdab957f8f872bbc886209fb83dbd27003c605977916479` (unchanged, verified by the script and by the focused test)
- Adaptation: none
- Analysis: `.ac dec 5 10 10000` (16 points); control block: `run`, `display`, `print vd_r2/i(r2)`, `plot mag(vd_r3)`

## Before and after

| Engine/state | Outcome |
|---|---|
| spice-ts before #381 | `ParseError: Parse error at line 14: Unsupported dot command: '.control'` |
| ngspice-47 unchanged fixture | success, AC, 16 points |
| spice-ts after #381 unchanged fixture | success, AC, 16 points |

## ngspice-47 comparison (identical netlist)

The shared comparison harness (`benchmarks/comparison-harness.ts`) puts both runs on the spice-ts frequency grid and uses linear complex interpolation. The relative-zero threshold is `1e-15`. The bound is `2e-9` absolute and relative, the same bound as the `current-source-ac` receipt; it was not tuned for this circuit.

| Signal | Samples | Max abs error | RMS abs error | Max rel error | RMS rel error |
|---|---:|---:|---:|---:|---:|
| v(1) | 15 | 4.441e-16 | 2.668e-16 | 4.441e-16 | 2.668e-16 |
| v(2) | 15 | 2.225e-16 | 1.268e-16 | 1.037e-15 | 4.482e-16 |
| v(3) | 15 | 1.124e-16 | 6.842e-17 | 7.138e-16 | 3.849e-16 |
| i(V1) | 15 | 4.412e-19 | 2.160e-19 | 7.174e-16 | 3.988e-16 |

Tools: spice-ts 0.3.0 (this branch), ngspice-47, Node v22.23.1, darwin-arm64 (Apple M5 Pro). `report.json` is the machine-readable receipt.

## Contract

- Lines between `.control` and `.endc` are ngspice control language and are never parsed as netlist cards. Otherwise `run`, `display` and `print` would be read as R, D and P element cards.
- Accepted without execution:
  - bare `run`, which executes the deck's dot-card analyses; `simulate()` always does this.
  - the output-only commands `print`, `plot`, `asciiplot`, `display`, `echo`, `listing`, `quit` and `exit`. spice-ts returns every computed vector through its result API, so these cannot change any computed value.
- Rejected with a `ParseError` that names the command and its line: every other command. Examples are `op`, `ac`, `tran`, `let`, `set`, `alter`, `alterparam`, `meas`, `if`/control flow, `remcirc` and `run <file>`. These could add, change or derive results, so they are never silently dropped.
- Structural errors reject explicitly: an unterminated block, a nested `.control`, a stray `.endc`, and arguments on `.control` or `.endc`.
- Multiple sequential control blocks are allowed.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/results/issue-381/verify.ts --output benchmarks/results/issue-381/report.json

The script exits non-zero if the fixture hash changes, if either engine fails, or if a compared signal exceeds the bound.

## Published losses and boundaries

- spice-ts does not return ngspice's `.probe` vectors `i(r2)`, `vd_r2` and `vd_r3` (device-terminal current and differential probe voltages). They are reported as missing from spice-ts and are not compared.
- The control block's `print`/`plot`/`display` output is not produced; values come back through the result API.
- The 10 kHz endpoint is not compared. ngspice accumulates the decade grid to 9999.999999999989 Hz while spice-ts returns 10000 Hz, and the shared harness excludes that out-of-range point instead of extrapolating, so 15 of 16 points are compared.
- Other corpus fixtures with control blocks (`ac-zero`, `positive-definite-1..4`) use `let`, `if`, `op`, `alter`, `remcirc` and similar commands. They stay unsupported, and these commands now reject by name.
- The committed aggregate report (`benchmarks/aggregate-report.json` / `AGGREGATE_PARITY.md`) and the corpus manifest were not regenerated or edited here. `aggregate-report.ts --check` therefore reports `ngspice/probe-ac` as the single changed outcome (spice-ts unsupported → success) until the aggregate is refreshed separately.
- No runtime comparison or superiority claim is made.
