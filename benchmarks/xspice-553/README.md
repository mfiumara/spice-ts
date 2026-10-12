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

### Review fixes (identical netlists vs ngspice-47)

- hyst leg after the operating point: `V1 1 0 -1.5` into
  `hyst(in_low=-2 in_high=-1 hyst=0.1 ...)`. INIT runs on the operating
  point's first iteration (input 0, so the falling leg). ngspice-47 gives
  v(2) = 0.6 at the op and at every tran point. spice-ts gave 0.4 for t >= 0
  because accepting the op re-ran INIT on -1.5 V. It now gives 0.6.
- cmeter/lmeter with an instance m: `C1 1 0 2p m=3` and `L1 1 6 1u m=2`.
  ngspice-47's cmmeters.c reads CAPcapac / INDinduct, which exclude m:
  v(10) = 7.0 and v(11) = 0.666666666667. spice-ts gave 11.0 and 0.4. It now
  gives 7.0 and 0.666666666667.
- Both cases are tests in `xspice-analog2.test.ts`. Re-running the four
  `analog_models3` corpus-f decks gives the same outcomes and worst errors as
  the table above.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm --filter @spice-ts/core exec vitest run src/devices/xspice/
(cd benchmarks/xspice-553/fixtures && ngspice -b op.cir)   # likewise dc-sweep-down, ac, tran, gd-ports
pnpm exec tsx benchmarks/xspice-553/compare-tran.ts
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts \
  --corpus-f-fixture-child examples-xspice-original-examples-analog-models3-ac-deck
```

# Slice 3: event-driven digital models and node bridges

Adds the ngspice-47 XSPICE event-driven simulator (`src/xspice/evt`, digital
node type `idn/idndig.c`) in `packages/core/src/devices/xspice/event-network.ts`
and the code models in `digital-models.ts`:

| Model | ngspice-47 source |
|---|---|
| `d_buffer`, `d_inverter`, `d_and`, `d_nand`, `d_or`, `d_nor`, `d_xor`, `d_xnor` | `icm/digital/<model>/cfunc.mod`: rise/fall delays, U output taking the delay of the edge it leaves, `inertial_delay=true` (cm_is_inertial with `digital_delay_type` unset) |
| `adc_bridge` | thresholds, Schmitt trigger when in_low > in_high, single-input multi-bit converter |
| `dac_bridge` | out_low/out_high/out_undef (mean when only low/high given), t_rise/t_fall ramps from T(1), breakpoints at input changes and at ramp ends, multi-bit converter |

Engine semantics follow ngspice: `%d` ports with `~` inversion; 0/1/U states
with strong/resistive/hi-Z/undetermined strengths and the idn_digital_resolve
table for nodes with several drivers; EVTqueue_output (a new event cancels
every later queued one); EVTop alternation for the operating point;
before each analog step every event due at or before its end is processed and
a dac_bridge breakpoint cuts the step (dctran.c); EVTbackup on a rejected
step; EVTcall_hybrids after the truncation check (skipped on the first step)
and EVTaccept. The analog halves of the bridges take no node truncation error
(ngspice MIFtrunc only acts through cm_analog_integrate). Digital node values
are exposed as `TransientResult.digital(node)`, like `eprint`.

Still typed-unsupported: flip-flops/latches (`d_dff`, `d_jkff`, `d_tff`,
`d_srff`, `d_dlatch`, `d_srlatch`), `d_fdiv`, `d_osc`, `d_tristate`, `d_ram`,
`d_lut`/`d_genlut`, `d_pwm`, `d_source`, `d_state`, `d_cosim`, the real-node
models, and automatic analog/digital bridging (a node used both ways is an
`InvalidCircuitError`). Digital instances run in `.op` and `.tran` only (no
UIC).

## Evidence (ngspice-47, identical netlists)

Unit tests (`packages/core/src/devices/xspice/xspice-digital.test.ts`), decks
under `fixtures/digital-*.cir`:

- `digital-gates.cir`: every output change of all eight gates (and an inverted
  input/output `d_and`) equals ngspice `eprint` (numdgt=15) in state, strength
  and time (1e-12 relative); both engines take 510 timepoints.
- `digital-tran.cir`: inertial delay (a 0.5 us pulse swallowed by a 1 us
  inertial buffer, passed by the transport one), two buffers driving one node
  (resolved U), an inertial `d_xor`, a 2-bit adc_bridge into a 2-bit
  dac_bridge, and dac ramps: all digital changes equal `eprint`, 24 dac
  samples on ramps agree to 1e-9 V.
- `digital-op.cir`: the operating point with `~` ports, out_undef and
  multi-bit bridges equals ngspice to 1e-12.
- RED on `origin/main` 089ef16c: 4 of 5 tests fail (`UnsupportedCodeModelError`).

### corpus-f decks (identical bytes, `corpus-f-digital-after.json`)

All 25 corpus-f fixtures whose `.model` cards use one of the new models were
rerun with `--corpus-f-fixture-child <id>` through `spice-heavy` against a
`pnpm build` of this branch. "Before" is `origin/main` 089ef16c (every one
stopped at an unsupported code model or card).

| Fixture | ngspice | before | after | Worst (signal) |
|---|---|---|---|---|
| `digital_invert.deck` | tran:218 | unsupported | **matched** (tran:218) | 3.5e-13 (v(17)) |
| `digital_models1.deck` | tran:510 | unsupported | **matched** (tran:510) | 0 |
| **LOSS** `digital_models.deck` | tran:71 | unsupported | **mismatch** | 1.0 (i(v1)) |
| **LOSS** `mixed_ref.deck` | tran:108 | unsupported | **mismatch** | 0.0123 (v(1)) |
| **LOSS** `mixed_io_size.deck` | tran:208 | unsupported | **mismatch** | 0.208 (v(4)) |
| 20 others | | unsupported | unsupported (now at d_dff, d_dlatch, d_ram, d_osc, d_tristate, d_lut, d_pwm, d_to_real, UGATE, subcircuit A-cards, string .param) or both-failed | — |

Totals over the 25 decks: matched 0 -> 2, mismatch 0 -> 3, unsupported
22 -> 17, both-failed 3 -> 3.

- **Loss, `digital_models`.** Not a digital error: the deck drives the adc
  with `pulse(0 1 2e-8 1e-9 1e-9)`. ngspice-47 vsrcload.c sets PW = 0 when
  only TR and TF are given (5 coefficients); spice-ts holds the pulse high
  (PW = TSTOP), so v(1) differs from 2.2e-8 s on. Separate source bug.
- **Loss, `mixed_ref`.** The same 1.23 % v(1) error appears on `origin/main`
  with the digital lines removed (gain-only deck, 1209 vs 108 points): the
  analog `gain` instances take node-voltage truncation that ngspice MIFtrunc
  does not apply. The digital nodes themselves match.
- **Loss, `mixed_io_size`.** The `summer` instance shares that analog
  truncation gap, so spice-ts takes 829 points against 208. The adc_bridge
  samples its input at accepted analog points, so the different steps move
  the enable edge (1.0104e-4 s against ngspice's 1.03e-4 s) and every later
  clock edge; the dac ramps then differ by up to 0.2 V. With node truncation
  disabled spice-ts takes 223 points and the error drops to 0.09.
