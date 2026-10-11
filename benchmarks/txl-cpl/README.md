# Issue #491: TXL (Y) and CPL (P) lossy lines vs ngspice-47

spice-ts now accepts and simulates the ngspice-47 single lossy line
(`Yname n1 ref1 n2 ref2 model [len=..]`, TXL model) and the coupled
multiconductor line (`Pname in1..inN ref1 out1..outN ref2 model [len=..]`,
CPL model with upper-triangular `R=`/`L=`/`G=`/`C=` vectors and `length=`).
The implementation is a port of ngspice-47 `txl/` and `cpl/`
(`txlsetup.c`/`txlload.c`, `cplsetup.c`/`cplload.c`), including the TXL to CPL
switch for R/L > 1.6e9, the 1e-4 clamp on every R matrix entry, and ngspice's
DC model (series resistance R_ii * length). Only `.op`, `.dc` and `.tran` are
defined for these devices in ngspice; any other analysis on a circuit with a
Y/P element is rejected with an `InvalidCircuitError`.

This file publishes the wins and the losses. Nothing here is tuned per circuit.

## Setup coefficients: exact against ngspice's own code

The recursive-convolution coefficients (modal delays, Pade residues and poles,
`ifImg`) were compared with a C harness that contains ngspice-47's
`ReadTxL`/`ReadCpL` + `coupled()` setup code verbatim.

| Harness build | TXL (5 parameter sets) | CPL 1/2/3-line | CPL 4-line `cpl1_4_line` | CPL 6-line `cpl_ibm1` | CPL 4-line `cpl3_4_line` |
|---|---|---|---|---|---|
| `cc -O2 -ffp-contract=off` (IEEE, no FMA, same arithmetic as JS) | worst rel 0 | worst rel <= 3e-14 | 2.9e-9 | 2.1e-12 | 7.5e-5 |
| `cc -O2` (clang default `-ffp-contract=on`) | worst rel <= 5e-13 | up to 1.0 on symmetric decks (mode order / `ifImg` flips) | 9.1 | 1.2e-3 | 6.3e5 |

So spice-ts reproduces the ngspice setup algorithm to rounding. The large
differences against the default build are caused only by fused multiply-add
contraction. On symmetric and 4-line models the Jacobi diagonalisation and
the Pade fits are ill-conditioned enough that FMA rounding changes mode order
and poles near zero. On `cpl3_4_line` the largest pole real part is 4.2e-4
with FMA and 5.9e-3 without it. The Homebrew arm64 ngspice-47 binary was
built with contraction: `otool -tV` finds 30,262 `fmadd`/`fmsub`-family
instructions in it. A Homebrew/arm64 ngspice and an x86-64
(no-FMA) ngspice build can therefore disagree with each other on these decks.
The unit tests pin the IEEE values (`packages/core/src/devices/swec-lines.test.ts`).

## Transient waveforms: corpus-f decks (#484)

Fixtures: the 16 corpus-f P/Y decks from ngspice `3ef069fb1f04177a153f342a32d941fc20ff047e`
(BSD-3-Clause), as committed on branch `wt/corpus-f-batch1-484` @ `5014ae0b`
under `benchmarks/corpus/corpus-f/fixtures/`. Reproduce with:

```sh
pnpm exec tsx benchmarks/txl-cpl/compare.ts <fixture paths...>
```

The metric is max |spice-ts - ngspice| over every ngspice timepoint, divided by
the ngspice swing of that vector. The worst plotted vector is reported.
ngspice-47 is the Homebrew build on macOS arm64. Both simulators use their
default step control on the deck's own `.tran` card. Runtimes are wall clock,
and ngspice's includes process start.

Issue #491 lists 15 decks. Corpus-f has a 16th deck with Y/P instances:
`examples/TransmissionLines/cpl4_txl_2_line.sp`, with three TXL `y` lines and
one CPL `p2` line. #484 bucketed it differently, so it was missing from the
#491 list. It is included below. Before this PR it stopped with a typed
`ParseError: Unsupported device card: 'Y'`.

Unchanged decks in spice-ts, on main with #489:
- 13 of the 16 parse and simulate.
- `cpl3_4_line` (both copies) fails with a typed `TimestepTooSmallError`; see the losses below.
- `cpl_ibm1a.sp` stops on its `.control repeat` loop with a typed
  `ParseError`. That is control-language scope, not a line-model gap.

For the waveform comparison, decks that run `tran` from `.control` have that
command moved to a `.tran` card. The same netlist then goes to both simulators.

| Fixture | Lines | spice-ts vs ngspice (worst max err / swing) | ngspice self-spread (default vs TMAX=tstep/10) | spice-ts vs ngspice at TMAX=tstep/10 | points ng / ts | runtime ng / ts |
|---|---|---|---|---|---|---|
| tests/transmission/txl1_1_line.cir | TXL | **0.95%** | 1.21% | | 492 / 669 | 97 ms / 99 ms |
| tests/transmission/txl2_3_line.cir | 3x TXL | **1.47%** | | | 493 / 1005 | 28 ms / 159 ms |
| tests/transmission/cpl_ibm2.cir | CPL 2 | **0.11%** | 0.12% | | 217 / 1168 | 28 ms / 149 ms |
| tests/transmission/cpl3_4_line.cir | CPL 4 | **LOSS: `TimestepTooSmallError` at t=37.6 ns** | 9.98% | | | |
| examples/.../txl1_1_line.sp | TXL | 0.95% | 1.21% | | 492 / 669 | 28 ms / 10 ms |
| examples/.../txl2_3_line.sp | 3x TXL | 1.47% | | | 493 / 1005 | 79 ms / 44 ms |
| examples/.../txl3_1_line.sp | TXL, BJT drivers | 8.58% | 5.63% | 3.32% | 263 / 2641 | 62 ms / 0.9 s |
| examples/.../txl4_1_line.sp | TXL | 5.22% | 11.62% | | 148 / 606 | 66 ms / 0.3 s |
| examples/.../cpl_ibm2.sp | CPL 2 | 0.11% | 0.12% | | 217 / 1168 | 25 ms / 59 ms |
| examples/.../cpl2_2_line.sp | CPL 2, MOS drivers | 8.49% | 8.71% | 4.24% | 96 / 2221 | 21 ms / 97 ms |
| examples/.../cpl_ibm3.sp | CPL 2 + CPL 4 + TXL | 15.45% | 13.48% | 1.36% | 124 / 13165 | 69 ms / 2.4 s |
| examples/.../cpl1_4_line.sp | CPL 4, MOS drivers | **LOSS: 16.70%** | 4.19% | 15.07% | 978 / 7011 | 75 ms / 1.1 s |
| examples/.../cpl3_4_line.sp | CPL 4 | **LOSS: `TimestepTooSmallError` at t=37.6 ns** | 9.98% | | | |
| examples/.../cpl_ibm1.sp | CPL 6, ECL (BJT) | **LOSS: 50.4%, ~220x slower** | 5.57% | | 392 / 29551 | 0.14 s / 30 s |
| examples/.../cpl_ibm1a.sp | CPL 6, ECL (BJT) | **LOSS: 50.4%, ~390x slower** (first `tran` only) | | | 392 / 29551 | 0.11 s / 45 s |
| examples/.../cpl4_txl_2_line.sp | 3x TXL + CPL 2, BJT driver, diode load | **LOSS: 27.63%, ~65-125x slower** | 26.89% | 3.41% | 285 / 12748 | 0.10-0.18 s / 11-17 s |

The ngspice self-spread column runs ngspice against itself, on the same deck,
with only TMAX changed. On these edge-dominated digital decks, timestep
placement alone moves ngspice by 4-13%. The "at TMAX=tstep/10" column reruns
both simulators with that tighter TMAX. Where the gap closes (`cpl_ibm3`
15.5% -> 1.4%, `txl3_1_line` 8.6% -> 3.3%, `cpl2_2_line` 8.5% -> 4.2%), the
default-step difference is step placement, not the line model.

### Linear multiconductor check

The same 4-line `cpl1_4_line` model was driven by a 50-ohm pulse with
resistive terminations instead of MOS drivers. That is the
`CPL_4_LINE_DECK` in the unit test. It agrees within 1.6% of swing (0.021 V on
4.18 V). The 2-line version agrees within 0.92%. The 4-line device model
therefore tracks ngspice in a linear circuit. The `cpl1_4_line.sp` loss
appears only with the cross-coupled MOS inverters, where the far ends of the
lines drive gates that feed back into the lines.

## Losses and open scope

1. `cpl3_4_line` (both copies). This is the model whose Pade fit depends on
   FMA rounding (see above). ngspice runs it, but its own result depends on
   TMAX: max v(6) is 5.04 V with the deck's tmax 0.05n and 6.65 V with
   tmax 0.002n (both peak near 31.9 ns, ngspice `meas`). spice-ts reaches the same coefficients as the IEEE build of
   ngspice's code, then fails at 37.6 ns with a typed `TimestepTooSmallError`.
   It does not return a silently wrong waveform.
2. `cpl_ibm1` / `cpl_ibm1a` (6 coupled lines with ECL drivers):
   - Setup matches ngspice's code to 2e-12.
   - After the shortest modal delay (167 ps) the transient collapses to
     sub-picosecond steps: 10.6k steps under 0.1 ps and 29.5k points total,
     against ngspice's 392.
   - The waveform is 50% of swing off, and the run takes 30-70 s on an M-series Mac.
   - The root cause in the load/step interaction is not identified yet.
3. `cpl1_4_line.sp` stays 15% off even at matched TMAX.
4. `cpl_ibm1a.sp` needs `.control repeat` (control language, outside #491).
5. `cpl4_txl_2_line.sp` (3 TXL lines + a 2-line CPL, BJT driver, diode
   receiver). Follow-up: #549.
   - This PR turns a typed `ParseError` into a waveform, with no warning, that
     is 27.6% of swing off at the deck's own `tran 0.1ns 60ns 0 0.35N`:
     v(4) is off by 1.24 V on a 6.41 V swing, v(2) by 0.98 V on 4.56 V, and
     v(5) by 0.54 V on 1.97 V.
   - ngspice is not converged on this deck either. With TMAX=0.01n it moves
     26.9% of swing away from its own default run (285 vs 6026 points).
   - With both simulators at TMAX=0.01n, the gap closes to 3.41% (v(4) 0.17 V
     on 6.38 V). That points to step placement rather than the line model,
     but the default-step result is still published as a loss.
   - Runtime is a loss by itself. At the default step, spice-ts takes 12748
     points and 11-17 s against ngspice's 285 points and 0.10-0.18 s, about
     65-125x slower (three runs on M-series Macs under varying load). At
     TMAX=0.01n it is 13-18 s vs 0.6-1.1 s.

   Reproduce, with the fixture taken from `wt/corpus-f-batch1-484`:

   ```sh
   git show origin/wt/corpus-f-batch1-484:benchmarks/corpus/corpus-f/fixtures/examples/TransmissionLines/cpl4_txl_2_line.sp > /tmp/cpl4_txl_2_line.sp
   pnpm exec tsx benchmarks/txl-cpl/compare.ts /tmp/cpl4_txl_2_line.sp
   # matched TMAX: the same deck with its .control tran changed to TMAX=0.01n
   sed 's/^tran 0.1ns 60ns 0 0.35N/tran 0.1ns 60ns 0 0.01n/' /tmp/cpl4_txl_2_line.sp > /tmp/cpl4_tmax.sp
   pnpm exec tsx benchmarks/txl-cpl/compare.ts /tmp/cpl4_tmax.sp
   ```
