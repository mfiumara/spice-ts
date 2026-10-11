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

Unchanged decks in spice-ts, on main with #489, #545, #550 and #552:
- 12 of the 16 parse and simulate.
- `cpl3_4_line` (both copies) and `cpl1_4_line.sp` fail with a typed `TimestepTooSmallError`; see the losses below.
- `cpl_ibm1a.sp` stops on its `.control repeat` loop with a typed
  `ParseError`. That is control-language scope, not a line-model gap.

For the waveform comparison, decks that run `tran` from `.control` have that
command moved to a `.tran` card. The same netlist then goes to both simulators.

The spice-ts column, points and runtimes were re-measured after merging main
(ngspice first transient step #545, MOS level-1 #552) into this branch. The last two accuracy
columns were measured before that merge (PR head `584e331`) and were not re-run.
The before/after table further down shows what the merge changed.

| Fixture | Lines | spice-ts vs ngspice (worst max err / swing) | ngspice self-spread (default vs TMAX=tstep/10) | spice-ts vs ngspice at TMAX=tstep/10 (pre-#545) | points ng / ts | runtime ng / ts |
|---|---|---|---|---|---|---|
| tests/transmission/txl1_1_line.cir | TXL | **0.91%** | 1.21% | | 492 / 686 | 107 ms / 101 ms |
| tests/transmission/txl2_3_line.cir | 3x TXL | **1.48%** | | | 493 / 984 | 87 ms / 363 ms |
| tests/transmission/cpl_ibm2.cir | CPL 2 | **0.09%** | 0.12% | | 217 / 1207 | 114 ms / 325 ms |
| tests/transmission/cpl3_4_line.cir | CPL 4 | **LOSS: `TimestepTooSmallError` at t=30.5 ns** | 9.98% | | | |
| examples/.../txl1_1_line.sp | TXL | 0.91% | 1.21% | | 492 / 686 | 95 ms / 233 ms |
| examples/.../txl2_3_line.sp | 3x TXL | 1.48% | | | 493 / 984 | 37 ms / 176 ms |
| examples/.../txl3_1_line.sp | TXL, BJT drivers | 8.82% | 5.63% | 3.32% | 263 / 2475 | 124 ms / 3.0 s |
| examples/.../txl4_1_line.sp | TXL | 5.13% | 11.62% | | 148 / 616 | 185 ms / 1.5 s |
| examples/.../cpl_ibm2.sp | CPL 2 | 0.09% | 0.12% | | 217 / 1207 | 116 ms / 0.4 s |
| examples/.../cpl2_2_line.sp | CPL 2, MOS drivers | 8.16% | 8.71% | 4.24% | 96 / 2770 | 80 ms / 0.9 s |
| examples/.../cpl_ibm3.sp | CPL 2 + CPL 4 + TXL | 15.40% | 13.48% | 1.36% | 124 / 13385 | 67 ms / 6.6 s |
| examples/.../cpl1_4_line.sp | CPL 4, MOS drivers | **LOSS: `TimestepTooSmallError` at t=46.3 ns** (16.70% before #545) | 4.19% | 15.07% | | |
| examples/.../cpl3_4_line.sp | CPL 4 | **LOSS: `TimestepTooSmallError` at t=30.5 ns** | 9.98% | | | |
| examples/.../cpl_ibm1.sp | CPL 6, ECL (BJT) | **LOSS: 43.6%, ~220x slower** | 5.57% | | 392 / 27128 | 0.16 s / 34 s |
| examples/.../cpl_ibm1a.sp | CPL 6, ECL (BJT) | **LOSS: 43.6%, ~380x slower** (first `tran` only) | | | 392 / 27128 | 0.10 s / 37 s |
| examples/.../cpl4_txl_2_line.sp | 3x TXL + CPL 2, BJT driver, diode load | **LOSS: 26.87%, ~65-125x slower** | 26.89% | 3.41% | 285 / 12091 | 0.10-0.18 s / 7-17 s |

The ngspice self-spread column runs ngspice against itself, on the same deck,
with only TMAX changed. On these edge-dominated digital decks, timestep
placement alone moves ngspice by 4-13%. The "at TMAX=tstep/10" column reruns
both simulators with that tighter TMAX. Where the gap closes (`cpl_ibm3`
15.5% -> 1.4%, `txl3_1_line` 8.6% -> 3.3%, `cpl2_2_line` 8.5% -> 4.2%), the
default-step difference is step placement, not the line model.

### Effect of merging the ngspice first transient step (#545)

Same machine, same fixtures. Before = PR head `584e331`, after = this branch
with `origin/main` @ `2812371` merged in (#545 first step, #550 Gummel-Poon,
#552 MOS level 1). #552 alone moved only the MOS-driven decks (txl1/txl2,
cpl2_2, cpl1_4 failure time) by at most 0.1 point. Worst max err / swing.

| Fixture | before | after |
|---|---|---|
| cpl1_4_line.sp | 16.70% | **`TimestepTooSmallError` at 46.3 ns** |
| cpl3_4_line (both) | `TimestepTooSmallError` at 37.6 ns | `TimestepTooSmallError` at 30.5 ns |
| cpl_ibm1 / cpl_ibm1a | 50.39% | 43.62% |
| cpl4_txl_2_line.sp | 27.63% | 26.87% |
| cpl2_2_line.sp | 8.49% | 8.16% |
| txl3_1_line.sp | 8.58% | 8.82% |
| txl4_1_line.sp | 5.22% | 5.13% |
| cpl_ibm2 (both) | 0.11% | 0.09% |
| cpl_ibm3.sp | 15.45% | 15.40% |
| txl1_1_line / txl2_3_line (both) | 0.95% / 1.47% | 0.91% / 1.48% |

The unit-test errors on the sampled ngspice points also moved
(`packages/core/src/devices/swec-lines.test.ts`): cpl_ibm2 4.3e-4 -> 6.1e-4 V,
the linear 4-line check 0.021 -> 0.049 V, complex-pole + sub-step TXL
1.8e-3 -> 2.9e-3 V; txl1 and lossless/shunt-G are unchanged. Reverting #545 on
the merged tree restores the old numbers. After the first step, spice-ts still
takes 0.2, 0.6, 1.4, 3.0 ps where ngspice takes 0.2, 0.4, 0.8, 1.6 ps on the
same deck (an RC deck shows the same grid, so this is driver step control).
Tracked in #561.

### Linear multiconductor check

The same 4-line `cpl1_4_line` model was driven by a 50-ohm pulse with
resistive terminations instead of MOS drivers. That is the
`CPL_4_LINE_DECK` in the unit test. It agrees within 0.049 V on a 4.18 V
swing (1.2%; 0.021 V before #545). The 2-line version agrees within 0.09%.
The 4-line device model therefore tracks ngspice in a linear circuit. The
`cpl1_4_line.sp` loss appears only with the cross-coupled MOS inverters, where
the far ends of the lines drive gates that feed back into the lines.

## Losses and open scope

1. `cpl3_4_line` (both copies). This is the model whose Pade fit depends on
   FMA rounding (see above). ngspice runs it, but its own result depends on
   TMAX: max v(6) is 5.04 V with the deck's tmax 0.05n and 6.65 V with
   tmax 0.002n (both peak near 31.9 ns, ngspice `meas`). spice-ts reaches the same coefficients as the IEEE build of
   ngspice's code, then fails at 30.5 ns (37.6 ns before #545) with a typed
   `TimestepTooSmallError`. It does not return a silently wrong waveform.
2. `cpl_ibm1` / `cpl_ibm1a` (6 coupled lines with ECL drivers):
   - Setup matches ngspice's code to 2e-12.
   - After the shortest modal delay (167 ps) the transient collapses to
     sub-picosecond steps: 27.1k points total against ngspice's 392.
   - The waveform is 44% of swing off (50% before #545), and the run takes
     30-70 s on an M-series Mac.
   - The root cause in the load/step interaction is not identified yet.
3. `cpl1_4_line.sp`: since #545 it stops at 46.3 ns with a typed
   `TimestepTooSmallError` (dt=3.1e-16). Before #545 it ran and was 16.7% off
   (15% off even at matched TMAX). Tracked in #561.
4. `cpl_ibm1a.sp` needs `.control repeat` (control language, outside #491).
5. `cpl4_txl_2_line.sp` (3 TXL lines + a 2-line CPL, BJT driver, diode
   receiver). Follow-up: #549.
   - This PR turns a typed `ParseError` into a waveform, with no warning, that
     is 27.6% of swing off at the deck's own `tran 0.1ns 60ns 0 0.35N`
     (26.9% after merging #545, see the before/after table):
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
