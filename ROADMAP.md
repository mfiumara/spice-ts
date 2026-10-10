# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified against live GitHub state on 2026-10-10. The repository had 15 open issues: four in
M1, one in M2, four in M3, and six in M4.
Every open issue is represented below. A delivery is marked merged only when its PR is on `main`; accepted but
unmerged work remains an open gap. This reconciliation closes
[#168](https://github.com/mfiumara/spice-ts/issues/168) only when its PR merges.

## M1 Correctness parity

**Exit:** All open simulator bugs fixed; ≥100 public benchmark circuits run against ngspice in CI-able harness;
published parity report; agreed error thresholds met or gaps filed

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| Boost converter LTE collapse | [#43](https://github.com/mfiumara/spice-ts/issues/43) | [PR #78](https://github.com/mfiumara/spice-ts/pull/78) merged the RED regression, identical-netlist ngspice comparison, and general LTE retry fix |
| Common-source amplifier AC gain | [#44](https://github.com/mfiumara/spice-ts/issues/44) | [PR #66](https://github.com/mfiumara/spice-ts/pull/66) merged biased small-signal parity coverage |
| Comparison harness v2 | [#52](https://github.com/mfiumara/spice-ts/issues/52) | [PR #71](https://github.com/mfiumara/spice-ts/pull/71) merged CI-runnable OP/DC, AC, and TRAN aligned-error reports |
| Public ngspice corpus A | [#53](https://github.com/mfiumara/spice-ts/issues/53) | [PR #80](https://github.com/mfiumara/spice-ts/pull/80) merged 20 provenance-tracked fixtures; its validator runs all 20 with ngspice and retains every unsupported/reclassified spice-ts case |
| Public classic SPICE3 corpus B | [#54](https://github.com/mfiumara/spice-ts/issues/54) | [PR #93](https://github.com/mfiumara/spice-ts/pull/93) merged 20 byte-identical, provenance-tracked fixtures across eight categories; ngspice produces data for 19/20, while spice-ts parses 0/20 |
| Classic corpus comparison reporting | [#101](https://github.com/mfiumara/spice-ts/issues/101) | [PR #103](https://github.com/mfiumara/spice-ts/pull/103) integrated all 20 byte-identical fixtures into deterministic reporting; ngspice succeeds on 19/20, spice-ts remains unsupported on 20/20, and zero analyses currently match for comparison |
| Public Xyce corpus C | [#104](https://github.com/mfiumara/spice-ts/issues/104) | [PR #113](https://github.com/mfiumara/spice-ts/pull/113), merge commit `9408c70b84d36e41848cff75ecb979dbe1e4b549`, merged 20 byte-identical, provenance-tracked fixtures across nine categories; ngspice-47 passes 13/20 while spice-ts passes 0/20 |
| Public ahkab corpus D | [#115](https://github.com/mfiumara/spice-ts/issues/115) | [PR #128](https://github.com/mfiumara/spice-ts/pull/128), merge commit `9303e1dde74078fcf8182d04c304ebbb8f8090c0`, merged 20 byte-identical, GPLv2 provenance-tracked fixtures across five categories; ngspice-47 passes 0/20 on ahkab-specific syntax and spice-ts passes 0/20 (19 parse failures, 1 unsupported) |
| Public Gnucap corpus E | [#129](https://github.com/mfiumara/spice-ts/issues/129) | [PR #130](https://github.com/mfiumara/spice-ts/pull/130), merge commit `1c21cc7ab31365275c1eaa0f1318b1bbc7a3ca54`, merged 20 byte-identical, GPL-3.0-or-later provenance-tracked fixtures across five categories; ngspice-47 passes 5/20 while spice-ts passes 0/20 |
| Netlist compatibility audit | [#55](https://github.com/mfiumara/spice-ts/issues/55) | [PR #79](https://github.com/mfiumara/spice-ts/pull/79) merged the fixture-backed support matrix and filed gaps |
| Convergence audit | [#56](https://github.com/mfiumara/spice-ts/issues/56) | [PR #68](https://github.com/mfiumara/spice-ts/pull/68) merged hard-circuit regressions and before/after evidence |
| Structured convergence telemetry | [#64](https://github.com/mfiumara/spice-ts/issues/64) | [PR #82](https://github.com/mfiumara/spice-ts/pull/82) merged typed phase, iteration, and retry diagnostics |
| Chua circuit | [#48](https://github.com/mfiumara/spice-ts/issues/48) | [PR #81](https://github.com/mfiumara/spice-ts/pull/81) merged reproducible UIC seeds, mutual-inductance support, and identical-netlist ngspice waveform evidence |
| Diode commutation transient parity | [#65](https://github.com/mfiumara/spice-ts/issues/65) | [PR #86](https://github.com/mfiumara/spice-ts/pull/86) merged the RED regression, diode series-resistance model, and matched-point ngspice comparison |
| Initial-state semantics | [#73](https://github.com/mfiumara/spice-ts/issues/73) | [PR #85](https://github.com/mfiumara/spice-ts/pull/85) merged `.ic`, `.nodeset`, `.tran uic`, parser, and execution coverage |
| PWL source semantics | [#74](https://github.com/mfiumara/spice-ts/issues/74) | [PR #83](https://github.com/mfiumara/spice-ts/pull/83) merged ngspice-compatible PWL parsing and execution coverage |
| Supported directive semantics | [#77](https://github.com/mfiumara/spice-ts/issues/77) | [PR #88](https://github.com/mfiumara/spice-ts/pull/88) merged option precedence plus control/output directive classification |
| Xyce primitive-card parser gaps | [#116](https://github.com/mfiumara/spice-ts/issues/116) | [PR #127](https://github.com/mfiumara/spice-ts/pull/127), merge commit `d564ed04754e7bf44d08da1369ab6a164de68cc2`, merged standard SPICE title semantics, explicit title-less APIs, and bounded primitive-card compatibility; the post-fix Xyce matrix remained 4 pass, 11 unsupported, 1 convergence failure, and 4 execution failures before later TIMEINT and zero-ohm work |
| Xyce TIMEINT options | [#122](https://github.com/mfiumara/spice-ts/issues/122) | [PR #132](https://github.com/mfiumara/spice-ts/pull/132), merge commit `915c21ccce57ede0ca875e473b30ad93dd337c14`, mapped only solver-backed tolerances and integration methods while retaining named errors for unsupported fields; the unchanged Xyce corpus records spice-ts 5/20 passes versus ngspice-47 13/20 |
| Zero-ohm resistor handling | [#125](https://github.com/mfiumara/spice-ts/issues/125) | [PR #131](https://github.com/mfiumara/spice-ts/pull/131), merge commit `52049b304c238403fc09367fcfbeacf0fbd61cf2`, modeled zero-ohm resistors with an exact MNA branch constraint; the unchanged six-point Xyce deck converges while parallel ideal shorts remain explicitly singular |
| Bounded resistor-noise analysis (partial #75) | [#75](https://github.com/mfiumara/spice-ts/issues/75) | [PR #96](https://github.com/mfiumara/spice-ts/pull/96) merged typed LIN output/input-referred resistor-noise spectra and identical-netlist ngspice evidence while retaining explicit rejection of unsupported variants and analyses |
| DEC/OCT resistor noise and integrated totals (partial #75) | [#75](https://github.com/mfiumara/spice-ts/issues/75) | [PR #151](https://github.com/mfiumara/spice-ts/pull/151), reviewed head `6b2c4b9b5639c56cade080c1d995610d2f8c08a9`, squash merge `5554661ec9f955a05c260eff6d20e887d42cb356`, merged matched DEC/OCT grids and deterministic resistor-noise totals while explicitly rejecting unsupported diode, BJT, and MOSFET noise; spectral and integrated-total relative error remained approximately `1.7384e-7` |
| Bounded transfer-function analysis (partial #75) | [#105](https://github.com/mfiumara/spice-ts/issues/105) | [PR #112](https://github.com/mfiumara/spice-ts/pull/112), merge commit `a1665ae75d84364abeffa42f63358a69ef8622f3`, merged typed voltage gain/transimpedance and input/output resistance with identical-netlist ngspice evidence; differential/current outputs and stepped `.tf` remain explicitly unsupported |
| Composed independent-source waveform parsing (partial #123) | [#123](https://github.com/mfiumara/spice-ts/issues/123) | [PR #145](https://github.com/mfiumara/spice-ts/pull/145), reviewed head `d6e60efcb6ff246cd48fe639da2614ca264f68fb`, squash merge `dcbb8886275047066b000b7619508aa728a81d7d`, preserved explicit DC operating-point values alongside `SIN`/`SINE` transient behavior; the unchanged `jimi-fuzz` memory and parity failures remain open |
| Diode instance geometry | [#124](https://github.com/mfiumara/spice-ts/issues/124) | [PR #149](https://github.com/mfiumara/spice-ts/pull/149), reviewed head `d215e6181c898176724f67028dd3f4612ccb63b6`, squash merge `ac663a781105193ba8467965038ed4193c9280e2`, merged `AREA`, `PJ`, and `M` geometry semantics with a `0.3173478983869692%` ngspice-47 current comparison while rejecting unsupported trailing fields |
| Corpus-E BJT Schmitt transient LTE | [#139](https://github.com/mfiumara/spice-ts/issues/139) | [PR #147](https://github.com/mfiumara/spice-ts/pull/147), reviewed head `c274fad3f6622a32893692646f8f9829e36ff59e`, squash merge `3f537b5895bac86d7e2bcdf64bc7ef675f8e98e3`, merged bounded implicit-breakpoint recovery; ngspice-47 still rejects the unchanged Gnucap deck, so no unchanged-input parity result is claimed |
| Bounded NJF level-1 support (partial #121) | [#121](https://github.com/mfiumara/spice-ts/issues/121) | [PR #152](https://github.com/mfiumara/spice-ts/pull/152), reviewed head `bb47d6a8cc5569e5539d3a6db26fb7680fb6f717`, squash merge `4264ad4910256050fd482b896710ea95b1d511b1`, merged J-card parsing and NJF level-1 equations; the 64-point equivalent ngspice-47 sweep retained `5.9809711503637335e-9 A` maximum and `1.097082252013936e-9 A` RMS drain-current absolute error, before the later fixture-execution and LEVEL=2 slices completed #121's two named fixtures |
| Bounded `jimi-fuzz` transient point growth | [#146](https://github.com/mfiumara/spice-ts/issues/146) | [PR #160](https://github.com/mfiumara/spice-ts/pull/160), reviewed head `aea2deb69d6d72e6904cea925b1bd4fec9d21dde`, squash merge `d64a67ce7739898b0c040988a6dad5589c264911`, bounded run-local trapezoidal retry growth without decimation or per-circuit tuning; the unchanged 5 s fixture still retained 569,788 spice-ts points versus 243,504 ngspice-47 points, used 170.44 MiB streaming / 236.58 MiB one-shot peak RSS, and preserved every OP/transient error metric across all 13 shared signals before the later PR #169 history fix |
| Sparse LU pivot fill growth | [#153](https://github.com/mfiumara/spice-ts/issues/153) | [PR #159](https://github.com/mfiumara/spice-ts/pull/159), reviewed head `db2790e3d2618ce5c4ec284587f0a943e0e95adf`, squash merge `625871c933d02588c3befc4716659b052590343a`, merged general numeric L/U growth and active-fill tracking with exhaustive invertible-matrix coverage; the adjacent independent current-source polarity mismatch against ngspice-47 remains an explicit device-stamping loss |
| Descending `.STEP` ranges | [#154](https://github.com/mfiumara/spice-ts/issues/154) | [PR #158](https://github.com/mfiumara/spice-ts/pull/158), reviewed head `a239025925af9421ba2283f8658dce6c52c01e1a`, squash merge `88f6190d83562c5fb7220e6303dc875c501a7f40`, merged deterministic ascending and descending grids with explicit direction and zero-step errors; the 64-point equivalent ngspice-47 NJF sweep retained `5.9809711529116086e-9 A` maximum and `1.0970822515051825e-9 A` RMS drain-current absolute error, before PR #165 supplied the required case-insensitive `.DC` lookup |
| Case-insensitive `.DC` source lookup | [#155](https://github.com/mfiumara/spice-ts/issues/155) | [PR #165](https://github.com/mfiumara/spice-ts/pull/165), reviewed head `cbae08e19bf8c90b00726a60fb7dde0d4f252d7d`, squash merge `b5e67fd94003427f55052fbdf93716187bfe63d0`, merged case-insensitive lookup while preserving declaration spelling and deterministic ambiguity errors; the unchanged LEVEL=1 fixture completed all 64 points, retaining `5.9809711529116086e-9 A` maximum and `1.0970822515051819e-9 A` RMS drain-current absolute error and `9.485723926698279e-5` maximum relative error |
| Bounded NJF level-2 support | [#161](https://github.com/mfiumara/spice-ts/issues/161) | [PR #166](https://github.com/mfiumara/spice-ts/pull/166), reviewed head `c174da30b81549c2425724d1e46b0805f6155b86`, squash merge `5bd866d47b2c89f0b480fbe960af901bf4fb47b0`, merged the benchmark-driven Parker-Skellern subset with explicit unsupported-parameter errors; the unchanged 64-point LEVEL=2 fixture retained `1.4652818413449405e-6 A` maximum and `3.3642055688029704e-7 A` RMS absolute error plus `1.0` maximum and `0.12500007360564527` RMS relative error, including the nominal-zero `2.935956660037754e-20 A` ngspice value versus exact zero |
| Bounded pole-zero analysis | [#162](https://github.com/mfiumara/spice-ts/issues/162) | [PR #167](https://github.com/mfiumara/spice-ts/pull/167), reviewed head `f8010d5e75b99451af138a625269e0dcc8c03e87`, squash merge `437b4fc9f805b23e0045e1fe69c01cd18e74379c`, merged bounded current-input pole and pole-zero modes after resolving the earlier programmatic-input validation rejection; the passive RLC fixture matched 2/2 poles at `8.429369702178807e-8 rad/s` maximum absolute and `1.1920928955078126e-16` maximum relative error and 2/2 zeros exactly, while the active fixture matched 4/4 poles at `0.012948989868164062 rad/s` maximum absolute and `1.2701015246491562e-11` maximum relative error; voltage input, non-ground references, zero-only mode, stepped analysis, and dynamic order above 12 remain explicitly unsupported |
| `jimi-fuzz` nonlinear trapezoidal history | [#123](https://github.com/mfiumara/spice-ts/issues/123) | [PR #169](https://github.com/mfiumara/spice-ts/pull/169), reviewed head `513e87b560ca2715a1f7f5140153a0749871e472`, squash merge `b21ace2e308e938fe6dfeec1ab6a30f30281c869`, merged accepted-static-residual history without fixture adaptation or per-circuit tuning; the pre-fix open-gap snapshot reported `8.093888373420963` maximum absolute and `130.96868708823104` maximum relative error, while the unchanged full post-fix run retained 567,378 spice-ts points versus 243,504 ngspice-47 points, 112,170 LTE rejections, `3.655196712738439 V` maximum absolute error on `v(11)`, and `115839.041606311` maximum relative error on near-zero-referenced `v(3)`; observed runtime was 5,285.34 ms versus 2,000.23 ms, so no speed or blanket parity claim is made |
| Advanced showcase circuits | [#30](https://github.com/mfiumara/spice-ts/issues/30) | [PR #84](https://github.com/mfiumara/spice-ts/pull/84), [PR #90](https://github.com/mfiumara/spice-ts/pull/90), and [PR #95](https://github.com/mfiumara/spice-ts/pull/95) merged six parity-backed demos, including the final BJT common-emitter and full-wave rectifier residuals |
| Deterministic aggregate 60-circuit parity report | [#114](https://github.com/mfiumara/spice-ts/issues/114) | [PR #126](https://github.com/mfiumara/spice-ts/pull/126), merge commit `49afc3dfc12e3277d05b10dfa3c481b5ad7226d9`, merged deterministic JSON and readable reports over corpora A–C: ngspice 47 success / 6 failed / 7 unsupported; spice-ts 1 success / 0 failed / 59 unsupported; the sole comparable fixture retains the `jimi-fuzz` transient loss |
| Deterministic aggregate 100-circuit parity report | [#133](https://github.com/mfiumara/spice-ts/issues/133) | [PR #136](https://github.com/mfiumara/spice-ts/pull/136), merge commit `f97f9ff79289b34555a0fe1b4c4f78619f824fb8`, extended deterministic reporting to all five corpora without fixture adaptation or per-circuit tolerance tuning: ngspice 52 success / 9 failed / 39 unsupported; spice-ts 11 success / 6 failed / 83 unsupported; 16 analyses across 10 fixtures have matched-point comparisons |
| Correctness-first issue map | [#51](https://github.com/mfiumara/spice-ts/issues/51) | [PR #58](https://github.com/mfiumara/spice-ts/pull/58) merged the charter-aligned roadmap baseline |
| First-wave roadmap reconciliation | [#91](https://github.com/mfiumara/spice-ts/issues/91) | [PR #92](https://github.com/mfiumara/spice-ts/pull/92) reconciled the issue map after the first accepted merge wave |
| Second-wave roadmap reconciliation | [#100](https://github.com/mfiumara/spice-ts/issues/100) | [PR #102](https://github.com/mfiumara/spice-ts/pull/102) reconciled the live 14-issue inventory after the second accepted merge wave while preserving all recorded benchmark losses |
| Third-wave roadmap reconciliation | [#108](https://github.com/mfiumara/spice-ts/issues/108) | [PR #110](https://github.com/mfiumara/spice-ts/pull/110), merge commit `d8eaa9d487fc1259c537f3f58d08a9525491cb73`, reconciled the live 17-issue inventory after PRs #96, #102, and #103 while preserving all recorded benchmark losses |
| Fourth-wave roadmap reconciliation | [#117](https://github.com/mfiumara/spice-ts/issues/117) | [PR #120](https://github.com/mfiumara/spice-ts/pull/120), merge commit `4a6f5389076691a92d5addb924a82ce339f1ac2e`, reconciled the live 21-issue inventory after PRs #112, #119, and #128 while preserving all recorded benchmark losses |
| Fifth-wave roadmap reconciliation | [#134](https://github.com/mfiumara/spice-ts/issues/134) | [PR #135](https://github.com/mfiumara/spice-ts/pull/135), merge commit `fe23d04722f4a62e64a58336bb7cc8390594a8a3`, reconciled the live 16-issue inventory after PRs #130, #131, and #132 while preserving all recorded benchmark losses |
| Sixth-wave roadmap reconciliation | [#141](https://github.com/mfiumara/spice-ts/issues/141) | [PR #142](https://github.com/mfiumara/spice-ts/pull/142), reviewed head `a576fd34b93ba1b5a8b29b7e2d935b757199c1df`, squash merge `dc58223eff7521d787c5dcba6b556b0db58a882e`, reconciled the live 16-issue inventory after PRs #135–#137 while preserving all recorded benchmark and performance losses |
| Seventh-wave roadmap reconciliation | [#144](https://github.com/mfiumara/spice-ts/issues/144) | [PR #148](https://github.com/mfiumara/spice-ts/pull/148), reviewed head `b1aa9475cf80695036f5833d3436f740d7055bf4`, squash merge `0221fff5af164a861f13ba63947f97853a94cbd8`, reconciled the live 16-issue inventory after PRs #138, #142, and #143 while preserving all recorded benchmark and performance losses |
| Eighth-wave roadmap reconciliation | [#156](https://github.com/mfiumara/spice-ts/issues/156) | [PR #157](https://github.com/mfiumara/spice-ts/pull/157), reviewed head `dd7df765a767bbef1ea06d8040a26642415b86c4`, squash merge `b64aeef485477e87a52e260a18a099e05148b801`, reconciled the live 17-issue inventory after PRs #145, #147, #149–#152 while preserving all recorded benchmark and performance losses |
| Ninth-wave roadmap reconciliation | [#163](https://github.com/mfiumara/spice-ts/issues/163) | [PR #164](https://github.com/mfiumara/spice-ts/pull/164), reviewed head `a7949c9843abf3d9f919ea2dc91384981b834d34`, squash merge `81708a8829a065d66ac5ea403ccda4a2a9011e9f`, reconciled the live 17-issue inventory after PRs #157–#159 while preserving all recorded benchmark and performance losses |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Advanced analysis support | [#75](https://github.com/mfiumara/spice-ts/issues/75) | After the bounded LIN/DEC/OCT resistor-noise, `.tf`, and `.pz` slices, differential/current noise outputs, temperature cards, semiconductor/flicker noise, stepped noise, differential/current-output and stepped `.tf`, `.sens`, and `.disto` remain explicitly unsupported on `main` |
| Reconcile this roadmap | [#168](https://github.com/mfiumara/spice-ts/issues/168) | This documentation-only PR closes the issue only after merge |
| Bounded sensitivity analysis | [#171](https://github.com/mfiumara/spice-ts/issues/171) | Add a benchmark-driven linear RLC and active small-signal `.sens` slice with deterministic DC/AC ordering, typed parser/programmatic results, identical-netlist ngspice-47 errors, and explicit rejection of unsupported forms |
| Refresh the aggregate parity report | [#172](https://github.com/mfiumara/spice-ts/issues/172) | Regenerate the deterministic 100-circuit report after the latest correctness merges without fixture, tolerance, or classification changes; every success, failure, unsupported analysis, and regression must remain visible |

Issue #121 is closed only because its two named Xyce fixtures are covered by the independently reviewed bounded
slices: PR #152 supplies LEVEL=1 J-card/model support, PR #165 executes the unchanged LEVEL=1 fixture through
case-insensitive `.DC` lookup, and PR #166 supplies and executes the unchanged LEVEL=2 fixture. This closure does
not broaden either model beyond those reviewed subsets or erase their retained 64-point losses above.

The five public 20-circuit corpora now provide 100 provenance-tracked fixtures, meeting only M1's catalogue-count
threshold; error thresholds, filed gaps, and all open simulator bugs remain separate exit requirements. The committed
aggregate report covers all 100 fixtures: ngspice records 52 success / 9 failed / 39 unsupported and spice-ts records
11 success / 6 failed / 83 unsupported. Matched-point errors are available for 16 analyses across 10 fixtures; every
other missing comparison remains visible rather than being treated as parity. Corpus A's validator runs all 20 fixtures
with ngspice (20/20 pass) and classifies 20/20 as unsupported or reclassified by spice-ts. Corpus B records 19/20
ngspice outputs and 0/20 spice-ts parses. The latest unchanged-fixture corpus C validation records ngspice-47 at
13/20 passes and spice-ts at 6/20 after the bounded parser, TIMEINT, and zero-ohm fixes; the remaining failures stay
visible. Corpus D records 0/20 passes for both engines on unchanged ahkab decks: ngspice-47 rejects all 20 on
ahkab-specific syntax, while spice-ts records 19 parse failures and 1 unsupported case. Corpus E records an
independently reviewed loss: ngspice-47 passes 5/20 unchanged Gnucap fixtures while spice-ts passes 0/20. None of
these catalogue validation or reporting results, nor reaching 100 catalogue entries, is by itself milestone
completion.

Showcase evidence likewise includes losses as well as wins. The passive notch in PR #90 was near matched-point
parity, while the differentiator output reported max/RMS relative error of 0.917/0.180 and excluded 401
zero-reference points from relative metrics. PR #95 retained near-zero relative-error spikes for both new demos;
for example, full-wave `V(out)` reported max/RMS relative error of 0.984/0.155. Demos remain supporting evidence,
not substitutes for the M1 corpus and report.

## M2 Performance

**Exit:** Sparse/reuse solver path; scaling benchmark to ≥10k nodes; published runtime comparison vs ngspice

Optimization follows correctness measurement and must not weaken parity thresholds.

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| Sparse LU | [#8](https://github.com/mfiumara/spice-ts/issues/8) | [PR #18](https://github.com/mfiumara/spice-ts/pull/18) merged the Gilbert–Peierls sparse solver, pattern reuse, solver tests, and a three-way comparison benchmark |
| 10k-node measurement baseline (partial #40) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | [PR #72](https://github.com/mfiumara/spice-ts/pull/72) merged deterministic scaling measurements through 10,000 nodes; it did not close long-running or continuous simulation scope |
| Refreshed 10k-node scaling comparison (partial #40) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | [PR #119](https://github.com/mfiumara/spice-ts/pull/119), merge commit `30bb2f315f578a8a22fa8d5d6e26f55a7d50f83a`, refreshed 100/1k/5k/10k results and profiling; at 10k, spice-ts remained 5.87× slower than ngspice internal analysis and used 8.54× its peak RSS |
| Sparse MNA stamp lookup | [#69](https://github.com/mfiumara/spice-ts/issues/69) | [PR #89](https://github.com/mfiumara/spice-ts/pull/89) replaced dense O(n²) position storage with O(nnz) open-addressed lookup |
| Sparse symbolic-analysis reuse | [#70](https://github.com/mfiumara/spice-ts/issues/70) | [PR #97](https://github.com/mfiumara/spice-ts/pull/97) reused unchanged topology with parity checks and paired timings; 10k DC sweep improved 47.94%, while 10k one-shot OP and LC-50 transient regressed 1.28% and 1.75% respectively |
| Parallel `.step` execution | [#27](https://github.com/mfiumara/spice-ts/issues/27) | [PR #99](https://github.com/mfiumara/spice-ts/pull/99), merge commit `4038ab7544e0bc12bbb84395b2e0074f76257ffa`, merged bounded Node and browser workers with deterministic sequential fallback and production-browser coverage |
| Buck-boost long-run resource baseline (partial #40) | [#107](https://github.com/mfiumara/spice-ts/issues/107) | [PR #111](https://github.com/mfiumara/spice-ts/pull/111), merge commit `79f89a86815efed9403b463fb8766fbff194f4ce`, merged a reproducible 5 ms native-ngspice comparison while retaining the shared negative-rail failure and resource losses |
| MNA topology-lock allocation reduction | [#118](https://github.com/mfiumara/spice-ts/issues/118) | [PR #137](https://github.com/mfiumara/spice-ts/pull/137), merge commit `9216c74f345c336d618c16d89be29a845e719c58`, replaced boxed structural-union construction with reusable typed storage; 1k timing/RSS improved 1.18%/12.69%, 5k timing/RSS regressed 0.06%/1.10%, and 10k timing/RSS improved 4.98%/4.21% |
| Sparse numeric solve workspace reuse | [#140](https://github.com/mfiumara/spice-ts/issues/140) | [PR #143](https://github.com/mfiumara/spice-ts/pull/143), reviewed head `813f76ab141ed4845653ad39102cc541cfe38970`, squash merge `7a8f3308ab5e193249dff7f705c320132d20b5e4`, reused caller-owned RHS output storage; 1k/5k/10k OP runtime changed −43.84%/−34.54%/−5.47% and RSS changed −13.80%/−2.58%/+8.83%, retaining the 10k RSS loss |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Sparse-solver peak memory | [#173](https://github.com/mfiumara/spice-ts/issues/173) | Profile the deterministic 1k/5k/10k OP and DC-sweep paths, make one general sparse numeric or symbolic storage improvement, prove numerical and pivot parity, and report same-machine runtime and peak-RSS regressions as well as wins |

The milestone exit remains evidence-based and is not implied by the existing bounded allocation work or this focused
memory-reduction issue.

The performance record keeps both sides visible. The refreshed PR #119 measurement reports the 10,000-node spice-ts
API at 20.88 ms and 208.94 MiB peak RSS versus ngspice-47 at 40.24 ms fresh-process CLI wall time, 3.55 ms internal
analysis time, and 24.47 MiB peak RSS. That is an embedding/startup win of 1.93× against fresh CLI wall time but
losses of 5.87× against internal analysis and 8.54× in memory. Historical PR #18 also reported transient and AC still
2–3× slower than ngspice-WASM. These remain recorded losses, not evidence for a blanket superiority claim, even
though #40 is closed. PR #99's warmed 16-step RC case was also a loss:
parallel execution took 25.02 ms versus 4.04 ms sequential, or 0.16×. PR #111's identical 5 ms buck-boost netlist
reached neither engine's expected −12 V rail: spice-ts averaged 0.208176594 V at 154.250/154.156 MiB peak RSS,
while ngspice-47 averaged 0.013153286 V at 10.281/10.250 MiB. The baseline is measurement evidence, not correctness
or performance superiority. PR #137 reduced topology-lock construction costs, but retained its losses: the 5k median
timing regressed 0.06% and peak RSS regressed 1.10%; against ngspice internal analysis spice-ts remained 3.00×,
5.05×, and 5.76× slower at 1k, 5k, and 10k and used 11.59×, 10.57×, and 8.77× peak memory. It was faster only
against fresh-process ngspice CLI wall time in that harness. Focused 10k profiles reduced `lockTopology` self samples
35% (20 to 13) while sampled GC hits increased from 17 to 19.
PR #143 removed one `Float64Array(n)` output allocation per sparse solve, but its same-machine measurements remained
mixed. The 1,001-point DC sweep regressed 23.42% in runtime and 0.57% in RSS; the buck-boost smoke transient
regressed 22.97% in runtime while improving peak RSS 12.62%; and the sampled whole-program heap total increased
16.55%. At 1k/5k/10k, spice-ts remained 3.19×/5.16×/5.76× slower than ngspice internal analysis. The known
buck-boost correctness loss also remained visible: neither engine reached the expected −12 V rail in smoke mode,
with spice-ts/ngspice final-cycle means of 0.95635 V / 0.81734 V. These are bounded allocation results, not a
superiority claim.

## M3 AI-native API

**Exit:** MCP server package, JSON netlist schema, structured errors, docs + examples for agent use

Results must remain deterministic; streaming, cancellation, resource limits, and WASM packaging must have
explicit contracts.

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| MCP, JSON, structured-error, and WASM API design | [#57](https://github.com/mfiumara/spice-ts/issues/57) | [PR #67](https://github.com/mfiumara/spice-ts/pull/67) merged concrete package and protocol contracts with independently testable follow-ups |
| Protocol v1 schemas and canonical JSON | [#59](https://github.com/mfiumara/spice-ts/issues/59) | [PR #87](https://github.com/mfiumara/spice-ts/pull/87) merged versioned schemas, deterministic serialization, and golden fixtures |
| `circuit-json` adapter | [#35](https://github.com/mfiumara/spice-ts/issues/35) | [PR #94](https://github.com/mfiumara/spice-ts/pull/94) merged deterministic bidirectional conversion with explicit ordered diagnostics and guarded lossy export |
| Probe interactions in the schematic viewer | [#32](https://github.com/mfiumara/spice-ts/issues/32) | [PR #98](https://github.com/mfiumara/spice-ts/pull/98) merged accessible dynamic node/branch probing across transient, AC, and DC results |
| Typed singular-matrix errors (partial #60) | [#106](https://github.com/mfiumara/spice-ts/issues/106) | [PR #109](https://github.com/mfiumara/spice-ts/pull/109), merge commit `66b3467c67f317b91f80ee7d800a2a1d7cbb36b1`, merged typed real/complex sparse-solver pivot failures with bounded node and branch/source identities while preserving the public API |
| Core protocol adapter (partial #60) | [#60](https://github.com/mfiumara/spice-ts/issues/60) | [PR #138](https://github.com/mfiumara/spice-ts/pull/138), reviewed head `060d2a32865a8489b362c05c5e28968cb8156591`, squash merge `de5a1f78ae69b253a69d2a1dba4fd2e40a96d65c`, merged deterministic protocol-v1 SPICE/native-document mapping, exact JSON-safe OP/DC/TRAN/AC results, stable typed error mapping, unsupported-analysis rejection, PWL round-trip support, and recursive backend-name non-leak coverage |
| Deterministic topology preflight (partial #60) | [#60](https://github.com/mfiumara/spice-ts/issues/60) | [PR #150](https://github.com/mfiumara/spice-ts/pull/150), reviewed head `dbe7e5c65e103f5f44faedd226dc502eda5966dd`, squash merge `37f1e1289c517b8b7fe158311e7e6402ff67044d`, merged typed floating-component, missing-DC-reference, and voltage-defined-loop validation before numerical solve while preserving valid VCCS partial self-control topologies |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Core protocol adapter | [#60](https://github.com/mfiumara/spice-ts/issues/60) | Any remaining solver typed-error work beyond existing `SpiceError` subclasses, cooperative cancellation safe points, hard document, expansion, analysis, point, and serialized-result limits, and streaming events, capabilities, and metadata envelopes with complete backend-name non-leak coverage remain open after the merged topology-preflight slice |
| Bounded MCP simulation server | [#61](https://github.com/mfiumara/spice-ts/issues/61) | Typed tools with deterministic output and enforced execution bounds remain open |
| Worker and WASM facade | [#62](https://github.com/mfiumara/spice-ts/issues/62) | A protocol-compatible browser worker and WASM-facing API remain open |
| Executable agent workflows | [#63](https://github.com/mfiumara/spice-ts/issues/63) | Tested examples for tool-driven simulation and error recovery remain open |

## M4 Device models

**Exit:** Gummel-Poon, BSIM4 (or documented subset), EKV, T-line, driven by benchmark gaps

Benchmark gaps determine model order; feature breadth does not outrank known correctness bugs. No M4 program issue
has a merged delivery in this snapshot.

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| BSIM4 MOSFET model or documented subset | [#3](https://github.com/mfiumara/spice-ts/issues/3) | Reference operating points and a benchmark-driven supported parameter set remain open |
| EKV compact MOSFET model | [#4](https://github.com/mfiumara/spice-ts/issues/4) | Reference-circuit operating points across inversion regions remain open |
| Gummel-Poon BJT model | [#5](https://github.com/mfiumara/spice-ts/issues/5) | Reference operating points and multi-BJT convergence coverage remain open |
| Lossless transmission line | [#7](https://github.com/mfiumara/spice-ts/issues/7) | Matched and mismatched transient step-response comparisons remain open |
| Unsupported device-card coverage | [#76](https://github.com/mfiumara/spice-ts/issues/76) | A benchmark-driven parser matrix and explicit device-card gaps remain open |
| Bounded lossless T-line slice | [#174](https://github.com/mfiumara/spice-ts/issues/174) | Implement the public-corpus lossless T-card subset with matched and mismatched identical-netlist ngspice-47 transient comparisons while explicitly rejecting LTRA, lossy, and frequency-dependent forms |

## Benchmark policy

- Record every circuit's source URL, revision, licence, redistribution decision, and adaptations in
  `benchmarks/SOURCES.md`. Do not commit material whose licence forbids redistribution; commit an executable fetch
  script instead.
- Run spice-ts and ngspice on semantically identical netlists. Record versions, machine, commands, analysis type,
  convergence status, runtime, and matched-point max/RMS absolute and relative waveform errors.
- Publish failures, unsupported features, and speed losses alongside wins. Never cherry-pick circuits, hide errors
  with per-circuit tolerance tuning, or claim category superiority without reproducible evidence.

## Publication boundary

The program may create and update GitHub issues, labels, milestones, Projects, branches, and PRs in
`mfiumara/spice-ts`. A PR may be squash-merged only when CI is green on its exact head SHA and an independent
`spice-ts-review` has accepted that same SHA.

Without Mattia's approval, the program must not publish npm packages, create tags or releases, publish changeset
versions, change Vercel production deployment, force-push `main`, delete branches or issues not created by the
program, spend money, touch secrets, edit `~/repos/spicets/web`, or post on social media.
