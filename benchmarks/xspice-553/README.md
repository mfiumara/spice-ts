# XSPICE analog code models, slice 2 (issue #553)

Slice 1 (#487, PR #554) added `gain`, `summer`, `mult`, `divide`, `pwl`,
`limit`, `int` and `d_dt` (see `benchmarks/xspice/README.md`). This slice adds
seven more ngspice-47 code models and the `%g`/`%gd` port types:

| Model | ngspice-47 source | Notes |
|---|---|---|
| `climit` | `icm/analog/climit/cfunc.mod` | Limits between `cntl_lower + lower_delta` and `cntl_upper - upper_delta`, with `cm_smooth_corner` and the `cm_smooth_discontinuity` control partials. Returns a zero output when the linear range is negative, as ngspice does. |
| `ilimit` | `icm/analog/ilimit/cfunc.mod` | Current-limited output stage on `%g` inout ports. `cm_climit_fcn` limits the equivalent voltage to the supplies. The supply current flows through `pos_pwr`/`neg_pwr`. A null supply port reads +-1e6 V and gets no output. ngspice's partials are kept as written, including the source-side corner that uses `i_sink_range` and the `PARTIAL(out,out)` that omits part of the r_out derivative. |
| `hyst` | `icm/analog/hyst/cfunc.mod` | The leg (rising/falling) is a state: INIT picks it from the first input. A transient load starts from the accepted leg and the accepted load commits it. In DC the leg carries from point to point, because dctrcurv.c rotates the state vectors between sweep points. |
| `slew` | `icm/analog/slew/cfunc.mod` | Output follows the input at most at `rise_slope`/`fall_slope`, from the input and output accepted at T(1). AC gain 1. |
| `sine` | `icm/analog/sine/cfunc.mod` | Controlled oscillator. In DC the output is the midpoint. In transient the phase is `phase(T1) + freq(input) * (TIME - T1)`. AC gain 0. |
| `cmeter` | `icm/xtradev/cmeter/cfunc.mod` + `cm/cmmeters.c` | `gain` times the capacitance read at INIT: capacitors with a terminal on the input node, plus those behind a zero-valued DC voltage source from it. |
| `lmeter` | `icm/xtradev/lmeter/cfunc.mod` + `cm/cmmeters.c` | Same for inductors, combined in parallel starting from 1e12 H. |

`%g` (and differential `%gd`) ports are inout: the port voltage is an input
and the port current an output, stamped like ngspice MIFload's
`MIF_CONDUCTANCE` (a current source plus its partials).

Still typed-unsupported (`UnsupportedCodeModelError`):

- `triangle`, `square`, `oneshot`: they place their corners with
  `cm_analog_set_temp_bkpt`. That is a breakpoint for one step only: ngspice
  resets `g_mif_info.breakpoint.current` every step and backs up a converged
  step that passed it. The spice-ts transient driver only has permanent
  breakpoints. A prototype that scheduled every request as a permanent
  breakpoint left one stale breakpoint per step when the frequency changed,
  and the run stalled on femtosecond steps at the next corner. These models
  need a driver-level temporary-breakpoint hook first.
- `s_xfer`, `astate`, `delay`, `ota`, `xfer`, `pwlts`, `multi_input_pwl`,
  `filesource`, the other xtradev models (`aswitch`, `zener`, `core`,
  `lcouple`, ...), and every digital/event-driven model.

## Evidence

Machine: macOS 27.0.1 arm64 (Apple M5 Pro), Node v22.23.1, ngspice-47
(Homebrew). The fixture decks are under `fixtures/`. Each one has a
`.control` block that ngspice runs. spice-ts runs the same cards with the
block replaced by the analysis line.

### Unit tests (exact ngspice-47 values)

`packages/core/src/devices/xspice/xspice-analog2.test.ts` pins:

- `fixtures/op.cir`: all 12 outputs and the ilimit supply currents match to
  1e-10 or better. The deck covers hyst on both legs, ilimit with a null
  `pos_pwr` and in its source limit, three climit regions, cmeter through a
  0 V source, lmeter in parallel, and slew. ngspice's `v2#branch` is
  -6.00249950007e-03 A and spice-ts gives -6.00249950007e-03 A.
- `fixtures/dc-sweep-down.cir`: 25 points of a downward sweep. hyst stays on
  the falling leg from 2 V down (it reads 0.975 at 0.875 V, where the rising
  leg would read 0.775). climit, ilimit and slew are also checked. 99/100
  values agree to 1e-10. ilimit at row 20 sits in the sink smoothing corner:
  -1.498497774 in spice-ts against -1.49849836114 in ngspice (4e-7 relative).
  There both engines stop Newton on reltol, because the ngspice ilimit
  Jacobian is not the exact derivative.
- `fixtures/ac.cir`: AC gains of hyst (slope 2), climit (0.75: pin plus the
  smoothed cntl_upper partial), ilimit (2.997002997 and the supply current
  -2.997e-3 A), slew (1) and sine (0) all match at 10 Hz, 100 Hz and 1 kHz.
- `fixtures/tran.cir`: 15 ngspice samples of hyst, slew and a constant-control
  sine agree within 0.2 %. Two of them are on the hyst falling leg after the
  input peak.
- `fixtures/gd-ports.cir`: `%gd` ports and a null port between two connected
  ones. v(30) is 0.999000999 in both engines.

### Transient waveform comparison (`compare-tran.ts`)

`pnpm exec tsx benchmarks/xspice-553/compare-tran.ts`. Errors are normalised to
the signal's peak |ngspice| value. spice-ts takes 623 points and ngspice 252.

| Signal | st->ng (corpus-f direction) | ng->st |
|---|---|---|
| v(10) hyst | 9.27e-3 | 5.24e-4 |
| v(20) slew | 4.84e-3 | 9.85e-15 |
| **v(30) sine, ramped control: LOSS** | **2.47e-2** | **2.47e-2** |
| v(60) sine, constant control | 7.67e-4 | 3.39e-4 |

- **Loss, v(30).** The sine phase is `phase(T1) + freq(TIME) * (TIME - T1)`,
  a right-endpoint rectangle rule over each engine's own timesteps. With a
  ramped control, the phase therefore depends on the step sizes.
  - The continuous phase reaches exactly 2.5 cycles at 2 ms, where the
    output is 0.
  - ngspice (10 µs steps) gives -0.0457 there and spice-ts (smaller steps)
    gives -0.0209.
  - The model is the same in both engines. The difference comes from the
    step sizes, and it is published as a 2.5 % loss.
- The hyst and slew st->ng values come from linearly interpolating ngspice's
  coarser grid across their corners. The ng->st direction is at or below
  5.3e-4.

### corpus-f decks (identical bytes, `corpus-f-after.json`)

These are the corpus-f fixtures that use any of the new models. Each was run
with `pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts
--corpus-f-fixture-child <id>` against a `pnpm build` of this branch, through
`spice-heavy`. No fixture or harness file was edited.

"Before" is `origin/main` b3f04506: every one of these decks stops with
`UnsupportedCodeModelError` (`hyst` or `sine`).

| Fixture | ngspice | before | after | Worst (signal) |
|---|---|---|---|---|
| `analog_models3_dc.deck` | op:1 | unsupported | **matched** | 1.3e-15 (op i(v2)) |
| `analog_models3_swept_dc.deck` | dc:30 | unsupported | **matched** | 8.9e-13 (dc i(v2)) |
| **LOSS** `analog_models3_ac.deck` | ac:21 | unsupported | **mismatch** | 1.11 (ac v(2)) |
| **LOSS** `analog_models3_transient.deck` | tran:158 | unsupported | **mismatch** | 0.0181 (tran v(10)) |
| `analog_models4_{ac,dc,swept_dc,transient}.deck` | success | unsupported | unsupported (`triangle`) | — |

Totals over these 8 decks:

| | before | after |
|---|---|---|
| matched | 0 | 2 |
| mismatch | 0 | 2 |
| unsupported | 8 | 4 |

- **Loss, `analog_models3_ac`, ac v(2).**
  - v(2) is the node of `v2 2 0 DC 10.0`, which has no AC excitation.
  - ngspice prints exactly 0 there. spice-ts solves -1.11e-12 V, which is LU
    round-off next to the ilimit supply stamps.
  - Against a zero reference this counts as a 1.11 normalised error.
  - Every other signal agrees, for example v(30) = 0.999900009999 in both
    engines.
- **Loss, `analog_models3_transient`, tran v(10).**
  - The ngspice samples match: interpolating spice-ts at every ngspice
    timepoint gives at most 1.1e-16.
  - The 1.8 % comes from interpolating ngspice linearly across the hyst
    corner at 1.1 s, where ngspice steps from 1.028 s straight to 1.128 s.
  - This is the same artefact as the slice-1 `divide` loss.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm --filter @spice-ts/core exec vitest run src/devices/xspice/
(cd benchmarks/xspice-553/fixtures && ngspice -b op.cir)   # likewise dc-sweep-down, ac, tran, gd-ports
pnpm exec tsx benchmarks/xspice-553/compare-tran.ts
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts \
  --corpus-f-fixture-child examples-xspice-original-examples-analog-models3-ac-deck
```
