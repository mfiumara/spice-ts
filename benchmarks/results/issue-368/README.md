# Issue 368 bounded passive RLC transient receipt

The two project-authored MIT fixtures `series-rlc.cir` and `parallel-rlc.cir` are supplied byte-for-byte to the explicit `spice-ts-wasm` backend, the `spice-ts-js` TypeScript backend, and native ngspice-47. The three files under `unsupported/` exercise inductor forms the bounded WASM backend rejects; their outcomes on all three engines are recorded as losses.

Run `pnpm --filter @spice-ts/wasm bench:rlc-tran` to regenerate `report.json`. It builds the package, runs five fresh-process suite samples per engine, asserts every WASM result reports `metadata.backend === 'spice-ts-wasm'` (no fallback), and writes fixture hashes, point counts, convergence, matched-timepoint max/RMS absolute and relative errors for WASM vs ngspice, TypeScript vs ngspice and WASM vs TypeScript, unsupported-form outcomes, runtime samples, and artifact-size changes from exact base `d3eaf5a9e6a19ebb56741967d14291c2b3392be1`. `versions.measuredRevision` is the implementation commit the measurements ran on with a clean worktree; the receipt commit that adds `report.json` is its only child.

Committed results (measured revision `6446d163a748a6f59bb1e48de8b69d5d3f8079a9`, Node 22.23.1, ngspice-47, Apple M5 Pro):

| Fixture | Vector | WASM vs ngspice max abs | max abs / peak | TS vs ngspice max abs | max abs / peak |
| --- | --- | ---: | ---: | ---: | ---: |
| series | v(out) | 8.031e-05 V | 5.005e-05 | 1.129e-04 V | 7.034e-05 |
| series | i(l1) | 9.728e-07 A | 3.857e-05 | 3.342e-06 A | 1.325e-04 |
| parallel | v(out) | 1.103e-06 V | 3.575e-05 | 5.102e-06 V | 1.654e-04 |
| parallel | i(l1) | 8.103e-08 A | 4.153e-05 | 1.640e-07 A | 8.402e-05 |

All vectors, RMS values and relative errors are in `report.json`. WASM output was byte-identical across all five runs.

Losses retained:

- Relative error with the declared 1e-12 floor reaches 0.477 (series `v(out)`) and 0.480 (parallel `i(l1)`) at the start of the step where the reference is near zero; both spice-ts backends show the same figure.
- WASM uses fixed print-step trapezoidal steps while ngspice and the TypeScript engine adapt; WASM emits 401 points where ngspice emits 419.
- Coupled inductors (`K`), inductor `IC=`, and inductor `m=` complete on ngspice-47 and on the TypeScript engine but return `UNSUPPORTED_FEATURE` (`inductor-coupling`, `inductor-initial-condition`, `inductor-form`) on WASM.
- End-to-end runtime: WASM suite median 1,354.2 ms and TypeScript 1,198.8 ms versus ngspice 56.7 ms (WASM 23.9x slower) under unequal process boundaries that include pnpm, tsx and Node startup. This is not a speed claim.
- Artifact growth from the exact base: `worker.js` +570 bytes, `index.js` +5 bytes, `dense-solver.wasm` +0 bytes (ABI and kernel unchanged).
