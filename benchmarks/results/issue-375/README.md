# Issue #375 — PULSE zero TR/TF uses TSTEP (ngspice semantics)

## Change

- `evaluatePulse` (shared by `VoltageSource` and `CurrentSource`) now follows
  ngspice-47 `vsrcload.c`/`isrcload.c` PULSE semantics:
  - the value is V1 at and before TD (`t - TD <= 0`), so the DC operating point
    and the t=0 sample see V1 even when TR=0;
  - periods repeat from TD (`t - TD` reduced modulo PER), fixing delays >= PER;
  - TR=0 / TF=0 use the transient TSTEP once the transient driver calls the new
    optional `DeviceModel.setTransientTimestep(tstep)` hook. Breakpoints use the
    same effective edges.
- The hook is called by the core transient driver (batch `simulate`,
  `simulateStream`, `.step`, `createTransientSim`) and the bounded WASM passive
  transient backend.
- Not changed: an *omitted* TR/TF still parses as 1e-12 s (ngspice also uses
  TSTEP for omitted values). Reported as remaining scope, not fixed here.

## Fixture (unchanged bytes)

`benchmarks/corpus/xyce/fixtures/RLC/rlc.cir`
sha256 `4d52f9df5eb4fe814fdd137e3f66cd4b4ec6c988174e0fe1c7a19e6eddf21763`
(`v1 1 0 10 pulse(0 10 0 0 0 10 10)`, `.tran 0.01 10 0`).

## Reproduce

```sh
pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-375/xyce-transient.ts \
  --output benchmarks/results/issue-375/xyce-transient-after.json --skip inductor-transient
```

`before` was produced the same way on base commit
`569aaad3d222697a9079f19c3fac4f09cb8383d9` (core sources reverted, dist rebuilt).
Reference: ngspice-47 (Homebrew, KLU), macOS arm64, Node v22.23.1.
Grid: spice-ts timepoints, ngspice linearly interpolated. `inductor-transient`
is skipped in both runs because it does not terminate on the base commit
(issue #366, PR #377). All other Xyce transient fixtures have identical status
before/after (ngspice rejects `TSTEP=0`, spice-ts rejects `newlte`, the diode
breakdown `.step` fixture has no transient comparison).

## rlc-transient vs ngspice-47

Before (base): spice-ts 1002 points, ngspice 1019; first sample V(1) spice-ts 10 V, ngspice 0 V.

| signal | abs max | abs RMS | rel max | rel RMS |
| --- | --- | --- | --- | --- |
| i(l1) | 2.5 | 0.912 | 1 | 1 |
| i(v1) | 2.5 | 0.912 | 1 | 1 |
| v(1) | 10 | 0.3159 | 1.776e-16 | 5.615e-18 |
| v(2) | 10 | 2.754 | 3 | 0.8137 |
| v(3) | 10 | 3.041 | 2.97e+04 | 949.9 |

After (this PR): spice-ts 1018 points, ngspice 1019; first sample V(1) 0 V in both.

| signal | abs max | abs RMS | rel max | rel RMS |
| --- | --- | --- | --- | --- |
| i(l1) | 2.507e-04 | 2.421e-05 | 4.857e-03 | 2.584e-04 |
| i(v1) | 2.507e-04 | 2.421e-05 | 4.857e-03 | 2.584e-04 |
| v(1) | 9.948e-14 | 1.812e-14 | 9.948e-15 | 1.813e-15 |
| v(2) | 7.521e-04 | 7.262e-05 | 7.657e-05 | 9.174e-06 |
| v(3) | 1.626e-04 | 1.541e-05 | 0.4629 | 0.02074 |

Remaining honest gap: v(3) relative max 0.46 is at early timepoints where
V(3) is ~1e-4 V (absolute error 1.6e-4 V max). Its cause was not
investigated in this PR; it is published as-is.

## Tests

- `red.txt`: new `packages/core/src/devices/pulse-source.test.ts` on base code (8/8 fail).
- `green.txt`: same file with the fix (8/8 pass).
- Sabotage: removing the driver hook fails the batch and stream tests; removing
  the WASM hook fails the new WASM test.
- Updated expectations: `companion.test.ts` RC end value (now 0.98845, ngspice-47
  prints 0.9884542 for that netlist) and the rlc-transient point count (1002 → 1018).
- `accuracy-after.txt`: `npx tsx benchmarks/accuracy.ts --ci` with the fix (all within bounds).
