# MAXORD order cap (#983)

## Implementation boundary

Native `.options maxord=1` and `.options timeint maxord=1` now use backward
Euler, whether METHOD is trap or gear. METHOD and MAXORD are retained separately
so token/card ordering and a later MAXORD=2 work correctly. `resolveOptions`
selects the existing first-order method once for companion stamping, nonlinear
charge history, truncation, batch and streaming. No solver, device model,
transient-driver, sparse or circuit.ts changes.

Reference inspected at ngspice-47 source revision
`a80f6e3e95d51534905b1f23410a951802666656`:

- `src/spicelib/analysis/cktdojob.c:54` transfers the order cap to the circuit.
- `src/spicelib/analysis/dctran.c:827-830` raises order 1 only if MAXORD > 1.
- `src/maths/ni/nicomcof.c:37-40` sets trap order-1 coefficients to 1/dt and
  -1/dt; the Gear order-1 coefficient solve produces the same backward-Euler rule.
- Source tree: https://github.com/imr/ngspice/tree/ngspice-47

Trap caps above 2 retain trap order 2, as before. Gear orders above 2 remain
explicitly unsupported. The netlist keeps ngspice rounding/clamping to 1..6;
the native API `maxOrder` requires an integer in that range.

## Reproduce

From the repository root, with dependencies installed and ngspice-47:

```sh
pnpm build
spice-heavy pnpm exec tsx benchmarks/reference/maxord-983/run.ts
node --test benchmarks/reference/maxord-983/report.test.mjs
pnpm -C packages/core exec vitest run src/analysis/transient-maxord-983.test.ts src/parser/options-xyce-packages-713.test.ts src/parser/options-directives.test.ts src/analysis/transient-gear2.test.ts src/simulate.stream.test.ts src/analysis/transient-charge-lte.test.ts src/analysis/transient-reactive-truncation-equivalence.test.ts
pnpm lint
```

RED commit `13e8bd0c` has 9 failures / 2 passes. GREEN has 198 focused tests
passing across 7 files, including 20 order-cap tests. Local monorepo build/lint
passed. No local full suite was run (card requests targeted tests only); required
GitHub CI is the full gate.

`run.ts` imports the existing corpus-f packed engine runners and corpus-j
reducer, validates the original pump input hash, and records all five cases.
No copied/adapted pump deck or per-circuit tolerance. The original pump is
GPL-3.0-or-later under the retained corpus-k Xyce grant; four RC probes are
original MIT project work. See [SOURCES.md](../../SOURCES.md).

The baseline is the committed k-13 outcome at
`8c8318aa011e104b0488f0e69bb17f63aee3ce72`, reproduced by the RED test. It has
no waveform, so before error is null, not zero. `report.json` records the measured
core tree and machine (Apple M5 Pro, arm64, Darwin 27.0.0, Node 22.23.1).
Runtimes are cold engine/adapter wall measurements, not solver-only or a speed claim.

## Results and remaining loss

| Input | ngspice / spice-ts points | Worst full-scale-normalized error | Outcome |
|---|---:|---:|---|
| Original pump before | 868 / none | null | unsupported |
| Original pump after | 868 / 869 | 0.0585 on i(vnin) | mismatch |
| RC trap MAXORD=1 | 97 / 97 | 1.24e-15 | matched |
| RC trap MAXORD=2 | 67 / 67 | 2.99e-15 | matched |
| RC gear MAXORD=1 | 97 / 97 | 1.24e-15 | matched |
| RC gear MAXORD=2 | 67 / 67 | 2.01e-7 | matched |

The original pump now completes, but does not meet the unchanged 1% corpus
threshold. On the standard aligned comparison, i(vnin) max/RMS absolute errors
are 1.81487e-5 / 1.75971e-6 A; v(5) errors are 1.45304e-3 / 6.77719e-4 V.
The receipt also publishes linear-interpolation sensitivity (i(vnin) max/RMS
5.24088e-5 / 3.14357e-6 A) and raw pointwise-relative errors including zero-reference
exclusions. Pointwise-relative errors near zero must not be conflated with the
full-scale-normalized headline. No corpus-wide outcomes or aggregate were refreshed.

Residual MOS2 waveform investigation is separate from the MAXORD admission/order
fix. `Circuit.toNetlist()` MAXORD serialization is also separate: the card forbids
editing circuit.ts, whose whitelist does not emit `maxOrder`. External-backend
and text-round-trip MAXORD parity are NOT claimed by this PR. Supervisor routing
card `t_a175c7b3` records both follow-ups. Native string, parsed Circuit, streaming,
and caller cap override behavior are tested here.
