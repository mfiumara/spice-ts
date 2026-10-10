# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified against live GitHub state on 2026-10-10. The repository had 21 open issues: M1
[#75](https://github.com/mfiumara/spice-ts/issues/75), [#114](https://github.com/mfiumara/spice-ts/issues/114),
[#116](https://github.com/mfiumara/spice-ts/issues/116), [#117](https://github.com/mfiumara/spice-ts/issues/117),
[#121](https://github.com/mfiumara/spice-ts/issues/121)–[#125](https://github.com/mfiumara/spice-ts/issues/125), and
[#129](https://github.com/mfiumara/spice-ts/issues/129); M2
[#118](https://github.com/mfiumara/spice-ts/issues/118); M3
[#60](https://github.com/mfiumara/spice-ts/issues/60)–[#63](https://github.com/mfiumara/spice-ts/issues/63) and
[#106](https://github.com/mfiumara/spice-ts/issues/106); and M4 [#3](https://github.com/mfiumara/spice-ts/issues/3),
[#4](https://github.com/mfiumara/spice-ts/issues/4), [#5](https://github.com/mfiumara/spice-ts/issues/5),
[#7](https://github.com/mfiumara/spice-ts/issues/7), and [#76](https://github.com/mfiumara/spice-ts/issues/76).
Every open issue is represented below. A delivery is marked merged only when its PR is on `main`; accepted but
unmerged work remains an open gap. This reconciliation closes
[#117](https://github.com/mfiumara/spice-ts/issues/117) only when its PR merges.

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
| Netlist compatibility audit | [#55](https://github.com/mfiumara/spice-ts/issues/55) | [PR #79](https://github.com/mfiumara/spice-ts/pull/79) merged the fixture-backed support matrix and filed gaps |
| Convergence audit | [#56](https://github.com/mfiumara/spice-ts/issues/56) | [PR #68](https://github.com/mfiumara/spice-ts/pull/68) merged hard-circuit regressions and before/after evidence |
| Structured convergence telemetry | [#64](https://github.com/mfiumara/spice-ts/issues/64) | [PR #82](https://github.com/mfiumara/spice-ts/pull/82) merged typed phase, iteration, and retry diagnostics |
| Chua circuit | [#48](https://github.com/mfiumara/spice-ts/issues/48) | [PR #81](https://github.com/mfiumara/spice-ts/pull/81) merged reproducible UIC seeds, mutual-inductance support, and identical-netlist ngspice waveform evidence |
| Diode commutation transient parity | [#65](https://github.com/mfiumara/spice-ts/issues/65) | [PR #86](https://github.com/mfiumara/spice-ts/pull/86) merged the RED regression, diode series-resistance model, and matched-point ngspice comparison |
| Initial-state semantics | [#73](https://github.com/mfiumara/spice-ts/issues/73) | [PR #85](https://github.com/mfiumara/spice-ts/pull/85) merged `.ic`, `.nodeset`, `.tran uic`, parser, and execution coverage |
| PWL source semantics | [#74](https://github.com/mfiumara/spice-ts/issues/74) | [PR #83](https://github.com/mfiumara/spice-ts/pull/83) merged ngspice-compatible PWL parsing and execution coverage |
| Supported directive semantics | [#77](https://github.com/mfiumara/spice-ts/issues/77) | [PR #88](https://github.com/mfiumara/spice-ts/pull/88) merged option precedence plus control/output directive classification |
| Bounded resistor-noise analysis (partial #75) | [#75](https://github.com/mfiumara/spice-ts/issues/75) | [PR #96](https://github.com/mfiumara/spice-ts/pull/96) merged typed LIN output/input-referred resistor-noise spectra and identical-netlist ngspice evidence while retaining explicit rejection of unsupported variants and analyses |
| Bounded transfer-function analysis (partial #75) | [#105](https://github.com/mfiumara/spice-ts/issues/105) | [PR #112](https://github.com/mfiumara/spice-ts/pull/112), merge commit `a1665ae75d84364abeffa42f63358a69ef8622f3`, merged typed voltage gain/transimpedance and input/output resistance with identical-netlist ngspice evidence; differential/current outputs and stepped `.tf` remain explicitly unsupported |
| Advanced showcase circuits | [#30](https://github.com/mfiumara/spice-ts/issues/30) | [PR #84](https://github.com/mfiumara/spice-ts/pull/84), [PR #90](https://github.com/mfiumara/spice-ts/pull/90), and [PR #95](https://github.com/mfiumara/spice-ts/pull/95) merged six parity-backed demos, including the final BJT common-emitter and full-wave rectifier residuals |
| Correctness-first issue map | [#51](https://github.com/mfiumara/spice-ts/issues/51) | [PR #58](https://github.com/mfiumara/spice-ts/pull/58) merged the charter-aligned roadmap baseline |
| First-wave roadmap reconciliation | [#91](https://github.com/mfiumara/spice-ts/issues/91) | [PR #92](https://github.com/mfiumara/spice-ts/pull/92) reconciled the issue map after the first accepted merge wave |
| Second-wave roadmap reconciliation | [#100](https://github.com/mfiumara/spice-ts/issues/100) | [PR #102](https://github.com/mfiumara/spice-ts/pull/102) reconciled the live 14-issue inventory after the second accepted merge wave while preserving all recorded benchmark losses |
| Third-wave roadmap reconciliation | [#108](https://github.com/mfiumara/spice-ts/issues/108) | [PR #110](https://github.com/mfiumara/spice-ts/pull/110), merge commit `d8eaa9d487fc1259c537f3f58d08a9525491cb73`, reconciled the live 17-issue inventory after PRs #96, #102, and #103 while preserving all recorded benchmark losses |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Advanced analysis support | [#75](https://github.com/mfiumara/spice-ts/issues/75) | After the bounded LIN resistor-noise and `.tf` slices, DEC/OCT, differential outputs, integrated totals, stepped noise, differential/current-output and stepped `.tf`, `.pz`, `.sens`, and `.disto` remain explicitly unsupported |
| Aggregate 60-circuit parity report | [#114](https://github.com/mfiumara/spice-ts/issues/114) | Account for every circuit across the first three corpora in its fixed 60-circuit scope in deterministic machine-readable and readable reports, including every failure, unsupported case, matched-point error, and runtime |
| Xyce primitive-card parser gaps | [#116](https://github.com/mfiumara/spice-ts/issues/116) | Add RED fixtures for the nine current parse failures and fix only syntax that maps to already-supported semantics; unsupported models and devices remain explicit separate gaps |
| Reconcile this roadmap | [#117](https://github.com/mfiumara/spice-ts/issues/117) | This documentation-only PR closes the issue only after merge |
| JFET J-card and NJF models | [#121](https://github.com/mfiumara/spice-ts/issues/121) | Add ngspice-parity-backed J-card and NJF level 1/2 support for the two exposed Xyce fixtures; the current explicit unsupported-device failure must not be hidden |
| Xyce TIMEINT options | [#122](https://github.com/mfiumara/spice-ts/issues/122) | Map only TIMEINT fields with equivalent existing simulator semantics and keep every other simulation-relevant option explicitly unsupported |
| `jimi-fuzz` transient divergence | [#123](https://github.com/mfiumara/spice-ts/issues/123) | Fix the simulator root cause without per-circuit tuning; the current identical-netlist comparison reports 8.093888373420963 maximum absolute and 130.96868708823104 maximum relative error across 13 shared signals |
| Diode instance geometry | [#124](https://github.com/mfiumara/spice-ts/issues/124) | Implement `PJ` and other accepted geometry semantics with ngspice parity rather than silently dropping trailing D-card fields |
| Zero-ohm resistor handling | [#125](https://github.com/mfiumara/spice-ts/issues/125) | Implement an honest ideal-short treatment or equivalent topology transform for the exposed Xyce fixture without tolerance tuning |
| Fifth 20-circuit public corpus | [#129](https://github.com/mfiumara/spice-ts/issues/129) | Add exactly 20 unique, provenance-tracked circuits from a new licence-compatible source and report every unchanged-input failure, unsupported case, convergence result, and error |

The four public corpora currently contain 80 provenance-tracked circuits, not the ≥100 required for M1; #129 adds
the fifth 20-circuit corpus and reaches the count threshold only if all 20 unique entries land, while parity reporting,
error thresholds, filed gaps, and all open simulator bugs remain separate exit requirements. Corpus A's validator runs all 20
fixtures with ngspice (20/20 pass) and currently classifies 20/20 as unsupported or reclassified by spice-ts; it
also flags `jimi-fuzz` as newly parsing, so that catalogue status needs reconciliation rather than being promoted to
a parity result. Corpus B records 19/20 ngspice outputs and 0/20 spice-ts parses; its integrated report has zero
matched analyses because spice-ts remains unsupported on all 20. Corpus C records ngspice-47 at 13 pass and 7
fail/unsupported, while spice-ts records 0 pass, 9 parse failures, 7 unsupported cases, 4 execution failures, and 0
convergence failures. Corpus D records 0/20 passes for both engines on the unchanged ahkab decks: ngspice-47 rejects
all 20 on ahkab-specific syntax, while spice-ts records 19 parse failures and 1 unsupported case. #114 remains scoped
to the first three corpora and must aggregate all 60 entries and file focused gaps; none of these catalogue validation
or reporting results, nor reaching 100 catalogue entries, is by itself milestone completion.

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

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Long-running and continuous simulation performance (partial) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | Correct buck-boost long runs, bounded resources, and Falstad-style continuous/reset operation remain open after the merged measurement-only baseline |
| MNA topology-lock allocation reduction | [#118](https://github.com/mfiumara/spice-ts/issues/118) | Reduce profiled structural-union and CSC-construction allocation generally, with 1k/5k/10k before/after timing, RSS, and CPU-profile evidence |

The performance record keeps both sides visible. The refreshed PR #119 measurement reports the 10,000-node spice-ts
API at 20.88 ms and 208.94 MiB peak RSS versus ngspice-47 at 40.24 ms fresh-process CLI wall time, 3.55 ms internal
analysis time, and 24.47 MiB peak RSS. That is an embedding/startup win of 1.93× against fresh CLI wall time but
losses of 5.87× against internal analysis and 8.54× in memory. Historical PR #18 also reported transient and AC still
2–3× slower than ngspice-WASM. These are current
gaps to close, not evidence for a blanket superiority claim. PR #99's warmed 16-step RC case was also a loss:
parallel execution took 25.02 ms versus 4.04 ms sequential, or 0.16×. PR #111's identical 5 ms buck-boost netlist
reached neither engine's expected −12 V rail: spice-ts averaged 0.208176594 V at 154.250/154.156 MiB peak RSS,
while ngspice-47 averaged 0.013153286 V at 10.281/10.250 MiB. The baseline is measurement evidence, not correctness
or performance superiority.

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

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Core protocol adapter | [#60](https://github.com/mfiumara/spice-ts/issues/60) | Structured errors, cancellation, and resource limits over core simulation remain open |
| Bounded MCP simulation server | [#61](https://github.com/mfiumara/spice-ts/issues/61) | Typed tools with deterministic output and enforced execution bounds remain open |
| Worker and WASM facade | [#62](https://github.com/mfiumara/spice-ts/issues/62) | A protocol-compatible browser worker and WASM-facing API remain open |
| Executable agent workflows | [#63](https://github.com/mfiumara/spice-ts/issues/63) | Tested examples for tool-driven simulation and error recovery remain open |
| Typed singular-matrix errors (partial #60) | [#106](https://github.com/mfiumara/spice-ts/issues/106) | Replace real and complex sparse-solver singular-pivot errors with structured node and branch/source identity while preserving public API compatibility |

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
