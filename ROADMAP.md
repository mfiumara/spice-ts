# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified against live GitHub state on 2026-10-10. The repository had 19 open issues: six in
M1, none in M2, six in M3, and seven in M4. Every open issue is represented below exactly once. Closed duplicate
[#278](https://github.com/mfiumara/spice-ts/issues/278) is not part of the active inventory.

GitHub had two open PRs at verification time. [PR #274](https://github.com/mfiumara/spice-ts/pull/274) had advanced
from unreviewed conflict-remediation head `d654463c92c61a57dbb4a4e23659671174663a46` to unreviewed current head
`984e8ec14364ee37a02313253bb6620c28f0e349`, and [PR
#284](https://github.com/mfiumara/spice-ts/pull/284) had advanced from rejected provenance head
`db27de3e988c6d3f977a1d48056ede71febaaa4d` to accepted remediation head
`47da214e26d348f41baea47b80acff8afe6f2881`. Required build, accuracy, test (20), and test (22) checks were green on
both current heads, but PR #274 remained unreviewed and PR #284 had no squash commit on `main`; neither was a
delivery. Since the prior snapshot, accepted PR heads `f877b2e8d51faffa74b084740726a33fd6f7b76e`,
`c96892611da8c85c5687d05e34c4b52172f3c19e`, `f28de73e7abe259b633fd3404e909d4b4608306a`, and
`3c0b25700f147081d3eebee3ee18b6b1e5733917` squash-merged through PRs #269, #282, #283, and #281 respectively.
This reconciliation closes [#285](https://github.com/mfiumara/spice-ts/issues/285) only when its exact reviewed PR
head merges.

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
| Parity-backed diode noise (partial #75) | [#179](https://github.com/mfiumara/spice-ts/issues/179) | [PR #187](https://github.com/mfiumara/spice-ts/pull/187), accepted head `440d0f073e2d19e2ef3f95b5557082f3c8898795`, squash merge `57aa0077dc27c3ce382cf0c070642d664b2981bd`, merged diode shot and KF/AF flicker noise with 3/3 LIN/DEC/OCT fixtures and 22/22 matched points; maximum output/input/integrated relative errors remained `9.356436623966881e-4` / `4.564031710174417e-4` / `9.356420630676564e-4`, while diode series-resistance noise, BJT/MOSFET noise, temperature cards, stepped noise, differential/current output, and current-source referral remain unsupported |
| Bounded sensitivity analysis (partial #75) | [#171](https://github.com/mfiumara/spice-ts/issues/171) | [PR #178](https://github.com/mfiumara/spice-ts/pull/178), accepted head `0c2aabb102580dbd21e9cd5e5cf5a4d3a4f37e98`, squash merge `76ca1c10c6a3b614929ad7b591972d34618413c1`, merged deterministic DC/AC sensitivity with explicit rejection of multiple AC-form voltage sources; retained maximum/RMS relative errors were `9.999764494111983e-7` / `8.164569576978552e-7` for passive DC, `1.0000394308909735e-6` / `6.418041908645612e-7` for passive AC, and `9.999847762683923e-7` / `6.324459059026921e-7` for active VCVS AC |
| Parity-backed MOS1 noise (partial #75) | [#189](https://github.com/mfiumara/spice-ts/issues/189) | [PR #194](https://github.com/mfiumara/spice-ts/pull/194), accepted head `71e14350cf531a7ba055387f4c048a9f7a039ab9`, squash merge `7f8d21156006f44b5e5672855a0d7dcdb98e77b0`, merged bounded level-1 channel thermal and KF/AF flicker noise over 10 matched DEC points; maximum relative errors remained `3.718423083681525e-10` output density, `3.162994110912621e-10` input density, `1.013547029093546e-10` integrated output, and `4.5812045270383983e-11` integrated input, while unsupported bulk/body-effect, MOS levels, NLEV variants, RD/RS noise, and BSIM noise fail explicitly |
| Parity-backed BJT level-1 shot noise (partial #75) | [#199](https://github.com/mfiumara/spice-ts/issues/199) | [PR #203](https://github.com/mfiumara/spice-ts/pull/203), accepted head `4600b627de36c1aaf92972de5a09cdf59f9fbcd2`, squash merge `f60004b159b41b518dafa5d0cc30776b40f9db3c`, merged level-1 collector and base shot noise over 10 matched points; maximum output/input/integrated-output/integrated-input relative errors remained `4.972383568436574e-4` / `4.0008166662537344e-4` / `4.972383568434045e-4` / `4.0008166662532416e-4`, while KF/AF flicker noise, junction-capacitance noise, and temperature variation remain unsupported. Rejected head `72dce8b6cd8095e67b184badfdf9ddd1ce1cdb80` recorded 7 failed / 30 passed in its RED receipt instead of the reproducible 7 failed / 31 passed |
| BJT level-1 internal-resistance thermal noise (partial #75) | [#243](https://github.com/mfiumara/spice-ts/issues/243) | [PR #247](https://github.com/mfiumara/spice-ts/pull/247), accepted head `cfd04b382ec83ba1fba1f69ca6099b5cf2866e06`, squash merge `59788bb15e971b591eb48792b59b7424add3f87e`, merged positive finite `RB`/`RC`/`RE` series resistance and 27 °C thermal noise over 10 matched points; output-density maximum/RMS relative error remained `4.960608635885672e-4` / `4.960608635885671e-4`, input-density maximum/RMS relative error remained `3.9905361938037567e-4` / `3.9905361938037567e-4`, and integrated output/input relative error remained `4.96060863588325e-4` / `3.990536193800158e-4`. Review runtimes were 10.398792000000014 ms for the ngspice process and 5.819707999999991 ms in-process for spice-ts, with different process boundaries and no speed claim. KF/AF, junction capacitances, temperature variation, stepped noise, differential/current outputs, non-level-1 models, and broader Gummel-Poon resistance forms remain unsupported |
| BJT level-1 flicker noise (partial #75) | [#248](https://github.com/mfiumara/spice-ts/issues/248) | [PR #251](https://github.com/mfiumara/spice-ts/pull/251), accepted head `2252bb44265f5d1eeefee38ea0dde70daf29e17c`, squash merge `fb298da18735f396a954a8db8bb6306585d6f01b`, merged benchmark-bounded KF/AF base-current flicker noise while preserving collector/base shot and RB/RC/RE thermal-noise paths; the 10-point ngspice-47 receipt retained output-density maximum/RMS relative error `6.443857703722335e-4` / `6.443842970102064e-4`, input-density maximum/RMS relative error `5.473641447075279e-4` / `5.473626714889517e-4`, and integrated output/input relative error `6.443934890797646e-4` / `5.473640290607604e-4`. Review runtimes were 12.768292 ms for the ngspice process and 6.405708 ms in-process for spice-ts, with different process boundaries and no speed claim; temperature variation, stepped noise, junction-capacitance noise, differential/current output, non-level-1, and broader Gummel-Poon forms remain unsupported |
| Independent current-source AC excitation | [#198](https://github.com/mfiumara/spice-ts/issues/198) | [PR #202](https://github.com/mfiumara/spice-ts/pull/202), accepted head `2e54b60fee08842071a53edcc5973514afd22780`, squash merge `b39a175c634db2cc449785299a67c32b917b512b`, merged one typed RHS builder shared by batch and streaming AC for deterministic voltage-branch and current-node-pair superposition; all three identical-netlist ngspice-47 fixtures converged at 21/21 matched frequencies per signal with worst absolute error `1.1801832636420706e-15` and worst relative error `5.900916318210353e-16`, while the bounded `.sens AC` multi-source rejection remains unchanged |
| Refreshed deterministic 100-circuit parity report after the M1 wave | [#200](https://github.com/mfiumara/spice-ts/issues/200) | [PR #201](https://github.com/mfiumara/spice-ts/pull/201), accepted head `c41391cb9b4dc537863f430a80288d1f28024f6c`, squash merge `f87051c1650f1dcdd8a2e9e0935a5070239bdf78`, retained the unchanged 100-fixture tree and ngspice 52 success / 9 failed / 39 unsupported totals while spice-ts changed from 16/4/80 to 15/4/81; the sole transition was `classic/lossy-line-aluminium` from success to explicit unsupported LTRA, and comparable coverage decreased to 20 analyses across 13 fixtures without changing the worst error envelope |
| Unchanged 100-circuit report refresh | [#209](https://github.com/mfiumara/spice-ts/issues/209) | [PR #213](https://github.com/mfiumara/spice-ts/pull/213), accepted head `f98cb95bbbdd93393e1f555dfe86e45ab6bcd00c`, squash merge `80a6f3f586410bb30c63e5a790ee253ba0d5c445`, reran all 100 unchanged fixtures with no status or metric transition: ngspice remained 52/9/39, spice-ts remained 15/4/81, and comparable coverage remained 20 analyses across 13 fixtures; single-run runtime sums were 9,326.901 ms and 5,566.460 ms respectively, descriptive only and not a speed claim |
| Bounded stepped transfer-function parity (partial #75) | [#208](https://github.com/mfiumara/spice-ts/issues/208) | [PR #214](https://github.com/mfiumara/spice-ts/pull/214), accepted remediation head `b13404eee6efd35a4dfe5b4ed34a6b8efbce5cd6`, squash merge `3c37af59c67b87118b818e5e7302920f22955722`, merged deterministic typed four-point voltage-gain results and symmetric programmatic `.step` plus `.noise` rejection; expanded identical netlists matched transfer and output resistance exactly while input resistance retained `9.094947017729282e-13` maximum absolute and `5.209785393794664e-13` RMS absolute error, and ngspice-47 still rejects direct `.step` as unimplemented |
| Classic corpus-B failure audit | [#220](https://github.com/mfiumara/spice-ts/issues/220) | [PR #230](https://github.com/mfiumara/spice-ts/pull/230), accepted head `b4ec490391f72aa5f5525d561972f1848e3ed543`, squash merge `0346f37a9c420a91db79740798b0eb7e51959a5d`, reran all 20 unchanged fixtures: ngspice-47 recorded 19 success / 1 failure, while spice-ts recorded only 2 success candidates and 18 unsupported losses, classified as 15 parser-feature and 3 unsupported-analysis/device first failures; no numeric parity is claimed |
| Gnucap corpus-E failure audit | [#221](https://github.com/mfiumara/spice-ts/issues/221) | [PR #231](https://github.com/mfiumara/spice-ts/pull/231), accepted head `454118c8adf20b22b76fd58759d0a09cb93a2fe5`, squash merge `153f2ac3d95ea71a61c5b6bf3b8afc36179833bc`, reran all 20 unchanged fixtures: ngspice-47 passed 5/20 and spice-ts passed 4/20, with spice-ts retaining 3 parser and 13 analysis first failures; the audit files #227 and #228 without claiming parity or superiority |
| AC-only independent-source cards | [#223](https://github.com/mfiumara/spice-ts/issues/223) | [PR #241](https://github.com/mfiumara/spice-ts/pull/241), accepted head `177c75866888684edca7cea98655f6db33e8b655`, squash merge `cda85ef9b37b62c59652e284ade92a6304257385`, merged ngspice-compatible unit AC magnitude and zero phase/DC defaults for voltage and current sources; four unchanged classic fixtures advanced from parser crashes to explicit `.noise` or missing pole-zero-result losses, the classic audit remained 2 success candidates / 18 losses, and the accuracy suite retained the 2.61% BJT CE bias loss |
| Classic no-op directives and option fields | [#224](https://github.com/mfiumara/spice-ts/issues/224) | [PR #246](https://github.com/mfiumara/spice-ts/pull/246), accepted head `a81b6d837693cb3d490a5509cd29c30a087d6612`, squash merge `9437bea19c0868c3b1431419fbbed09b8ead783c`, merged `.opt` plus bounded report/output-only `.width`, `ACCT`, `LIST`, `NODE`, `LIMPTS`, `ITL5`, and `LVLCOD` handling without changing any of the 20 fixtures; corpus B moved from 2 success / 18 losses to 6 success / 14 losses. Three newly exposed cases fail convergence, one advances to explicit LTRA rejection, one advances to an explicit unsupported BJT card, and the accuracy suite retains the 2.61% BJT CE bias loss |
| Compound independent-source `DISTOF` syntax | [#225](https://github.com/mfiumara/spice-ts/issues/225) | [PR #253](https://github.com/mfiumara/spice-ts/pull/253), accepted head `7048f9b8b358b11ce7a75475153cef2edec12ca3`, squash merge `13f45d35e2624bace8cf4a7891e00fc3139cb246`, preserved combined DC, AC, transient waveform, `DISTOF1`, and `DISTOF2` terms with strict malformed-input errors. The current unchanged-fixture classic audit remains an explicit loss at ngspice-47 19 success / 1 failure versus spice-ts 6 success candidates / 14 losses after the independently merged directive slice: the diode fixture remains unsupported at two-tone distortion, while the mixer remains unsupported at its BJT card and produces no matched waveform comparison |
| Bounded distortion-analysis parity (partial #75) | [#215](https://github.com/mfiumara/spice-ts/issues/215) | [PR #237](https://github.com/mfiumara/spice-ts/pull/237), accepted remediation head `70c6ca0e8b93f4183569fb081ddda7c086b99501`, squash merge `e259c4db179414dcc894e428651dc96fc1c7ee5a`, merged a provenance-tracked single-tone linear `.disto DEC` slice; 31 frequencies per harmonic retained `1.1641532182693481e-9 Hz` maximum and `3.5215829100592027e-10 Hz` RMS absolute frequency error while ideal-linear V(1), V(2), and I(V1) second/third-harmonic vector errors were zero. Nonlinear, two-tone, non-zero `DISTOF2`, LIN/OCT, semiconductor, stepped, protocol-v1, streaming, and ngspice-WASM forms remain unsupported, and differing process boundaries support no speed claim |
| Bounded two-tone distortion parity (partial #75) | [#249](https://github.com/mfiumara/spice-ts/issues/249) | [PR #254](https://github.com/mfiumara/spice-ts/pull/254), accepted remediation head `6700b3e7eb160a558700460edc26c62f748968a6`, squash merge `7e7df4394f4a4a69370cb2d14de73259874ddb2e`, merged ideal-linear `.disto DEC` `f1+f2`, `f1-f2`, and `2f1-f2` products; two single-tone and three two-tone products retained 31 matched F1 points, zero maximum complex-vector error, and `1.1641532182693481e-9 Hz` maximum frequency absolute error. Streaming now rejects explicitly. Nonlinear devices, LIN/OCT, stepped or multiple distortion, unsupported products, protocol-v1, streaming results, and WASM mapping remain unsupported, and differing process boundaries support no speed claim |
| Gnucap independent-source value forms | [#227](https://github.com/mfiumara/spice-ts/issues/227) | [PR #256](https://github.com/mfiumara/spice-ts/pull/256), accepted head `eb68c3c151f2966d504cf9f2e84b8b230c319a8e`, squash merge `30406c0ccf0959ec773959b5aa0f90fc858cdb08`, merged bounded `DC=`/`AC=`, valueless `DC` before PULSE, and unparenthesized PWL source grammar while retaining strict malformed-input errors; the unchanged corpus-E audit moved spice-ts from 6 pass / 4 parser / 10 analysis to 6 pass / 2 parser / 12 analysis, while ngspice-47 remained 5 pass / 2 parser / 2 device-model / 11 analysis. Directive and analysis losses remain visible |
| Differential-voltage noise output parity | [#255](https://github.com/mfiumara/spice-ts/issues/255) | [PR #257](https://github.com/mfiumara/spice-ts/pull/257), accepted conflict-remediation head `e5f4345203dbb7cd07a930893d853b4afd5d3661`, squash merge `328fae8dab4981db701af1e28fc004bbe01335c3`, merged bounded resistor-only `.noise V(out+,out-)` after rejected head `9bf735acb6390dcd93d42fb5b3abc3167578e0ac` silently omitted JFET noise and earlier accepted head `6701f3926390c4a4117254945a524da5a5c82954` became stale. The identical ngspice-47 fixture retained 7 matched points and `1.7383133769270947e-7` maximum output-density relative error; current output, current-source referral, stepped noise, temperature cards, and differential diode, BJT, JFET, MOS1, BSIM3, and broader device noise remain unsupported |
| Gnucap control and output directives | [#228](https://github.com/mfiumara/spice-ts/issues/228) | [PR #258](https://github.com/mfiumara/spice-ts/pull/258), accepted remediation head `5cae24e693e9681a17fcf8ec21eac0127fd282dc`, squash merge `d1248b3b67be1d8e8f3058e4c9af44b6addddf2f`, merged bounded output/reporting controls while rejecting behavior-changing or unclassified options. The unchanged 20-fixture corpus-E audit moved spice-ts from 4 pass / 3 parser / 13 analysis to 14 pass / 5 parser / 1 device-model; six failures remain, and pass counts are execution statuses rather than waveform parity |
| AC current-source sensitivity parity | [#264](https://github.com/mfiumara/spice-ts/issues/264) | [PR #272](https://github.com/mfiumara/spice-ts/pull/272), accepted head `e0d180ba8c30e9378d6ced1eac7e1ac7840c07f8`, squash merge `26209e640451aa98db1faef85a3d492ad1d68a93`, merged one AC-form independent current source for bounded `.sens V(node) AC DEC`. The identical ngspice-47 fixture retained 5 matched frequencies, 15 complex samples, `1.0749613601667503e-4` maximum absolute error, and `1.000037997995948e-6` maximum relative error; multiple AC-form sources, zero-plus-active ambiguity, unsupported devices, other outputs, stepping, and non-DEC forms remain unsupported |
| Current-output transfer-function parity | [#263](https://github.com/mfiumara/spice-ts/issues/263) | [PR #269](https://github.com/mfiumara/spice-ts/pull/269), accepted remediation head `f877b2e8d51faffa74b084740726a33fd6f7b76e`, squash merge `1e0b8d1ceb479aabccc1eade482144b6c7d865af`, merged bounded `.tf I(source) input` after rejected head `84186356e80ba9a3404b4ff4d5c8684654b630b6` returned `1e20` instead of ngspice-47's `1e3` same-source output impedance. The accepted 1 kΩ fixture matched transfer `-1e-3` and input/output impedance `1e3`; differential, nested, multidimensional, unsupported stepped, and ambiguous branch-current forms remain unsupported |
| `jimi-fuzz` nonlinear trapezoidal history | [#123](https://github.com/mfiumara/spice-ts/issues/123) | [PR #169](https://github.com/mfiumara/spice-ts/pull/169), reviewed head `513e87b560ca2715a1f7f5140153a0749871e472`, squash merge `b21ace2e308e938fe6dfeec1ab6a30f30281c869`, merged accepted-static-residual history without fixture adaptation or per-circuit tuning; the pre-fix open-gap snapshot reported `8.093888373420963` maximum absolute and `130.96868708823104` maximum relative error, while the unchanged full post-fix run retained 567,378 spice-ts points versus 243,504 ngspice-47 points, 112,170 LTE rejections, `3.655196712738439 V` maximum absolute error on `v(11)`, and `115839.041606311` maximum relative error on near-zero-referenced `v(3)`; observed runtime was 5,285.34 ms versus 2,000.23 ms, so no speed or blanket parity claim is made |
| Advanced showcase circuits | [#30](https://github.com/mfiumara/spice-ts/issues/30) | [PR #84](https://github.com/mfiumara/spice-ts/pull/84), [PR #90](https://github.com/mfiumara/spice-ts/pull/90), and [PR #95](https://github.com/mfiumara/spice-ts/pull/95) merged six parity-backed demos, including the final BJT common-emitter and full-wave rectifier residuals |
| Deterministic aggregate 60-circuit parity report | [#114](https://github.com/mfiumara/spice-ts/issues/114) | [PR #126](https://github.com/mfiumara/spice-ts/pull/126), merge commit `49afc3dfc12e3277d05b10dfa3c481b5ad7226d9`, merged deterministic JSON and readable reports over corpora A–C: ngspice 47 success / 6 failed / 7 unsupported; spice-ts 1 success / 0 failed / 59 unsupported; the sole comparable fixture retains the `jimi-fuzz` transient loss |
| Deterministic aggregate 100-circuit parity report | [#133](https://github.com/mfiumara/spice-ts/issues/133) | [PR #136](https://github.com/mfiumara/spice-ts/pull/136), merge commit `f97f9ff79289b34555a0fe1b4c4f78619f824fb8`, extended deterministic reporting to all five corpora without fixture adaptation or per-circuit tolerance tuning: ngspice 52 success / 9 failed / 39 unsupported; spice-ts 11 success / 6 failed / 83 unsupported; 16 analyses across 10 fixtures have matched-point comparisons |
| Refreshed deterministic 100-circuit parity report | [#172](https://github.com/mfiumara/spice-ts/issues/172) | [PR #175](https://github.com/mfiumara/spice-ts/pull/175), reviewed head `2a1968714b9059567a1146d6cc39e4cf3229f5c7`, squash merge `1a04daf5d4aff2737dc7a44c891fcc5e72194bc8`, retained the unchanged 100-fixture tree and ngspice 52 success / 9 failed / 39 unsupported totals while spice-ts improved to 16 success / 4 failed / 80 unsupported; comparable coverage increased to 21 analyses across 14 fixtures, but the worst absolute and relative error envelopes remained unchanged |
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
| Tenth-wave roadmap reconciliation | [#168](https://github.com/mfiumara/spice-ts/issues/168) | [PR #170](https://github.com/mfiumara/spice-ts/pull/170), reviewed head `8e3973b6f9184c42fa04ae2a27e51fb409b25ad0`, squash merge `406d36eea8aafd24a1d880c93f1e835cd82bcfb7`, reconciled the live 15-issue inventory after PRs #165–#169 while preserving all recorded benchmark and performance losses |
| Eleventh-wave roadmap reconciliation | [#183](https://github.com/mfiumara/spice-ts/issues/183) | [PR #184](https://github.com/mfiumara/spice-ts/pull/184), reviewed head `6d700c37267769cb0f2696ec109ba8a9f49793ce`, squash merge `840cd8e70f55599b34ce09b129f8d276fddf8cf7`, reconciled the live 17-issue inventory after PRs #170, #175, and #176 while retaining the then-rejected T-line defect and all benchmark and performance losses |
| Twelfth-wave roadmap reconciliation | [#192](https://github.com/mfiumara/spice-ts/issues/192) | [PR #193](https://github.com/mfiumara/spice-ts/pull/193), accepted head `c71c0f225deae566073bf8d630f1b5c18c595a16`, squash merge `86b041b7c3044f7f79e7fbed614e10ad0cc97c91`, reconciled the then-live 15-issue inventory after the T-line and aggregate wave while retaining all benchmark and performance losses |
| Thirteenth-wave roadmap reconciliation | [#234](https://github.com/mfiumara/spice-ts/issues/234) | [PR #236](https://github.com/mfiumara/spice-ts/pull/236), accepted remediation head `8179d2ac6570fd7110489fc9a822209edf01ec5f`, squash merge `8a2a1cf6301c7e2621f338e587fe0e99424d9167`, reconciled the then-live 20-issue inventory after PRs #222, #232, #233, #235, and #237 while retaining all benchmark and performance losses and the rejected prior roadmap head |
| Fourteenth-wave roadmap reconciliation | [#250](https://github.com/mfiumara/spice-ts/issues/250) | [PR #252](https://github.com/mfiumara/spice-ts/pull/252), accepted remediation head `4a30369f7de3a273413025aea4fc68b5da10b321`, squash merge `c703bfc697dadb54d218fee1f3dd0534ce402453`, reconciled the then-live 16-issue inventory after PRs #245, #251, and #253 while retaining every quantitative loss, unsupported form, and rejected prior documentation head |
| Fifteenth-wave roadmap reconciliation | [#268](https://github.com/mfiumara/spice-ts/issues/268) | [PR #273](https://github.com/mfiumara/spice-ts/pull/273), accepted head `f4155cbafc98ea9573338d0439db16ade23ebd56`, squash merge `931c94721ed15e0eb04b8c8a00d2bcfa01e4b888`, reconciled the then-live 20-issue inventory after PRs #254, #256, and #261 while retaining all benchmark and performance losses, unsupported forms, rejected heads, and pending-delivery boundaries |
| Sixteenth-wave roadmap reconciliation | [#279](https://github.com/mfiumara/spice-ts/issues/279) | [PR #282](https://github.com/mfiumara/spice-ts/pull/282), accepted head `c96892611da8c85c5687d05e34c4b52172f3c19e`, squash merge `0bb9a4e14c5a1e026fef60c26739c7e4ad02c175`, reconciled the then-live 18-issue inventory after seven accepted squash merges while retaining every loss, unsupported form, parent gap, rejected head, and publication boundary; it supplied no simulator, benchmark, parity, performance, or milestone delta |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Advanced analysis support | [#75](https://github.com/mfiumara/spice-ts/issues/75) | Parent gap after the bounded resistor, diode, BJT, and MOS1-noise, `.tf`, stepped `.tf`, `.pz`, `.sens`, and single- and two-tone ideal-linear `.disto` slices: differential/current noise outputs, temperature cards, broader BJT and MOSFET noise, stepped noise, unsupported `.sens` forms, nested/multidimensional/differential/current-output stepped `.tf`, and nonlinear or stepped distortion remain unsupported |
| Voltage-input pole-zero parity | [#265](https://github.com/mfiumara/spice-ts/issues/265) | [PR #274](https://github.com/mfiumara/spice-ts/pull/274) advanced from rejected head `75b69511dacce8f4b867b1a79cadd0c12d585ac5`, which conflicted with then-current `main`, through unreviewed conflict-remediation head `d654463c92c61a57dbb4a4e23659671174663a46` to unreviewed current head `984e8ec14364ee37a02313253bb6620c28f0e349`. The bounded proposal covers only grounded-reference passive linear voltage input in POLES or PZ mode; non-ground references, zero-only mode, stepping, nonlinear devices, and dynamic order above 12 remain unsupported. The current head is not a delivery |
| Refresh the unchanged 100-circuit parity report | [#275](https://github.com/mfiumara/spice-ts/issues/275) | [PR #284](https://github.com/mfiumara/spice-ts/pull/284) advanced from rejected head `db27de3e988c6d3f977a1d48056ede71febaaa4d`, which conflated macOS 27.0.1 with Darwin 27.0.0, to accepted remediation head `47da214e26d348f41baea47b80acff8afe6f2881`. Its unchanged-fixture proposal retains ngspice at 52/9/39 and reports spice-ts at 28/9/63 with 28 comparable analyses across 18 fixtures, four newly exposed classic execution losses, and a lower absolute envelope caused by the RCA3040 regression removing prior comparisons rather than improving accuracy. The proposed 10,199.135 ms versus 7,428.371 ms single-run sums are descriptive only; without a squash commit on `main`, the current head is not a delivery or speed/parity claim |
| Reconcile this roadmap | [#285](https://github.com/mfiumara/spice-ts/issues/285) | This documentation-only reconciliation remains open until its exact reviewed PR head merges; it supplies no simulator, benchmark, parity, performance, or milestone delta |
| Newly exposed classic-corpus execution failures | [#280](https://github.com/mfiumara/spice-ts/issues/280) | The unchanged #275 aggregate run exposes two timestep failures, one singular-matrix failure, and an RCA3040 operating-point regression that removes three prior comparisons. Reproduce all four from unchanged fixtures, restore the prior RCA3040 success without fixture or tolerance tuning, and resolve or explicitly classify the other losses; no implementation or delivery exists yet |
| Xyce primitive DC output-symbol failures | [#289](https://github.com/mfiumara/spice-ts/issues/289) | Four unchanged Xyce NMOS, PMOS, NPN, and PNP DC fixtures reach spice-ts execution but fail on undefined requested output symbols (`R2` or `VCC`) while ngspice-47 succeeds on identical bytes. Reproduce and resolve output-symbol handling without fixture adaptation or per-circuit tolerance tuning, and publish all four outcomes plus every remaining loss |

PR #193's rejected heads remain historical evidence. Head `bdb05c04e72fb9bca7dc12a73fa829ffab234abf`
recorded stale concurrent-PR states and lacked durable `/poteto-mode` evidence. Head
`1579f1a15e67ff0363cbc33283caf124e6850607` became stale when PRs #178 and #194 advanced. Head
`5e0cae0b3f60f9af3cac72bb283cc37bb092456c` recorded PR #186 at an older rejected head even though that PR had
already advanced. Head `9024e489ab1273ebc75000139110e97d3a255d21` became stale when PR #186 merged at
`68cde750294d73e42e0fe8a20ef412cdf2344eba` and PR #203 merged at
`f60004b159b41b518dafa5d0cc30776b40f9db3c`. Head
`908a18518d15818f0beb2bd3c3518c61a1da5f6b` recorded PR #204 at superseded accepted head
`070b0a79ff3c3a34d28f9a22d71244c9d6251dad` after that PR had advanced. These rejections are not acceptance of
the current documentation head.

PR #237's rejected heads remain historical evidence. Head `5506a08c11c404ee6974414fa2792059e5de7533`
could emit a DEC point above a non-integral stop bound and accepted malformed distortion values. Head
`78d6411ba815a3ad7c04f27ba74d10e07a2c903f` still accepted bare/trailing `DISTOF` forms, dropped programmatic DC
source distortion terms, and truncated scientific or fractional point counts. The accepted head above fixed those
defects without broadening the explicitly unsupported distortion forms.

PR #236's rejected head `86b1d142f9fc9194fb5cc41f59eb959c200d6074` recorded PR #222 at
`90eba0d516c9dee58d323f02fc205b8e8705ec18`, PR #232 at `89459ea1028af0f8c6718234ddb1c92c7e3970de`,
and PR #235 as unreviewed after their live states had advanced. That rejected snapshot remains evidence of the stale
reconciliation; it is not acceptance of the later reviewed and squash-merged remediation recorded above.

PR #252's rejected head `8869fd8b96acca21d816c6384637c855a93f5fda` recorded PRs #245 and #251 as
unreviewed and omitted concurrent PRs #253 and #254. PRs #245, #251, and #253 subsequently passed independent
exact-head review and squash-merged at `77ce1c0002fc13e29b12d5131c1bdef4fde0e15d`,
`fb298da18735f396a954a8db8bb6306585d6f01b`, and `13f45d35e2624bace8cf4a7891e00fc3139cb246`. PR #252 then
advanced to accepted head `4a30369f7de3a273413025aea4fc68b5da10b321` and squash-merged as
`c703bfc697dadb54d218fee1f3dd0534ce402453`; its rejected snapshot remains historical evidence.

PR #254's rejected head `802a93f205989fa571bb3ca177370eaaaaecb95a` silently yielded no data from
`simulateStream()` for valid two-tone distortion input. Accepted remediation head
`6700b3e7eb160a558700460edc26c62f748968a6` rejects that unsupported transport explicitly and squash-merged as
`7e7df4394f4a4a69370cb2d14de73259874ddb2e`; the rejection does not erase the retained distortion limits above.

PR #257's head `9bf735acb6390dcd93d42fb5b3abc3167578e0ac` was rejected because a differential JFET-noise
deck silently reported resistor-only noise. Head `6701f3926390c4a4117254945a524da5a5c82954` fixed that guard and passed
independent review, but the PR later advanced for conflict remediation. Exact head
`e5f4345203dbb7cd07a930893d853b4afd5d3661` preserved both the differential-noise and merged distortion types,
passed a new independent review, and squash-merged as `328fae8dab4981db701af1e28fc004bbe01335c3`. The earlier rejection and
superseded acceptance remain historical evidence.

PR #258's rejected head `92e81f156771ba8cf6bea9066d75a95c832b8611` classifies several Gnucap controls but
silently drops behavior-changing `ITERMIN`; its stated 19/67 parser RED receipt reproduced as 21 failed / 46 passed.
Required CI being green did not override that rejection. Accepted remediation head
`5cae24e693e9681a17fcf8ec21eac0127fd282dc` rejects `ITERMIN`, records the reproduced 21 failed / 46 passed
historical RED, and squash-merged as `d1248b3b67be1d8e8f3058e4c9af44b6addddf2f` without hiding the six remaining
unchanged-fixture losses.

PR #269's head `84186356e80ba9a3404b4ff4d5c8684654b630b6` was rejected because same-source
`.tf I(V1) V1` returned output resistance `1e20` instead of ngspice-47's `1e3`. Accepted remediation head
`f877b2e8d51faffa74b084740726a33fd6f7b76e` fixed that defect without broadening the unsupported forms and
squash-merged as `1e0b8d1ceb479aabccc1eade482144b6c7d865af`; the rejected result remains historical evidence.

PR #274's head `75b69511dacce8f4b867b1a79cadd0c12d585ac5` was rejected because it conflicted with
then-current `main` in the parser compatibility coverage. The PR advanced through unreviewed conflict-remediation
head `d654463c92c61a57dbb4a4e23659671174663a46` to unreviewed current head
`984e8ec14364ee37a02313253bb6620c28f0e349`; passing evidence on the rejected head and partial required checks on the
current head do not accept it.

PR #284's head `db27de3e988c6d3f977a1d48056ede71febaaa4d` was rejected because its receipt labeled the macOS 27.0.1 product
version as Darwin 27.0.1 while the report and host identify Darwin 27.0.0. Required CI and the aggregate checks were
green, but they did not override contradictory provenance. Accepted remediation head
`47da214e26d348f41baea47b80acff8afe6f2881` corrects the label and passed independent exact-head review; the earlier
rejection remains evidence, and acceptance without a squash commit on `main` does not turn the proposed aggregate
results into a delivery.

PR #178's rejected heads remain part of the evidence. Head `0039de812f5a369da732aa47685f1dcc624570a0`
allowed a zero-magnitude AC-form source before the active source to trigger first-source-only corruption. The accepted
head rejects multiple AC-form voltage sources deterministically; it does not broaden sensitivity to that topology.
PR #194's rejected head `a052a1514242238bbe8bb5f04c8e75c28b3dc2d0` ran unsupported bulk/body-biased
MOS1 noise and produced `0.17967315053520422` output-density and `0.17963300311675148` integrated-output relative
error in the review reproduction. The accepted head fails that form explicitly; it does not claim body-noise parity.

Issue #205 was closed as a duplicate of #189, which was delivered by reviewed and squash-merged PR #194. The
closure adds no benchmark delta or broader MOSFET-noise claim beyond PR #194's recorded 10-point comparison and
explicit unsupported forms above.

Issue #121 is closed only because its two named Xyce fixtures are covered by the independently reviewed bounded
slices: PR #152 supplies LEVEL=1 J-card/model support, PR #165 executes the unchanged LEVEL=1 fixture through
case-insensitive `.DC` lookup, and PR #166 supplies and executes the unchanged LEVEL=2 fixture. This closure does
not broaden either model beyond those reviewed subsets or erase their retained 64-point losses above.

The five public 20-circuit corpora now provide 100 provenance-tracked fixtures, meeting only M1's catalogue-count
threshold; error thresholds, filed gaps, and all open simulator bugs remain separate exit requirements. The committed
latest aggregate report covers all 100 fixtures: ngspice records 52 success / 9 failed / 39 unsupported and
spice-ts records 15 success / 4 failed / 81 unsupported. Matched-point errors are available for 20 analyses across
13 fixtures; every
other missing comparison remains visible rather than being treated as parity. Corpus A's validator runs all 20 fixtures
with ngspice (20/20 pass) and classifies 20/20 as unsupported or reclassified by spice-ts. The current corpus-B audit
records ngspice-47 at 19 success / 1 failure and spice-ts at 6 success candidates / 14 losses; the four new successes
followed only from bounded directive/option handling, three other fixtures now expose convergence failures, and the
remaining candidates have no numeric comparison and are not parity claims. The latest unchanged-fixture corpus C
validation records ngspice-47 at 13/20 passes and spice-ts at 6/20 after the bounded parser, TIMEINT, and zero-ohm
fixes; the remaining failures stay visible. Corpus D records 0/20 passes for both engines on unchanged ahkab decks:
ngspice-47 rejects all 20 on
ahkab-specific syntax, while spice-ts records 19 parse failures and 1 unsupported case. The current corpus-E audit
records an independently reviewed loss: ngspice-47 records 5 pass / 2 parser / 2 device-model / 11 analysis on the
20 unchanged Gnucap fixtures, while spice-ts records 6 pass / 2 parser / 12 analysis. None of
these catalogue validation or reporting results, nor reaching 100 catalogue entries, is by itself milestone
completion.

The refresh in PR #201 retained every remaining failure and unsupported case. Relative to accepted PR #175, its
only spice-ts status transition was the honest regression of `classic/lossy-line-aluminium` from success to explicit
unsupported because the bounded lossless T-card implementation now rejects LTRA instead of silently treating it as
lossless. The global error envelopes remained `183.91564521207212`
maximum absolute, `87.25304257950958` absolute RMS, `9829734.595793912` maximum relative, and
`1160907.113030371` relative RMS. Near-zero references explain the large relative envelope. PR #213 then reran the
unchanged tree with no status or metric transition and recorded single-run runtime sums of 9,326.901 ms for ngspice
and 5,566.460 ms for spice-ts. Those wall-clock samples are descriptive diagnostics, not a speed or superiority claim.

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
| Sparse symbolic allocation reduction | [#173](https://github.com/mfiumara/spice-ts/issues/173) | [PR #176](https://github.com/mfiumara/spice-ts/pull/176), reviewed head `440710c78c793a069c4725cfc785a1e5abaa1561`, squash merge `62c812bedf3b78391cd7df7c823b0cea39024efc`, replaced boxed symmetric fill prediction with direct CSC capacity sizing while retaining dynamic fill and pivot growth; 1k/5k/10k OP runtime improved 44.2%/34.4%/29.9% and peak RSS improved 14.0%/4.1%/6.0%, while DC-sweep peak RSS regressed 0.2% |
| Sparse numeric-factor allocation reduction | [#180](https://github.com/mfiumara/spice-ts/issues/180) | [PR #185](https://github.com/mfiumara/spice-ts/pull/185), accepted head `0b3f2c4904cf42a0b6a3429842fbeaa7d758ac09`, squash merge `b610933baf90127b400e9b09aa79a778dce1af15`, removed duplicate numeric-factor row storage while retaining dynamic pivot/fill growth; 1k/5k/10k upper-median runtime changed `1.715→1.630` / `7.200→16.185` / `15.299→14.486 ms` and peak RSS changed `166.266→145.125` / `175.984→180.000` / `223.563→225.641 MiB`, retaining the 5k runtime and 5k/10k RSS regressions; the after-run remained 4.25× slower and used 9.22× ngspice internal-analysis peak RSS at 10k |
| Sparse numeric workspace reuse | [#210](https://github.com/mfiumara/spice-ts/issues/210) | [PR #212](https://github.com/mfiumara/spice-ts/pull/212), accepted head `15202c5090313c5dbc858b0c8d15170137504a3f`, squash merge `6f462ec798cce81decd741e7baa5dab60da5396a`, removed one retained 80,008-byte typed buffer at 10,001 unknowns; 1k OP runtime regressed 2.55%, 5k/10k improved 2.98%/8.98%, 5k/10k RSS regressed 0.87%/1.11%, and sampled whole-process heap bytes regressed 59.96%, while spice-ts remained 2.66×/3.69×/4.10× slower than ngspice internal analysis |
| Transient accepted-step history workspace | [#216](https://github.com/mfiumara/spice-ts/issues/216) | [PR #233](https://github.com/mfiumara/spice-ts/pull/233), accepted head `8ae3870bb30ec09bf6c9862801b15b109b7a2b06`, squash merge `203055f21e26ec1a9a96239a317dc30d07bb4eb3`, removed 567,377 accepted-step allocations and 56.274 MiB cumulative typed-array payload without changing the jimi-fuzz waveform hash; its median improved 29.58% while peak RSS regressed 10.87%, and the smoke sampled heap regressed 58.38% |
| Sparse numeric diagonal-index allocation reduction | [#238](https://github.com/mfiumara/spice-ts/issues/238) | [PR #242](https://github.com/mfiumara/spice-ts/pull/242), accepted head `49864a503e10a273a16db9366edc4b822b9cc652`, squash merge `f737698e90b4e025de65c9f621fcf75f6c27b15d`, removed one retained `Int32Array(n)` of exactly 4 × n bytes while preserving numerical results; review reruns retained a 0.24% 5k OP RSS regression, a 0.59% DC-sweep RSS regression, and GC samples increasing from 16 to 18. At 1k/5k/10k spice-ts remained 2.18×/3.67×/4.13× slower than ngspice internal analysis and used 13.37×/10.29×/8.70× its peak RSS; both transient engines still missed the expected −12 V rail, so the mixed wall-time and RSS samples establish neither correctness nor performance superiority |
| Sparse active-state allocation reduction | [#267](https://github.com/mfiumara/spice-ts/issues/267) | [PR #271](https://github.com/mfiumara/spice-ts/pull/271), accepted head `0b2d64aeffdb6475463e8608de1c6212a83aff89`, squash merge `906b02fae1590c05b071312a4f7377cdcf607502`, removed one retained `Int32Array(n)`, exactly 40,004 payload bytes at 10,001 unknowns, while preserving pivoting, dynamic fill, singular behavior, transient outputs, and accepted-step counts. The noisy same-machine run retained 1k/5k/10k runtime regressions of 30.61%/60.67%/49.91%, a 73.68% DC-sweep runtime regression, and mixed RSS; after the change spice-ts remained 2.26×/3.39×/4.17× slower than ngspice internal analysis and used 13.28×/11.41×/9.31× its peak RSS |

### Open residual gaps

No M2 issue was open at verification time. The milestone remains open because its charter exit criteria are not met.

The milestone exit still requires the charter evidence below and is not implied by the existing bounded allocation
work or this focused follow-up.

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
PR #176 removed boxed symbolic capacity prediction and improved its same-machine OP medians, but spice-ts still
remained 4.25× slower than ngspice internal analysis and used 8.48× its peak RSS at 10k. Its 1,001-point DC sweep
improved from 0.765 to 0.732 ms while peak RSS regressed from 58.188 to 58.297 MiB (+0.2%). These are bounded
allocation results with process-level RSS variability, not a milestone-completion or superiority claim.
PR #185's merged numeric-factor storage reduction retains a 124.81% 5k runtime regression, 2.28% 5k RSS
regression, and 0.93% 10k RSS regression alongside its wins. It is one bounded allocation result, not evidence of
milestone completion or solver superiority.
PR #212's deterministic buffer removal likewise retained mixed measurements: 1k OP runtime and 5k/10k peak RSS
regressed, sampled whole-process heap bytes increased 59.96%, and spice-ts remained slower than ngspice internal
analysis at every measured ladder size. Its DC-sweep and transient medians improved, but the transient fixture's known
negative-rail correctness loss remained visible. This bounded result does not complete M2.
PR #233's accepted-step workspace retained the exact jimi-fuzz waveform hash and LTE telemetry, but its same-machine
jimi-fuzz peak RSS increased from 284.094 to 314.969 MiB (+10.87%). The smoke sampled heap also regressed 58.38%.
These losses remain visible alongside the runtime and allocation improvements; this bounded result does not complete
M2 or establish performance superiority.
PR #242 removed one deterministic sparse-solver buffer, but the same-machine review retained mixed process-level
measurements. The 5k OP and 1,001-point DC-sweep peak RSS regressed 0.24% and 0.59%; sampled GC hits rose from 16 to
18; spice-ts remained slower than ngspice internal analysis and used more peak memory at every measured ladder size.
Both transient engines still missed the expected −12 V rail. The allocation result closes #238 without completing M2
or establishing correctness or performance superiority.
PR #271 removed a deterministic 40,004-byte retained buffer at 10,001 unknowns, but its same-machine results were
again mixed. All three OP sizes and the DC sweep regressed in runtime, 5k/10k OP and DC-sweep RSS regressed, and
spice-ts remained slower than ngspice internal analysis and used more peak memory at every measured ladder size.
Transient output and accepted-step counts stayed exact before and after, including the known negative-rail loss.
This bounded allocation result closes #267 without completing M2 or establishing performance superiority.

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
| Cooperative cancellation and protocol limits (partial #60) | [#190](https://github.com/mfiumara/spice-ts/issues/190) | [PR #195](https://github.com/mfiumara/spice-ts/pull/195), accepted head `83bc8af2668b5c0518ee79ac8939a27de3df0f66`, squash merge `32a04a9b124819a7e60e42b49fa9a5a3a47fbb70`, merged cooperative parse/compile, Newton, transient, AC, count, point, wall-time, cancellation, and serialized-result guards; rejected head `eeb4e9644a30c39afb4fb9966b1d0ac3908c457b` measured serialized size only after every analysis, while the accepted head stops before later analysis execution once the running ceiling is exceeded |
| Bounded protocol-v1 MCP server slice (partial #61) | [#181](https://github.com/mfiumara/spice-ts/issues/181) | [PR #186](https://github.com/mfiumara/spice-ts/pull/186), accepted head `08a2892ad322f934ea61ebf0b8de7513ad5d60c6`, squash merge `68cde750294d73e42e0fe8a20ef412cdf2344eba`, merged deterministic capability, validation, and bounded simulation tools over stdio with a terminable worker boundary, package-anchored core loading, request/result ceilings, cancellation, and JSON-safe public errors; rejected head `5496e05f38bee1f9a21c775cb51ec82a50f3fccd` could not interrupt synchronous solving, and rejected head `6ab054ec476a6ea0056b59caddbed5ec95fbf521` failed in a packed pnpm consumer because its eval worker resolved `@spice-ts/core` from the consumer working directory |
| Protocol-v1 TypeScript worker facade (partial #62) | [#191](https://github.com/mfiumara/spice-ts/issues/191) | [PR #204](https://github.com/mfiumara/spice-ts/pull/204), reviewed head `569b88c7779c30ff8ecf6b2dc319d050c1dd864b`, squash merge `23a785854805417a6824323e0ebe6bd1977750b5`, merged the bounded deterministic `spice-ts-js` worker facade with integrity verification and browser-worker coverage; `spice-ts-wasm` remains reserved and unavailable, so this is not a numeric WASM backend or completion of parent #62 |
| Executable bounded MCP agent workflow (partial #63) | [#206](https://github.com/mfiumara/spice-ts/issues/206) | [PR #207](https://github.com/mfiumara/spice-ts/pull/207), reviewed head `c93e5fa0a0833cb41eb34941c60f92af34579cb5`, squash merge `5bc0dd504a5d216bb38896f8ddfff8c003d1c1f7`, merged a deterministic built/package-consumer stdio workflow for capability discovery, validation, simulation, resource-limit recovery, and public structured errors; its authored divider adds no imported benchmark or parity delta, and the bounded example does not complete parent #63 |
| File-driven agent recovery workflow (partial #63) | [#219](https://github.com/mfiumara/spice-ts/issues/219) | [PR #229](https://github.com/mfiumara/spice-ts/pull/229), accepted head `d6241ed37a9c6bc0c8a85fc233682f8b547a67b3`, squash merge `16038f1d220997857f6ef5925b8bce013ae0b591`, merged a deterministic external packed-consumer workflow that discovers capabilities, diagnoses `RESOURCE_LIMIT`, changes only `maxResultPoints`, and verifies exact JSON plus SHA-256; it covers one OP recovery path only and adds no benchmark, parity, speed, or parent-completion claim |
| Circuit-json threshold-cancellation workflow (partial #63) | [#260](https://github.com/mfiumara/spice-ts/issues/260) | [PR #261](https://github.com/mfiumara/spice-ts/pull/261), accepted head `db68d7102819a043718f34c33ebb769d9034ada0`, squash merge `38fe5a966031adb4e27cd2cc6a46653f69d31256`, merged one packed-consumer linear RC workflow with ordered conversion diagnostics, pre-simulation blocking diagnostics, cursor replay, threshold cancellation, exact partial terminal/hash boundaries, and public backend metadata. It does not cover voltage-source conversion, WASM, ngspice parity, accuracy, speed, publication, or parent/milestone completion |
| Protocol capability and metadata envelopes (partial #60) | [#218](https://github.com/mfiumara/spice-ts/issues/218) | [PR #232](https://github.com/mfiumara/spice-ts/pull/232), accepted remediation head `66da326990219c4163f3c2cc82bafd4c1411efd0`, squash merge `8772f3dd667cc7d879c15cacfa6c3ccb976f9417`, merged stable capability ordering and always-terminal envelopes while preserving caller identifiers and mapping non-canonical requests to typed terminal failures; this bounded child does not complete parent #60 |
| Deterministic MCP streaming and cancellation (partial #61) | [#211](https://github.com/mfiumara/spice-ts/issues/211) | [PR #222](https://github.com/mfiumara/spice-ts/pull/222), accepted remediation head `16c34f9fb5af35403192e380a8bf078a78b3e825`, squash merge `515ff13532aa7ab9e805a607e9a41a6b7cf31ca5`, merged bounded read-driven canonical point streaming, cancellation of live isolated work, replayable cursors, and result-ceiling enforcement before retaining each batch; the accuracy suite retained its BJT CE 2.61% approximation loss |
| Bounded MCP job TTL and unread retention (partial #61) | [#239](https://github.com/mfiumara/spice-ts/issues/239) | [PR #244](https://github.com/mfiumara/spice-ts/pull/244), accepted head `c1a98964fe5aa4fd33cf21ecd753ce58e2658242`, squash merge `f8fe045091595a7c1bba1c033b640ef44e539d57`, merged injected-clock 30 s running-job and 60 s terminal-retention defaults plus atomic unread ceilings of 256 events and 1 MiB while preserving replay, ordering, cancellation, partial hashes, and public backend isolation; all 1,159 reported tests passed and the unchanged accuracy profile remained 7 pass / 1 warning / 0 failures. This MCP-only slice adds no simulator parity, speed, or parent-completion claim |
| Bounded numeric WASM backend (partial #62) | [#217](https://github.com/mfiumara/spice-ts/issues/217) | [PR #235](https://github.com/mfiumara/spice-ts/pull/235), accepted head `f605e1b5ccd51005e692c1647c8542df050229cf`, squash merge `52d7c4d1c6e26d6bddf8fa519bf454bd4a8c49ae`, merged a no-fallback, fixed-memory linear OP backend for R/I/V circuits only; median one-shot OP was 23.1926 ms versus 19.6654 ms for TypeScript, a 17.94% runtime loss, and combined uncompressed output grew 13,353 bytes (+3.47%). No broader WASM completion or speedup is claimed |
| Passive AC numeric WASM backend (partial #62) | [#240](https://github.com/mfiumara/spice-ts/issues/240) | [PR #245](https://github.com/mfiumara/spice-ts/pull/245), accepted remediation head `1c1bd02904dc5c7526728c8f628a786d0bd5c08e`, squash merge `77ce1c0002fc13e29b12d5131c1bdef4fde0e15d`, merged a fixed-memory passive R/C/L AC subset with exact ngspice-47/WASM LIN grids of `[100]` for LIN 1 and `[100, 400, 700, 1000]` for LIN 4. The five-circuit, 29-point receipt retained one OCT endpoint exclusion, 64 TypeScript samples, and 63 ngspice samples; runtime remained a loss at 1,490.678 ms TypeScript versus 1,492.458 ms WASM (+0.1194%), and uncompressed artifact/worker/index growth remained 1,710 / 21,492 / 937 bytes, 24,139 bytes (+6.06%) combined. Sparse, nonlinear, stepped, modeled-device, and broader WASM coverage remain unsupported; this bounded slice does not complete parent #62 or establish speed superiority |
| Passive RC transient numeric WASM backend (partial #62) | [#259](https://github.com/mfiumara/spice-ts/issues/259) | [PR #262](https://github.com/mfiumara/spice-ts/pull/262), accepted remediation head `78e1ce3f8098dbb4cfbc3932d6795c46f3989e2c`, squash merge `800eb6e2ca8cda9b0803c5f5506c7cd50e9419d2`, merged a fixed-memory, no-fallback R/C/I/V transient subset after correcting duplicate terminal points, serialized-result limits, and compound-source validation. The unchanged ngspice-47 fixture retained 66 native points, 11 WASM points, 11 matched times, `0.000735598939 V` maximum absolute and `0.0152125802` maximum relative V(out) error; fresh-process medians remained a loss at 368.35 ms and 138.33 MiB for WASM versus 11.48 ms and 10.19 MiB for ngspice. Unsupported devices, analyses, source forms, transient controls, and resource overruns remain explicit; this slice does not complete parent #62 or establish speed superiority |
| Floating-node repair and solve-singularity workflow (partial #63) | [#266](https://github.com/mfiumara/spice-ts/issues/266) | [PR #270](https://github.com/mfiumara/spice-ts/pull/270), accepted head `3b893f8362c1c4385bedaad32e079da18b2ba18f`, squash merge `5854b258724b3bf6c8092cae11e6655dedde0c10`, merged a packed-consumer workflow that diagnoses floating topology before solving, applies a DC-path repair, reaches OP, and keeps a separate solve-only `SINGULAR_MATRIX` case. The workflow adds no benchmark, parity, speed, parent-completion, or milestone-completion claim |
| Deterministic MCP worker-death recovery (partial #61) | [#276](https://github.com/mfiumara/spice-ts/issues/276) | [PR #281](https://github.com/mfiumara/spice-ts/pull/281), accepted head `3c0b25700f147081d3eebee3ee18b6b1e5733917`, squash merge `fe391300d1ec600d38c86c423f4f989c5fb868c3`, merged stable public `INTERNAL_ERROR` terminals before retained points and bounded canonical partial terminals after retained points, with replayable cursors, duplicate-exit idempotence, ceiling/cancellation preservation, backend-name isolation, and official MCP Client packed-consumer coverage. This bounded lifecycle slice does not complete parent #61 or add simulator parity, performance, release, or deployment evidence |
| Passive DC-sweep numeric WASM backend (partial #62) | [#277](https://github.com/mfiumara/spice-ts/issues/277) | [PR #283](https://github.com/mfiumara/spice-ts/pull/283), accepted head `f28de73e7abe259b633fd3404e909d4b4608306a`, squash merge `6ffdcc0db3ee8b371ea0b7f49c01dc436dde192a`, merged a fixed-memory, no-fallback single-source linear R/I/V `.dc` slice. The identical ngspice-47 fixtures matched 5/5 voltage-divider and 3/3 current-source points with zero reported vector error, excluding one zero reference per signal and unavailable native current-source branch current. Fresh-process medians remained losses at 586.503 versus 14.011 ms and 533.811 versus 14.038 ms; the ABI-v2 three-page artifact stayed 2,900 bytes while the JavaScript worker grew. Unsupported devices, nonlinear/compound sources, nested sweeps, malformed grids, and ceilings fail explicitly; this slice does not complete parent #62 or establish speed superiority |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Core protocol adapter | [#60](https://github.com/mfiumara/spice-ts/issues/60) | Parent gap after the merged protocol, topology-preflight, cooperative guard, and capability/envelope slices: remaining solver typed-error work and broader protocol integration stay open; merged child #218 does not complete the parent API |
| Bounded MCP simulation server | [#61](https://github.com/mfiumara/spice-ts/issues/61) | Parent gap after the merged bounded stdio and deterministic worker-death recovery slices in #181 and #276: broader server scope and remaining deterministic typed MCP tools and execution-bound coverage stay open; merged children do not complete the parent API |
| Worker and WASM facade | [#62](https://github.com/mfiumara/spice-ts/issues/62) | Parent gap after the merged TypeScript worker plus bounded numeric OP, passive AC, passive RC transient, and passive DC-sweep WASM slices: broader protocol-compatible browser-worker and WASM analysis/device coverage remain open; children #217, #240, #259, and #277 do not complete the parent API |
| Executable agent workflows | [#63](https://github.com/mfiumara/spice-ts/issues/63) | Parent gap after the merged bounded stdio, file-driven recovery, circuit-json threshold-cancellation, and floating-node repair workflows in #206, #219, #260, and #266: broader tested agent examples and recovery documentation remain open; no child example completes the parent API |
| Deterministic point-ceiling recovery workflow | [#286](https://github.com/mfiumara/spice-ts/issues/286) | Add one packed public-API workflow that discovers capabilities, triggers a deterministic `RESOURCE_LIMIT`, changes only the named ceiling, and completes with ordered diagnostics, backend/build metadata, canonical hashes, and replay evidence. It must remain distinct from prior examples and adds no parity, speed, parent-completion, release, or deploy claim |
| Bounded VCCS operating-point WASM backend | [#287](https://github.com/mfiumara/spice-ts/issues/287) | Extend the fixed-memory, no-fallback numeric backend only to a benchmark-bounded linear VCCS operating-point slice, preserving ABI, integrity, resource, cancellation, and existing-analysis contracts. Unsupported dependent-source forms, nonlinear devices, other analyses, invalid topology, and ceilings must reject explicitly; publish identical-netlist ngspice-47 errors, runtimes, artifact growth, exclusions, and every loss without a speed or parent-completion claim |

PR #222's rejected heads remain historical evidence. Head `90eba0d516c9dee58d323f02fc205b8e8705ec18`
created a job only after simulation completed. Head `686b6270a0a71dc478344fd42b7226526234e2be` created the job first but
emitted no canonical points until the complete result existed. Head `d590e738ad2558f78492422b760abafef47fef6b`
streamed live points but delivered 102 points against `maxResultPoints: 4` before failing. The accepted head above
delivered exactly four points and rejected the next batch before retention.

PR #232's rejected head `89459ea1028af0f8c6718234ddb1c92c7e3970de` collision-renamed caller-controlled
identifiers, let non-finite canonicalization reject instead of returning a terminal envelope, and failed
`git diff --check`. The accepted remediation preserved identifiers and resolved non-canonical requests to typed
terminal failures.

PR #245's rejected head `94953016184f3e63284d36c980fc858d8873f6c1` remains historical evidence. Its tests
locked in five points for `.ac lin 4`, while ngspice-47 produced four endpoint-inclusive points on the identical
netlist. Its 24-point DEC/OCT receipt retained 58 ngspice samples at `1.157132077848772e-15` maximum and
`2.2527149380436005e-16` RMS absolute error but did not exercise LIN. Review reproduced a 0.04666% runtime loss and
uncompressed artifact/worker/index growth of 1,710 / 21,440 / 937 bytes, 24,087 bytes (+6.04%) combined. Required CI
was green on that head, but green checks did not override the independent correctness rejection. Remediation head
`1c1bd02904dc5c7526728c8f628a786d0bd5c08e` corrected LIN point semantics, passed independent exact-head review,
and squash-merged as `77ce1c0002fc13e29b12d5131c1bdef4fde0e15d`; the rejected-head losses remain part of the record.

PR #262's rejected head `31495f474458e0926b0cdc2c7ddb22767bfc3213` schedules a duplicate clamped terminal
point for valid fixed-step transients when floating division overshoots, returns oversized transient results despite
`maxSerializedResultBytes`, and accepts trailing AC terms after PULSE while ignoring them. Required CI was green, but
the three correctness and boundary failures kept the slice pending. Accepted remediation head
`78e1ce3f8098dbb4cfbc3932d6795c46f3989e2c` fixed all three contracts, retained the published benchmark losses and
unsupported forms, and squash-merged as `800eb6e2ca8cda9b0803c5f5506c7cd50e9419d2`.

## M4 Device models

**Exit:** Gummel-Poon, BSIM4 (or documented subset), EKV, T-line, driven by benchmark gaps

Benchmark gaps determine model order; feature breadth does not outrank known correctness bugs. The M4 milestone is
not complete merely because a bounded child slice merges.

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| Bounded lossless T-line transient slice (partial #7) | [#174](https://github.com/mfiumara/spice-ts/issues/174) | [PR #177](https://github.com/mfiumara/spice-ts/pull/177), accepted remediation head `7ae757ba57edc5c860282f646c747a342daf9840`, squash merge `6191fabb2b06096c918a580774091fefa51ba479`, moved history mutation to accepted transient steps after independently reproducing the rejected-head pre-arrival leak. The configured 5 ns line retained a measured 5.0075 ns delay; matched max/RMS absolute error improved to `1.887379141862766e-15` / `9.284985247008207e-17 V`, while mismatched input and output retained `0.004550045527923263` and `0.003349544520010017 V` maximum absolute errors and near-zero relative-error losses |
| Bounded Gummel-Poon forward-active slice (partial #5) | [#182](https://github.com/mfiumara/spice-ts/issues/182) | [PR #188](https://github.com/mfiumara/spice-ts/pull/188), accepted head `be9c75e749ab33610ac4f8dc261159bb19075c89`, squash merge `c03fac0fbd38a3a9b079ee269bc1960682fb7ba1`, merged VAF Early effect, IKF high-current roll-off, and ISE/NE base-emitter leakage over a 21-point identical-netlist grid; base/collector current maximum relative errors remained `1.5033458336233197%` / `1.324569419093589%`, while capacitance, transit time, resistance, temperature, reverse-effect, breakdown, substrate-current, and area behavior remain unsupported |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| BSIM4 MOSFET model or documented subset | [#3](https://github.com/mfiumara/spice-ts/issues/3) | Reference operating points and a benchmark-driven supported parameter set remain open |
| EKV compact MOSFET model | [#4](https://github.com/mfiumara/spice-ts/issues/4) | Reference-circuit operating points across inversion regions remain open |
| Gummel-Poon BJT model | [#5](https://github.com/mfiumara/spice-ts/issues/5) | Parent model gap remains open; bounded forward-active child #182 does not imply full Gummel-Poon support, including capacitance, transit-time, resistance, temperature, reverse-effect, breakdown, substrate-current, and area behavior |
| Lossless transmission line | [#7](https://github.com/mfiumara/spice-ts/issues/7) | The bounded positive-`Z0`/`TD` T-card slice merged through #174, but frequency-length, initial-condition, lossy, frequency-dependent, O-card/LTRA, and broader model coverage remain open under this parent |
| Unsupported device-card coverage | [#76](https://github.com/mfiumara/spice-ts/issues/76) | A benchmark-driven parser matrix and explicit device-card gaps remain open |
| Lossy LTRA transmission-line cards | [#226](https://github.com/mfiumara/spice-ts/issues/226) | Three unchanged classic fixtures remain unsupported while ngspice-47 runs them; implement a benchmark-bounded LTRA subset or preserve explicit unsupported parameters and publish matched transient losses without adapting fixtures |
| Refresh unsupported device-card coverage audit | [#288](https://github.com/mfiumara/spice-ts/issues/288) | Reclassify every first unsupported device-card failure in the unchanged 100-fixture corpus by card, model, parameter, and owning gap while preserving fixture and source-catalogue hashes. Publish identical-byte ngspice-47 and spice-ts successes, failures, unsupported cases, transitions, runtimes, exclusions, and every loss without implementing a model or claiming parity, speed superiority, or milestone completion |


The original PR #177 head `dff34168c59f788a60ac8b6db77deebae14d8196` was rejected after it leaked
`0.023656282496570407 V` before the physical 6 ns arrival and retained `0.15 V` matched-output maximum absolute
error. Those defects were reproduced before the accepted head fixed accepted-step/retry/reset history semantics;
the merged result above does not erase its remaining mismatched-waveform or near-zero-relative-error losses.

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
