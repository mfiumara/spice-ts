# Issue #403: diode junction charge integrated as q(v), not C(v)·dv/dt (+ #389)

## Change

Transient analysis now integrates the diode junction charge the way ngspice-47
does (`dioload.c` `DIOcapCharge` + `NIintegrate`):

- `Diode` computes the charge q(v) = depletion (bottom + sidewall, the integral
  of the existing ngspice-identical C(v), including the linear extension above
  `FC*VJ`) + diffusion `TT*(Id + GMIN*v)`, and integrates it itself with the
  step's rule: Backward Euler `(q - q_n)/h`, trapezoidal
  `2(q - q_n)/h - i_n`, or variable-step Gear-2 on `q_n`, `q_{n-1}`. The
  companion (`dI/dV`, `i - dI/dV·v`) is stamped into G and b. Charge and charge
  current are committed only on accepted timepoints; the DC point starts at
  rest (`i_0 = 0`), as at ngspice `MODEINITTRAN`.
- `DeviceModel` gains three optional members: `integratesTransientCharge`,
  `stampTransientCharge(ctx, integration)` and `stampAcceptedChargeCurrent(ctx)`.
  `buildCompanionSystem` skips `stampDynamic` for such devices and stamps the
  charge companion after the C-matrix history, with the effective method
  (order-1 bootstrap already applied). The driver adds the accepted charge
  current to the trapezoidal history of linear reactive rows that share the
  node, and no longer forces the raw-RHS history for these devices.
- `stampDynamic` (AC, noise, PZ, TF) is unchanged. The two-terminal `RS`
  fallback (`RS > 0` without expansion, which compiled circuits never produce
  for a charge-storing diode) keeps the old C(v) stamp.

No tolerance, option, fixture or per-circuit setting was changed. The Xyce
`Level2_Temp_Dep_Breakdown` endpoint bound in
`xyce-primitive-compatibility.test.ts` is **tightened** from 1e-5 V back to
5e-6 V, as #389 asked.

## RED → GREEN

`packages/core/src/devices/diode-junction-charge.test.ts` (3 tests): `v(out)`
vs ngspice-47 every 2 ns on the depletion deck (bound 1 mV) and the TT deck
(bound 2 mV), and the #389 level-1 endpoint with `CJO=1P` (bound 1e-6 V from
ngspice, 1e-7 V from the no-CJO run).

- RED on `origin/main` `3f3e2ca`: 3/3 fail (10.98 mV, 18.56 mV, 4.12e-6 V).
- GREEN on this branch: 3/3 pass.

## Identical-netlist comparison vs ngspice-47

Both engines get the same netlist; spice-ts gets it without the `.control`
block. Decks and raw ngspice `print` output are in `ngspice/`. Transient is
compared on ngspice's linearised grid (501 points at 0.1 ns, 301 at 1 ns for
`tran_rc`), spice-ts interpolated linearly. `before` = `origin/main` `3f3e2ca`
dist, `after` = this branch. Full metrics in `compare-before.json` /
`compare-after.json`.

Machine: Apple M5 Pro arm64 macOS, Node v22.23.1, ngspice-47 (Homebrew).

`v(out)` absolute error (V):

| deck | max before | RMS before | max after | RMS after |
|---|---|---|---|---|
| `tran` (issue #388 deck, default VJ) | 1.12e-2 | 4.93e-3 | 1.70e-4 | 1.33e-5 |
| `tran_vj1` (issue #403 deck) | 1.12e-2 | 4.93e-3 | 1.70e-4 | 1.33e-5 |
| `tran_vj1_reltol6` (+`.options reltol=1e-6` in both) | 3.32e-3 | 1.02e-3 | 2.59e-4 | 3.55e-5 |
| `tran_tt` (`TT=5n`, reverse recovery) | 1.93e-2 | 5.68e-3 | 4.42e-4 | 1.41e-4 |
| `tran_rs` (`RS=50`, `TT=1n`, expanded RS) | 6.42e-3 | 1.67e-3 | 1.56e-4 | 3.93e-5 |
| `tran_rc` (SIN rectifier + 100p load, `CJO=10p TT=2n`) | 2.33e-1 | 1.48e-1 | 1.39e-2 | 1.34e-3 |
| `tran_sw` (`CJSW=8p PJ=1`, `FC=0.3`) | 1.69e-1 | 6.99e-2 | 1.64e-1 | 6.89e-2 |
| `tran_sw_fc05` (`tran_sw` with default `FC`) | 1.80e-2 | 7.90e-3 | 1.66e-2 | 6.61e-3 |

#389 level-1 deck, `v(2)` at t = 1 s (ngspice-47: 7.280849981115 with and
without `CJO`):

| deck | before | after |
|---|---|---|
| `l1_cjo_27` (`CJO=1P`) | 7.280854101164, 645 points, err 4.12e-6 | 7.280849632118, 21 points, err 3.49e-7 |
| `l1_nocjo_27` | 7.280849632118, 21 points, err 3.49e-7 | unchanged |

With the charge integrated, `CJO=1P` no longer changes the result (the
endpoints agree to 9e-14 V), exactly as in ngspice. #389 had the same root
cause: the C(v) companion forced the raw-RHS trapezoidal history for every
circuit with a charge-storing diode. Unchanged Xyce fixture, endpoint error vs
gold at TEMP = -55/25/72: before 2.34e-6/5.33e-6/8.30e-6 V (645 points), after
6.65e-7/9.58e-7/1.11e-6 V (21 points).

Timepoints / runtime (5-run mean, same machine), before → after: `tran_vj1`
524 → 519 (3.2 → 3.4 ms), `tran_tt` 521 → 520, `tran_rs` 519 → 520,
`tran_sw` 520 → 518, `tran_rc` 692 → 322 (7.5 → 2.6 ms). ngspice-47 accepts
508 points on the 0.1 ns decks and 308 on `tran_rc`.

## Losses and residuals (not hidden)

- **Sidewall decks barely move** (`tran_sw` 164 mV max, `tran_sw_fc05`
  16.6 mV). The cause is a model difference, not integration: ngspice-47
  offsets the sidewall charge above `FCS*VJSW` with the *bottom* junction's
  `DIOtF1`, so its sidewall charge steps at `FCS*VJSW`. A trial that
  reproduced the offset improved `tran_sw_fc05` (12.4 mV max, 1.0 mV RMS) but
  made `tran_sw` worse (316 mV / 84 mV): a downward charge step makes q(v)
  non-monotonic, and ngspice and spice-ts Newton land on different
  charge-conserving branches. It was not shipped. Filed as #450.
- `tran_rc` keeps 13.9 mV max (1.3 mV RMS) around the conduction peaks.
- LTE control is still voltage-based; ngspice also bounds the truncation error
  of each charge (`CKTterr`). Not changed here.
- Other `stampDynamic` nonlinear devices (BJT, JFET, MOSFET, BSIM3, MESA,
  HFET) still use the C(v) companion. Out of scope for this card.

## Aggregate / corpus impact

None of the 100 aggregate fixtures has a charge-storing diode *instance* in a
compared transient: `classic/ltra_{1,2,3}` define diode models (one with `TT`)
but instantiate none; `corpus-d/diode_mult`, `corpus-d/diodecw8` and
`xyce/DIODE/diode.cir` have no `CJO`/`CJSW`/`TT` (they keep the existing path,
`integratesTransientCharge = false`); `xyce/DIODE/Level2_Temp_Dep_Breakdown`
is `unsupported` in the aggregate and is covered by
`xyce-primitive-compatibility.test.ts` (tightened, above).
`pnpm exec tsx benchmarks/aggregate-report.ts --check` stops in preflight with
`aggregate provenance is stale` (SOURCES.md and fixture-tree hashes) on this
branch **and** on `origin/main` `3f3e2ca`; that refresh is pending in #386.
The aggregate files were not regenerated.

## Gates (this branch, local)

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`: pass.
- `pnpm test`: pass (core 109 files / 1384 tests, other packages and the
  comparison harness also pass).
- `pnpm bench:accuracy`: exit 0, same 8-circuit table as main (no accuracy
  circuit has diode charge); the regenerated `accuracy-results.json` was not
  committed.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm test
pnpm -C packages/core exec vitest run src/devices/diode-junction-charge.test.ts
node benchmarks/results/issue-403/compare.mjs > after.json
SPICE_TS_DIST=<main worktree>/packages/core/dist node benchmarks/results/issue-403/compare.mjs > before.json
for f in benchmarks/results/issue-403/ngspice/*.cir; do ngspice -b "$f" > "${f%.cir}.out"; done
pnpm bench:accuracy
```
