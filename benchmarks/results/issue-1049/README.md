# #1049: #737 NEW-op localization

Evidence only. Refs #1049. No simulator fix, tolerance change, corpus reclassification or pin replacement. The full OP root cause is **not localized to a general spice-ts device/parser bug**. The first independently reproducible divergent subnet is XU68's disable clamp, D_D1/D_D2 using model DX, R_R1 and the weakly grounded DisA pin. A separate weakly grounded XQ37 source discrepancy persists without the op-amp. These observations do not establish two valid operating points.

## Inputs and scope

Baseline core `a521e9e2` reproduces the exact numbers from PR1046 `6be63454c1c9ea03de0d59305f1bcd3ebe40eb91`, whose receipt used core `e358f89b`. Node v22.23.1, darwin arm64, Homebrew ngspice-47 with SPARSE 1.3 in LTPS mode. See [receipt.json](receipt.json) for the complete revision/version strings and measured values.

[localize.ts](localize.ts) verifies the unchanged archive pin and original derived-deck SHA256, then reproduces PR1046's preparation exactly. Convert CRLF to LF, strip the quoted Windows drive prefix and include quotes, retain the `spice_lib/` tree. Replace only `.TRAN 1m 10m` with `.op`.

- Original SHA256 `b58eda0bc033ac63358e66f275efeff0af13534ffe7cb3efbe391f13b1c15965`.
- NEW-op SHA256 `53bd1936ee8529e1b1158d91a6fba578e8eceb4e5c2ca7219aa03b2d31208245`.
- Both engines receive identical netlist bytes and copied, unchanged include bytes. ngspice reads `set ngbehavior=ltps` from a temporary local `.spiceinit`. No user startup file is edited.
- Reductions are separately hashed diagnostic decks, never scored corpus entries. Boundary voltage sources use the measured ngspice OP, not fitted parameters.

Sources and licence policy remain the ngspice-bugs entry in `benchmarks/SOURCES.md` and ticket 737's existing manifest. Public tracker attachments have no explicit redistribution grant; TI/vendor library bytes remain fetch-only. This directory contains only original diagnostic code and numeric receipts, not vendor decks or model cards. Runtime model-card extraction is from the verified archive.

## Full voltage and branch-current comparison

The receipt compares all 98 native raw signals, 72 node voltages and 26 branch currents, including zeros and agreeing quantities. It retains the 30 additional spice-ts series-resistance internal node voltages separately as `unmatchedOwn`; none of the native raw signals is dropped. ngspice does not export these internal nodes in its default raw plot. Only naming is normalized: case, native `v.`/`e.` hierarchical device prefixes, and `a$poly$e.` versus spice-ts `bE_` polynomial-source branch names. No sign adjustment or value transformation is made. Differences are sorted by absolute error; relative errors use the native value without a floor and are null at native zero. These are diagnostic differences, not a modified benchmark metric.

Top 10 voltage differences, V:

| Signal | spice-ts | ngspice-47 LTPS | Absolute difference |
|---|---:|---:|---:|
| v(xq37.15) | 6.14692830637 | 5.66924214492 | 0.47768616 |
| v(xq37.12) | 6.14702830638 | 5.66934214755 | 0.47768616 |
| v(xq37.2) | 6.14872664312 | 5.77372389194 | 0.37500275 |
| v(net-_q37-g_) | 6.1487266432 | 5.77372391068 | 0.37500273 |
| v(net-_r151-pad2_) | 6.14872665634 | 5.77372777797 | 0.37499888 |
| v(xu68.41) | 6.86360671702 | 6.48860787346 | 0.37499884 |
| v(xu68.42) | 5.4338465963 | 5.05884789085 | 0.37499871 |
| v(xu68.2ndpole) | 6.14872665694 | 5.77372798338 | 0.37499867 |
| v(xu68.zo) | 6.14872667538 | 5.77373068353 | 0.37499599 |
| v(unconnected-_u68-_dis-pad8_) | 2.26033425639 | 2.09982162357 | 0.16051263 |

Top 8 branch-current differences, A:

| Signal | spice-ts | ngspice-47 LTPS | Absolute difference |
|---|---:|---:|---:|
| i(v159) | -0.00135547134734 | -0.00123732085973 | 0.00011815049 |
| i(v160) | 0.00126446664733 | 0.00116635566618 | 9.8110981e-05 |
| i(xu68.x_f2.vf_f2) | 5.65072010513e-05 | 3.72516274697e-05 | 1.9255574e-05 |
| i(xu68.x_f6.vf_f6) | 5.65072151561e-05 | 3.72582103462e-05 | 1.9249005e-05 |
| i(xu68.x_f5.vf_f5) | 5.65072292612e-05 | 3.72647932227e-05 | 1.9242436e-05 |
| i(xu68.x_f1.vf_f1) | 5.65072433664e-05 | 3.72713760992e-05 | 1.9235867e-05 |
| i(xu68.v_v6) | -1.01968151641e-05 | -9.55795152182e-06 | 6.3886364e-07 |
| i(xu68.x_f10.vf_f10) | -1.01968293194e-05 | -9.56454296265e-06 | 6.3228636e-07 |

The issue's two quantities remain unchanged: i(V159) differs by 9.548896%, and v(Net-_Q37-S_) remains -0.0016983367337954761 versus -0.1043817443873431 V, a 98.372956% relative difference. There is no before/after improvement to claim.

## Cross-seeding and multi-solution verdict

The script inserts one `.nodeset` for every shared node voltage. This is 72 nodes, not branch-current constraints; engine-private series nodes cannot be portably exchanged. Both seeded decks are hashed in the receipt. Both engines run successfully, but neither retains the other's point:

| Trial | i(V159), A | v(Q37-S), V |
|---|---:|---:|
| spice-ts from ngspice nodesets | -0.0013554713473383079 | -0.0016983367337954761 |
| ngspice from spice-ts nodesets | -0.001237320859727932 | -0.1043817462789712 |

spice-ts returns its original result exactly. ngspice returns its original branch to numerical precision. Cross-seeding alone does not prove uniqueness. The disable-node KCL check below also shows the native reported point is not an exact root of the ordinary DC equations at that weakly loaded node. Thus this is **not demonstrated multistability**. Low-current numerical OP acceptance is supported by the reduced evidence; its exact ngspice convergence/bypass mechanism remains unproven.

The receipt also stores a fresh spice-ts static `G*x-b` restamp at its returned point, with node-KCL rows distinguished from voltage-constraint rows. The largest node residual is 5.411343694916148e-10 A at XU68.30, paired with XU68.Q_Q7.rb. This is not a claim of zero residual everywhere or a full native-equation residual. The disable network's independently calculated KCL is more decisive for that subnet.

## Reductions and first divergence

1. **XU68 with all six terminals fixed at the native OP.** Same OPA690 include, same `rshunt=1T`. Both engines succeed. Internal v(2ndpole) remains 5.80589253652265 versus 5.773727983216421 V, a 0.0321645533 V difference. The output boundary source carries 0.0015734389479743482 versus 5.423364828055341e-9 A. Fixing DisA removes the original 0.1605 V disable-node discrepancy, but does not eliminate every internal/output-current discrepancy. No single device equation is established as the cause of this remainder.
2. **XQ37 with gate and source fixed at native OP, drain at ground.** Both engines succeed. Maximum shared node-voltage difference is 2.128984633031905e-8 V. Maximum branch-current difference is 5.414154177963279e-9 A. This rules out a large fixed-bias MOS subcircuit equation error at this OP, not all MOS behaviors.
3. **XQ37 with only gate fixed, source left weakly grounded as in DC.** No XU68. Both engines succeed, but source remains -0.0015970519985703212 versus -0.1043817416791904 V. The original source-voltage discrepancy is therefore not solely propagated from the op-amp's output. Clamping every terminal had hidden this independent weak-node sensitivity.
4. **Every OPA690 BJT individually, at its native external terminal voltages.** Nine Q devices, unchanged PNP8/NPN8 cards and instance area. Maximum terminal-current difference across all probes is 9.632600530477646e-12 A. This gives no evidence for a large BJT DC equation/area/model-parameter error at those biases.
5. **Every OPA690 diode individually, at its native terminal voltages.** Twelve D devices, unchanged DX/DN1/DN3 cards and area. Maximum terminal-current difference is 3.426078865054194e-17 A. In particular D_D1's native-bias current is 1.9550906701710936e-9 versus 1.955090670171131e-9 A. The diode equation itself agrees.
6. **Only the disable clamp.** Retain D_D1, D_D2, R_R1, C_C8, V_V1, V_V2 and the original model cards, with the same `rshunt=1T`. The original 0.1605 V discrepancy survives without any BJT, controlled source, MOSFET or nested subcircuit. v(DisA) is 2.2603208032904076 versus 2.099812180766368 V. This localizes the first independently reproducible divergence to the low-current DX clamp solve, not polynomial-source evaluation.

For the disable subnet, C_C8 is open in DC. Its exact DisA KCL is `(V(DisA)-V(10))/5625 + V(DisA)/1e12`. Node 10 KCL adds both DX diode currents, including default 1e-12 junction gmin, and its own 1T ground shunt. Thermal voltage uses ngspice-47's constants at 27 C. The calculation is in the script, not inferred from a displayed rounded voltage.

| Point | DisA KCL residual, A | Node 10 KCL residual, A |
|---|---:|---:|
| Full spice-ts OP | -4.1147376596207945e-21 | -9.835907042015487e-20 |
| Full ngspice OP | -9.757058192768722e-10 | -9.7570837485986e-10 |
| Reduced spice-ts OP | -3.584964060587204e-20 | -2.10623789874642e-15 |
| Reduced ngspice OP | -9.7570143156543e-10 | -9.76426563565082e-10 |

The monotone diode/shunt clamp has no evidence of two physical DC roots. The same-bias diode probes agree between engines, while native reported clamp voltages leave roughly 0.976 nA residual. This supports an ngspice-specific numerical acceptance effect in this subnet. It does not justify changing spice-ts device equations to match that point or claiming complete correctness superiority. The remaining XU68 fixed-boundary current mismatch and floating XQ37 source solve are left explicit for #1049.

## Secondary short transient

The unchanged NEW-short-1e-9 hash is `2f6c161d931fbae2aeb320069330e0fa675141b4ca7353abfcfa12ed0fffa5a6`. It reproduces spice-ts TimestepTooSmall at 5.562971581351822e-11 s and ngspice exit 1. No complete reference is available. Shared OP root cause for this transient failure is **not established**; it was not chased independently. The receipt preserves both failure diagnostics.

## Reproduce and validation

Run from the repository root. No private files or global ngspice configuration are required.

1. `git fetch origin pull/1046/head`; inspect `git show 6be63454:benchmarks/corpus/ngspice-bugs/oracle-737.ts`, `oracle-737.json`, `PIN_RECOVERY_803.md`. Exit 0.
2. `pnpm install --frozen-lockfile`. Exit 0.
3. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 737`; `tar -xf benchmarks/corpus/ngspice-bugs/fetched/737/Test.zip -C benchmarks/corpus/ngspice-bugs/fetched/737`. Exit 0 each. Fetch-only files are git-ignored, not edited corpus artifacts.
4. `pnpm build`. Exit 0.
5. `spice-heavy pnpm exec tsx benchmarks/results/issue-1049/localize.ts <new-receipt.json>`. Exit 0. Refuses to overwrite an existing output. Per-probe native OP exits are 0; the deliberately disclosed short-transient exit is 1. Temporary include/config trees are private to this run and cleaned up.
6. `pnpm exec tsx benchmarks/results/issue-1049/localize.ts --check benchmarks/results/issue-1049/receipt.json`. Exit 0. Verifies exact headline values, all 98 shared signals, probe counts, short failures and the disable KCL finding. No ngspice process is spawned by this check.
7. `pnpm lint`. Exit 0.
8. `spice-heavy pnpm test`. Exit 0. Complete local monorepo suite passed, including 177 benchmark tests with 4 fetch-dependent skips and no benchmark failures. GitHub required checks on the PR's exact SHA remain the publication gate.
9. `pnpm -C packages/core exec tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 --types node ../../benchmarks/results/issue-1049/localize.ts`. Exit 0. This checks the diagnostic script, which is outside package lint's include list. An initial ad-hoc invocation without `--strict` exited 2 on an existing preprocessor union-narrowing error; using the project's strict mode passes without source edits.

No changeset is needed because packages/core is unchanged. Keep #1049 open. The remaining scope is a general numerical explanation of the residual OP differences, not per-circuit tuning or a transient-oracle claim.
