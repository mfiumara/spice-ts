# MOS6 and HFET1 configured junction GMIN remediation

PR #1074, issue #1068. Baseline `b844a17c8cabc5917ca0627c6e3ba4908c85783b`.
Original MIT probe decks `mos6.cir` and `hfet1.cir`; provenance is recorded in
`benchmarks/SOURCES.md`. Native executable is Homebrew ngspice-47 with KLU.

## Reproduce

Install with `pnpm install --frozen-lockfile`. On the baseline plus RED commit
`7caa7d2d`, run:

```
spice-heavy pnpm exec tsx benchmarks/results/issue-1068/remediation.ts before
```

On the fixed head, use the same command with `after`. The script passes identical
input bytes to both engines, including `.control` printing at numdgt=17, and
retains native stdout, netlist bytes and numeric errors in the two JSON receipts.
No tolerance, fixture, or per-circuit solver tuning is applied.

## Current results (amperes)

| Device / option | ngspice-47 | Before | After |
| --- | ---: | ---: | ---: |
| MOS6 I(vd), gmin=1e-9 | -5.0000001e-9 | -5.0001e-12 | -5.0000001e-9 |
| MOS6 I(vd), gmin=0 | -1e-16 | -5.0001e-12 | -1e-16 |
| MOS6 I(vd), default | -5.0001e-12 | -5.0001e-12 | -5.0001e-12 |
| HFET1 I(vg), gmin=1e-9 | 3.877996708269481e-9 | 1.8799957224760933e-9 | 3.877995722476093e-9 |
| HFET1 I(vg), gmin=0 | 1.877996708269481e-9 | 1.8799957224760933e-9 | 1.8779957224760927e-9 |
| HFET1 I(vg), default | 1.879996708269481e-9 | 1.8799957224760933e-9 | 1.8799957224760933e-9 |

MOS6 now matches exactly for all three options. HFET1 retains its pre-existing
approximately 9.86e-16 A native difference in gate-resistance leakage, below the
new unchanged 1e-6 relative plus 1e-18 A test threshold. Defaults are unchanged.
The review/card's rounded -5e-09 A is the expected order of magnitude; the card's
-5e-08 A is not the measured result for 5 V and gmin=1e-9 S.

## Fix and device audit

MOS6 reads `ctx.gmin ?? DEVICE_GMIN` once per load and uses it for source/body
and drain/body currents and conductances in both reverse and exponential
branches. HFET1's remaining hard-coded reverse gate leakage also ignored
CKTgmin. `evaluateHFET1` now accepts a defaulted gmin argument; all device callers
pass the current context value. The native reference is
https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/hfet1/hfetload.c
(`leak`, reverse branch; HFETAload passes CKTgmin).

Audited every production TypeScript file under `packages/core/src/devices` for
`JUNCTION_GMIN`, `GMIN`, and `1e-12` (excluding tests, no fixture loosening):

- MOS6 and HFET1 were the only remaining fixed junction loads; both are fixed.
- BJT, diode, JFET, MOS1/2/3, BSIM1/2, BSIM3, BSIM4, VDMOS, VBIC,
  MES/MESA already receive the context baseline. MOS3 is not modified.
- MES/MESA model constants and BSIM4/load's default argument are defaults,
  not overrides of a configured context value.
- MOS1's `GMIN` is a separate channel regularizer, not junction conductance.
- Other 1e-12 literals are permittivity, resistance/inductance floors,
  integration convergence thresholds, tolerances, time conversions, XSPICE
  defaults, or EKV parameter defaults, not hard-coded CKTgmin junction loads.
- BJT's instance-scaling comment still mentions a fixed gmin. The load is
  context-configured; multiplier scaling is a separate pre-existing limitation,
  not changed by this remediation.

## Verification receipts

`remediation-red.txt`: exit 1, 8 failing / 2 passing tests before the fix.
`remediation-green.txt`: exit 0, 39 passing tests in 5 files, including all 10
new regressions. Covers default/zero/nondefault native currents, and changing
assembler deviceGmin through 0 -> 1e-9 -> 1e-3 -> 0. MOS6 checks both current
and conductance on reverse, negative exponential and positive exponential
branches; HFET1 checks both reverse-junction conductances.

`remediation-build.txt` and `remediation-lint.txt`: each command exit 0.
Full suite runs only through `spice-heavy pnpm test`; required exact-head CI
is verified in the Kanban handoff. No performance claim is made.
