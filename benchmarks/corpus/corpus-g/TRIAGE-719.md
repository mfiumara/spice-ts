# corpus-g: triage of the 14 decks over the 1% parity threshold (#719)

Hand-written companion to the generated [README.md](README.md). Scope: the 14 corpus-g decks where both engines succeed on the identical bytes but spice-ts exceeded the uniform threshold in the #711 report (main `45d6ea73`). No fixture, tolerance, threshold or metric was changed. "Before" is the committed #711 value; "After" is this branch merged with main `9048f8cf` (#713 Xyce .options, #715 MOS3/MOS9, #723), `outcomes.json` regenerated once with `parity.ts` (outcome SHA-256 `0654595d...`: matched 66, mismatch 17, spice-ts-loss 45 of 128). Merged again with main `544bfffc` (#726, #737, #738) and regenerated once more (outcome SHA-256 `2a95fe8c...`: matched 77, mismatch 18, spice-ts-loss 33): every row below keeps its value; the extra mismatch is SANDLER25/sandler25.cir (0.838 v(34)), newly runnable after that merge and not triaged here. Merged a third time with main `219b04ee` (#741, #746, #744) and regenerated once (outcome SHA-256 `cc41c469...`: matched 85, mismatch 18, spice-ts-loss 25): every row below keeps its outcome and value; the 8 new matches are decks those PRs made runnable (EXP/SFFM/PWL sources, PJFET, one .measure deck) and four AC matches shift only in values below 1e-4. Metric: corpus-f's, max|spice-ts - ngspice| / max(peak |ngspice|, floor) for the worst signal, ngspice interpolated onto spice-ts points.

## Tool

`triage-detail.ts` runs one fixture through ngspice-47 and spice-ts exactly as `parity.ts` does and prints every signal's error plus two diagnostics (the location of the largest plain-interpolation difference, and the error at ngspice's own points). Diagnostic variants, never the published comparison: `--tmax <s>` (both engines with .tran TMAX forced), `--deck <file>` (both engines run a variant deck, e.g. one parameter removed), `--reference-tmax <s> [--candidate ngspice]` (fine-step ngspice as reference; shows which engine's default-step run is closer to it; not a convergence proof), `--dump <file>` (both series as JSON).

```sh
pnpm build
pnpm exec tsx benchmarks/corpus/corpus-g/triage-detail.ts abm-func-func-cir
pnpm exec tsx benchmarks/corpus/corpus-g/triage-detail.ts vstartest-vstartest-cir --tmax 0.1n
```

## Root causes

| Root cause | Kind | Issue | Fixtures |
|---|---|---|---|
| MOS1 ignored RD/RS and RSH*NRD/NRS | simulator bug, fixed here | [#729](https://github.com/mfiumara/spice-ts/issues/729) | VSTARTEST, invert1_alt, BUG_237 |
| `C n+ n- MODEL 1pf`: value after the model name dropped (0 F) | simulator bug, fixed here | [#730](https://github.com/mfiumara/spice-ts/issues/730) | BUG_374 |
| Node names case-sensitive (`F` and `f` are two nodes) | simulator bug, open | [#728](https://github.com/mfiumara/spice-ts/issues/728) | ABM_FUNC |
| ngspice drops the value-less card `L1 1a 0` and reports a 2.3e12 V floating node; spice-ts silently uses 0 H | ngspice-side quirk (+ spice-ts diagnostics gap) | [#733](https://github.com/mfiumara/spice-ts/issues/733) | INDUCTOR/ErrorMessageTest |
| Unstable DC equilibrium: round-off and RELTOL decide when the oscillator fires | ill-posed comparison (metric) | [#734](https://github.com/mfiumara/spice-ts/issues/734) | WAMPDE simple_single_channel |
| Default-step output on fast edges / switching (both engines step-limited, vertical-edge timing) | metric artefact | [#592](https://github.com/mfiumara/spice-ts/issues/592) | SANDLER22, latch, SANDLER21, SANDLER23, opampal, hussamp_par1, ddt, residuals of the three MOS1 decks; follow-up: invert42_mos3, subckt_a0, erroroption |
| At RELTOL 1e-4 spice-ts takes a 1.44 ns step across a MOS1 switching edge where ngspice's steps shrink to 0.12 ns | simulator step control, open | [#742](https://github.com/mfiumara/spice-ts/issues/742) | follow-up: MPDE/invert1 |
| Step after the first accepted step: ngspice repeats it (`dctran.c` skips the truncation check at `firsttime`), spice-ts doubles | simulator step control, open | [#561](https://github.com/mfiumara/spice-ts/issues/561) | ddt (grid), SANDLER21 and hussamp_par1 start-up |

Also found while fixing, not in this table: MOS1 instance `M` is ignored ([#731](https://github.com/mfiumara/spice-ts/issues/731)); the complex AC LU accepts tiny diagonal pivots and its result depends on card order ([#732](https://github.com/mfiumara/spice-ts/issues/732)). `.options timeint abstol=` sets VNTOL in spice-ts but only ABSTOL in ngspice-47 (checked with `option` in a control block); giving both engines the same semantics moves BUG_237 (after #729) from 0.0308 to 0.0246 (VNTOL 1e-6) or 0.0259 (VNTOL 1e-3) and leaves WAMPDE at 2.45, so it is not a root cause of these rows (reported on #713).

## Per fixture

| Fixture | Before | After | Classification and evidence |
|---|---|---|---|
| WAMPDE/BLOCKING/simple_single_channel.cir | 2.45 i(l2) | 2.45 i(l2) | #734. Both engines start on the same OP (i(l1) 0.049914 A) and leave it by numerical residue: first pulse at 1.56 us (ngspice) vs 33.0 us (spice-ts). With the diagnostic variant RELTOL=1e-6 ABSTOL=1e-12 the order swaps (ngspice 33.4 us, spice-ts 1.90 us). Without K1 (stable circuit) every voltage agrees (1.46e-5). Published loss, not a parity measure. |
| ABM_FUNC/func.cir | 1 i(bf) | 1 i(bf) | #728. `BF F 0` and `RF f 0` are one node in ngspice (i(bf) 4000 A at t = 0 into the 1 mOhm RF) and two in spice-ts (i(bf) = 0). The other 7 signals agree to <= 3.2e-4. Open simulator bug (needs a compile-wide node-identity change, out of this card's small-fix scope). Fixed by #763: case-folded node names, now matched at 3.2e-4. |
| BUG_374/capacitor-bug.cir | 1 i(vin) | matched, 2.1e-4 | #730, fixed. spice-ts simulated `C 3 0 CMODEL 1pf` as 0 F (v(3) = v(1), i(vmon) = 0); ngspice reads the 1 pF lead value (tau 1 ns). |
| INDUCTOR/ErrorMessageTest.cir | 1 v(1a) | 1 v(1a) | #733. ngspice: `Warning: 'l1 1a 0' is not a valid inductor instance line, ignored!`, then gmin stepping and v(1) = v(1a) = -2.34e12 V. spice-ts shorts L1 (v(1) = -5 mV). L2 branch agrees to 1e-12. ngspice-side quirk; published loss. |
| SANDLER22/sandler22.cir | 0.86 v(4) | 0.86 v(4) | #592. 555 output falls in a few ns. Both engines at TMAX 50 ns agree on every waveform; v(4) crosses 2.5 V at 599.865 us (ngspice) and 599.891 us (spice-ts). Default runs: spice-ts 599.890 us, ngspice 599.553 us, so the default-step ngspice edge is 0.31 us off its own fine-step value and spice-ts 0.025 us. The 0.86 is a vertical-edge timing difference. |
| ABM/ddt.cir | 0.5 i(v1) | 0.5 i(v1) | #592 + #561. Both engines output the same staircase (ddt = 0 for the first two points, then pi); only the grid differs: ngspice 0, 1e-7, 2e-7, 4e-7, spice-ts 0, 1e-7, 3e-7, 7e-7. Interpolating ngspice's 0 -> pi step at 3e-7 gives 1.57. Values at common times are identical (v(1) 4.9e-12). |
| BUG_237/Bug_237_A1.cir | 0.426 i(vdddev) | 0.0246 i(vdddev) | #729 fixed (most of the loss; 0.0308 before #713 landed and changed `.options timeint abstol=` handling). Residual: supply-current spikes at the 5 ns edges are not step-converged in either engine (worst 0.071 / 0.019 / 0.047 at TMAX 0.2 / 0.05 / 0.02 ns on a 5 us window, peak still moving); both default runs are 0.28-0.31 from fine-step ngspice → #592. |
| MOSFET_ParamAliases/invert1_alt.cir | 0.256 i(vdddev) | 0.211 v(vout) | #729 fixed. With every capacitance removed both engines now agree to 5e-5 (0.0557 before the fix). Residual: with both engines at TMAX 0.1 ns, 0 of 6 signals over 1% (worst 4.8e-4); the default runs are equally far from fine-step ngspice (0.254 spice-ts, 0.267 ngspice) → #592. |
| MCNC_BJT_LATCH/latch.cir | 0.236 i(vref) | 0.236 i(vref) | #592. At TMAX 20 ps: 0.0107 (i(vset)). Against fine-step ngspice (TMAX 10 ps) the default runs score 0.484 (spice-ts) and 0.566 (ngspice). Residual 1.07% at matched fine steps not root-caused. |
| VSTARTEST/vstarTest.cir | 0.218 v(vout) | 0.202 v(vout) | Same models and inverter as invert1_alt: #729 fixed; at TMAX 0.1 ns 0 of 6 over 1% (4.8e-4); default runs vs fine ngspice 0.143 (spice-ts) and 0.175 (ngspice) → #592. |
| SANDLER21/sandler21.cir | 0.127 i(v2) | 0.127 i(v2) | #592 + #561. v(x2.27) at the 0.9 ms edge goes 0.0642 → 0.0356 with both at TMAX 10 ns (2 ms window). i(v2) 0.112 at t = 3 ns comes from the different steps after t = 0; on a 0.2 us window both engines take the same first steps and every signal agrees (worst 0.0042). Default runs vs fine ngspice: 0.213 (spice-ts), 0.163 (ngspice). |
| SANDLER23/sandler23.cir | 0.0498 v(x1.12) | 0.0498 v(x1.12) | #592. Linear op-amp macro model. 1-1.3 ms window: 0.0265 at default steps, 2.3e-11 with both at TMAX 2 ns. |
| MCNC_BJT_OPAMPAL/opampal.cir | 0.0189 i(vvin) | 0.0189 i(vvin) | #592. i(vvin) is a 0.14 uA input current; 0.0068 at ngspice points. Default runs vs fine ngspice: 0.334 (spice-ts) and 0.310 (ngspice). Every other of the 74 signals is <= 5.2e-4. |
| IC_AND_NODESET/hussamp_par1.cir | 0.0174 i(vap) | 0.0174 i(vap) | #592 + #561. Worst point is at t = 3e-11, the first steps of the PULSE edge; 0.009 at ngspice points and 0.0028 at ngspice points with both at TMAX 10 ps. |

## New mismatches after merging main

#713 and #715 made previously unsupported decks run, and four of them land above 1%. Same tool and committed fixtures; the published values below are those in `outcomes.json` at outcome SHA-256 `0654595d...` and are unchanged at `cc41c469...` (main after #735). For the two 30 us MOS3 decks some diagnostics use a variant deck with `.tran 20ns 7us` (first two input periods) so fine-step runs stay short; it is marked "7 us window".

| Fixture | Published | Classification and evidence |
|---|---|---|
| MOS13_IC/invert42_mos3.cir (MOS3, 42-inverter chain) | 0.838 v(vout) | #592. v(vout) switches in about 1 ns, so the score is edge timing. All 19 v(vout) 2.5 V crossings of the published runs are within 0.86 ns of ngspice's, with random sign and no build-up along the 30 us (+0.11, -0.26, -0.53, -0.40, ... -0.85 at 22.63 us, ... -0.36 ns). ngspice's own first crossing moves 1.6 ns with TMAX (1.56560 us default, 1.56557 at 1 ns, 1.56398 at 0.2 ns, 1.56404 at 0.05 ns); spice-ts gives 1.56571 (default) and 1.56402 (TMAX 0.2 ns). 7 us window against ngspice at TMAX 0.05 ns: 0.99 (spice-ts default) and 0.989 (ngspice default). Both engines start from the same operating point: every node voltage at t = 0 agrees to 1.7e-14 (ngspice-47 mos3load.c uses the instance `IC=` values as the MODEINITJCT starting guess). |
| SUBCKT/subckt_a0.cir (MOS3, two inverters) | 0.246 i(vdddev) | #592. Both engines at TMAX 0.1 ns (full window): every voltage agrees to 4.3e-4 and i(vin1) to 1.6e-4; only the i(vdddev) spike at a 5 ns edge stays at 0.054, and ngspice at TMAX 0.1 ns is itself 0.052 from ngspice at 0.02 ns (7 us window), so that spike is not step-converged in either engine. At TMAX 1 ns, ngspice is 0.246 from its own TMAX 0.2 ns run. 7 us window against ngspice at TMAX 0.02 ns: 0.233 (spice-ts default) and 0.191 (ngspice default). The MOS3 DC drain currents of the second-stage model pair (VTO ±1.0, RD/RS, NFS, VMAX, THETA, ETA, KAPPA) agree to 8e-7 relative over a 0-5 V gate sweep (scratch .dc deck), so the MOS3 port is not the cause. |
| TIA/ERROROPTION/erroroption.cir (MOS1 inverter, 0.15 us ramps) | 0.225 i(vin1) | #592. ngspice-47 rejects `method=7` ("bad type given for option method") and keeps TRAP, MaxOrder 2, RELTOL 1e-3; spice-ts does the same with a parse warning. Both engines at TMAX 0.2 ns: 0 of 6 signals over 1% (worst 7.1e-4). Against ngspice at TMAX 0.2 ns: 1.13 (spice-ts default) and 1.15 (ngspice default); i(vin1) is the Meyer gate current, which neither engine resolves at default steps. |
| MPDE/invert1.cir (same inverter, `reltol=1.0e-4 maxord=5` applied by ngspice) | 0.177 i(vin1) | spice-ts step control, open: [#742](https://github.com/mfiumara/spice-ts/issues/742). Both engines at TMAX 0.2 ns: 0 of 6 over 1% (worst 4.2e-5). Against ngspice at TMAX 0.2 ns the default runs differ: 0.177 (spice-ts) and 0.0564 (ngspice). At t = 3.22122 us, where the output switches, both engines output a point: spice-ts reaches it with a 1.44 ns step and gives i(vin1) -4.45e-5 A, ngspice with steps shrinking to 0.12 ns and gives -3.52e-5 (fine-step -3.53e-5). With the default RELTOL (erroroption above) the two engines are equally far from the fine-step run, so the gap shows only at RELTOL 1e-4. |

Root-cause rows added for these: #592 gains invert42_mos3, subckt_a0 and erroroption; #742 is new (MPDE/invert1). No simulator fix in this follow-up: the only spice-ts-side cause (#742) needs a step-by-step trace against ngspice's dctran.c and is not a small change.

## What this does not claim

- The #592/#561 rows stay published mismatches. They are not counted as matches and no metric was changed.
- Fine-step agreement is diagnostic evidence, not a convergence proof.
- ABM_FUNC (#728), INDUCTOR (#733) and MPDE/invert1 (#742) remain open; only #729 and #730 are fixed here.
