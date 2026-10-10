# Issue #388: diode depletion capacitance (VJ/VJSW = 1, FC/FCS = 0.5)

## Change

`packages/core/src/devices/diode.ts` now uses ngspice-47's depletion
capacitance (`diosetup.c`, `diotemp.c`, `dioload.c`):

- `VJ` defaults to 1 V (was 0.7 V). `VJSW`/`PHP` defaults to 1 V on its own
  (it used to follow `VJ`).
- `FC` and `FCS` are read from the model (default 0.5). They used to be
  ignored, with 0.5 hardcoded.
- Above `FC*VJ` the capacitance follows ngspice's linear extension
  `C = CJ0/F2 * (F3 + M*Vd/VJ)`, where `F2 = (1-FC)^(1+M)` and
  `F3 = 1 - FC*(1+M)`. The sidewall uses `FCS`, `VJSW` and `MJSW`. The old code
  held `C` at `CJ0/0.5^M` above the threshold. The capacitance is continuous
  at `FC*VJ`, and a test guards that.
- The `.disto` path and AC/transient/noise now share one function
  (`depletionChargeTaylor`). `.disto` already used VJ=1/FC=0.5, so its output
  does not change.

No transient-step, harness, MOSFET, BJT or `.step TEMP` code was changed. No
fixture was edited. No tolerance was tuned for a specific circuit.

## RED to GREEN

`packages/core/src/devices/diode-depletion.test.ts` compares AC `vm(out)` and
`vp(out)` at 100 MHz against ngspice-47 on the same decks, using a relative
bound of 1e-4 on magnitude and 1e-4 rad on phase.

- RED, commit `bdf98e0` (test only): 7 failed, 1 passed. The passing test is
  the continuity guard, which the old constant extension also met. The failures
  had magnitude errors of 9.6%, 29.6%, 14.5%, 5.9%, 19.5% and 6.7%; the FC=0.5
  case failed on phase.
- GREEN (fix commit): 8 of 8 pass.

## Identical-netlist comparison vs ngspice-47

Both engines get the same netlist; spice-ts gets it without the `.control`
block. The decks and the raw ngspice `print` output are in `ngspice/`. AC is
compared at the 16 ngspice frequencies (`dec 5 1e6 1e9`). Transient is compared
on ngspice's linearised 0.1 ns grid (501 points), with spice-ts interpolated
linearly. Relative error uses a floor of 1e-3 x peak |ref|.

- `before` is `origin/main` `d0d3801` (diode.ts from main, dist built in this
  worktree).
- `after` is this branch.

Machine: Apple M5 Pro arm64 macOS, Node v22.23.1, ngspice-47 (Homebrew).

`|v(out)|` error:

| deck | max abs before | RMS abs before | max rel before | RMS rel before | max abs after | RMS abs after | max rel after | RMS rel after | max phase err (deg) before → after |
|---|---|---|---|---|---|---|---|---|---|
| `ac` (issue deck, default VJ, reverse) | 3.66e-2 | 1.79e-2 | 0.102 | 6.98e-2 | 9.32e-11 | 4.60e-11 | 2.50e-10 | 1.73e-10 | 2.77 → 7.1e-9 |
| `acrs` (+`RS=200`) | 3.53e-2 | 1.62e-2 | 7.04e-2 | 3.48e-2 | 1.09e-10 | 5.01e-11 | 2.12e-10 | 1.04e-10 | 1.98 → 6.1e-9 |
| `ac_sw` (`VJ=0.7`, `CJSW` + `PJ=1`, default VJSW) | 2.27e-2 | 1.09e-2 | 6.09e-2 | 4.30e-2 | 6.71e-11 | 3.21e-11 | 1.75e-10 | 1.24e-10 | 1.67 → 5.0e-9 |
| `ac_fwd` (0.8 V forward, `IS=1e-20`) | 9.86e-2 | 4.77e-2 | 0.300 | 0.228 | 1.83e-4 | 8.84e-5 | 1.86e-4 | 9.56e-5 | 7.49 → 5.5e-3 |
| `ac_fwd_fc` (+`VJ=1 FC=0.3`) | 5.20e-2 | 2.49e-2 | 0.147 | 0.111 | 1.84e-4 | 9.17e-5 | 1.87e-4 | 9.88e-5 | 3.92 → 5.5e-3 |
| `ac_sw_fwd` (sidewall, forward) | 6.85e-2 | 3.28e-2 | 0.198 | 0.148 | 1.84e-4 | 9.36e-5 | 1.87e-4 | 1.01e-4 | 5.11 → 5.5e-3 |
| `ac_sw_fcs` (+`FCS=0.2`) | 2.49e-2 | 1.20e-2 | 6.82e-2 | 5.09e-2 | 1.85e-4 | 9.65e-5 | 1.87e-4 | 1.03e-4 | 1.85 → 5.4e-3 |
| `ac_fwd_noleak` (`ac_fwd` with `IS=1e-30`) | 9.96e-2 | 4.83e-2 | 0.300 | 0.229 | 2.17e-10 | 1.05e-10 | 6.17e-10 | 4.75e-10 | 7.49 → 2.0e-8 |

Transient `PULSE(-1 1 0 1n 1n 20n 50n)`, `.tran 0.1n 50n`, `v(out)` in V:

| deck | max abs before | RMS abs before | max rel before | RMS rel before | max abs after | RMS abs after | max rel after | RMS rel after |
|---|---|---|---|---|---|---|---|---|
| `tran` (default VJ) | 3.54e-2 | 1.76e-2 | 35.1 | 1.65 | 1.04e-2 | 4.63e-3 | 8.26 | 0.376 |
| `tran_vj1` (`VJ=1`) | **8.82e-3** | **3.65e-3** | **6.70** | **0.305** | **1.04e-2** | **4.63e-3** | **8.26** | **0.376** |
| `tran_vj1_reltol6` (+`.options reltol=1e-6`) | 4.98e-3 | 2.36e-3 | 4.93 | 0.224 | 3.50e-3 | 1.05e-3 | 0.330 | 1.66e-2 |

Full metrics are in `compare-before.json` and `compare-after.json`.

## Losses and residuals (not hidden)

- `tran_vj1` gets worse: max abs 8.8 mV → 10.4 mV, RMS 3.7 mV → 4.6 mV. The
  issue guessed that the 8.8 mV came from the FC region. That guess was wrong.
  AC now matches ngspice's capacitance to about 1e-10. The transient residual
  peaks on the falling edge (17.5 to 25 ns), where the junction leaves forward
  bias. It shrinks as the timestep is refined: with `reltol=1e-6` on both
  simulators, after is 3.5 mV max and 1.0 mV RMS, against 5.0 mV and 2.4 mV
  before. So what is left is transient discretisation error, not a model
  mismatch. spice-ts integrates the nonlinear junction as `C(v)·dv/dt` through
  the C matrix, while ngspice integrates the charge `dQ/dt`. The larger,
  correct forward capacitance makes that difference bigger. Moving to a
  charge-based nonlinear capacitor needs transient-step/device-contract
  changes, which are outside this card's scope. That work is filed as #403.
- The forward-bias AC decks keep about 1.9e-4 relative error. This comes from
  the diode's DC conductance, not from the capacitance: with conduction
  removed (`ac_fwd_noleak`, `IS=1e-30`) the error is 6.2e-10. spice-ts
  hardcodes `VT = 0.02585` V, while ngspice uses kT/q ≈ 0.025865 V at 27 °C.
  That is filed as #402.
- The ngspice aliases `PB` (= `VJ`), `MJ` (= `M`) and `CJ` (= `CJO`) are still
  silently ignored, both before and after this change. Filed as #404.

## Unchanged corpus fixtures that use diode capacitance

Every fixture SHA-256 is unchanged. The aggregate generated files were not
regenerated.

| fixture | SHA-256 (unchanged) | analysis | effect |
|---|---|---|---|
| `classic/spice3f5/diodisto.cir` | `912c8ced…6d11de8` | `.disto` | none. `.disto` already used VJ=1/FC=0.5. `issue-363/verify.ts` regenerates a `report.json` identical to the committed one except `generatedAt`/`runtimeMs` |
| `corpus-e/tests/d_diode.1.ckt` | `f84c531a…a9371055` | OP/DC | none. Capacitance is not used in DC |
| `corpus-e/tests/d_diode.6.ckt` | `d2d7df0b…ef346d9851` | OP/DC | none. Capacitance is not used in DC |
| `xyce/DIODE/diode_with_sidewall.cir` | `fb7d40fe…906d658` | DC sweep | none. Capacitance is not used in DC |
| `xyce/DIODE/Zener_5229.cir` | `aefc2180…938e9e` | DC | rejected before and after (`.OPTIONS DEVICE`) |
| `xyce/DIODE/Level2_Temp_Dep_Breakdown.cir` | `9c52a577…71bee0e` | `.step TEMP` tran | sets `VJ=1 FC=.5` explicitly and stays in reverse/breakdown, so its output is unchanged; `xyce-primitive-compatibility.test.ts` passes unchanged |

`git diff origin/main -- benchmarks/corpus benchmarks/SOURCES.md` is empty.

## Issue #389 (not closed by this change)

`l1_cjo_27`/`l1_nocjo_27` are the level-1 adaptation from #389. Their
endpoints are bit-identical before and after this change: with `CJO`,
7.280854109855 against ngspice's 7.280849981115 (|err| 4.13e-6 V); without
`CJO`, 7.280849640809 (|err| 3.40e-7 V). That deck sets `VJ=1 FC=.5`
explicitly and never forward-biases the junction, so the depletion-capacitance
defaults are not its root cause. #389 stays open.

## Gates (this branch, local)

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`: pass.
- `pnpm test`: pass. Core is 89 files with 1105 tests, including the 8 new
  ones. The other workspace packages and the comparison harness also pass.
- `pnpm bench:accuracy`: same 8-circuit table as main. No accuracy circuit
  uses diode capacitance. The regenerated `accuracy-results.json` was not
  committed.
- `pnpm bench:disto`: exit 0.
- `git diff --check`: clean.
- `pnpm exec tsx benchmarks/aggregate-report.ts --check` exits 1 with
  `aggregate provenance changed: … sources 49379991…`. The same failure
  happens on `origin/main` `d0d3801`: `benchmarks/SOURCES.md` changed in #371
  and the aggregate refresh is still pending (#386). This branch does not
  touch SOURCES.md, the corpus or the aggregate files, and they were not
  regenerated.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm test
pnpm -C packages/core exec vitest run src/devices/diode-depletion.test.ts
node benchmarks/results/issue-388/compare.mjs            # after
SPICE_TS_DIST=<main dist> node benchmarks/results/issue-388/compare.mjs   # before
for f in benchmarks/results/issue-388/ngspice/*.cir; do ngspice -b "$f" > "${f%.cir}.out"; done
pnpm bench:accuracy && pnpm bench:disto
pnpm exec tsx benchmarks/aggregate-report.ts --check
git diff --check
```
