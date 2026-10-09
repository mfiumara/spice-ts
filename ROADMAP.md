# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified against live GitHub state on 2026-10-10. The repository had 14 open issues: M1
[#75](https://github.com/mfiumara/spice-ts/issues/75), [#100](https://github.com/mfiumara/spice-ts/issues/100),
and [#101](https://github.com/mfiumara/spice-ts/issues/101); M2
[#27](https://github.com/mfiumara/spice-ts/issues/27) and [#40](https://github.com/mfiumara/spice-ts/issues/40);
M3 [#60](https://github.com/mfiumara/spice-ts/issues/60)–[#63](https://github.com/mfiumara/spice-ts/issues/63);
and M4 [#3](https://github.com/mfiumara/spice-ts/issues/3),
[#4](https://github.com/mfiumara/spice-ts/issues/4), [#5](https://github.com/mfiumara/spice-ts/issues/5),
[#7](https://github.com/mfiumara/spice-ts/issues/7), and [#76](https://github.com/mfiumara/spice-ts/issues/76).
Every open issue is represented below. A delivery is marked merged only when its PR is on `main`; accepted but
unmerged work remains an open gap. This reconciliation closes
[#100](https://github.com/mfiumara/spice-ts/issues/100) only when its PR merges.

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
| Netlist compatibility audit | [#55](https://github.com/mfiumara/spice-ts/issues/55) | [PR #79](https://github.com/mfiumara/spice-ts/pull/79) merged the fixture-backed support matrix and filed gaps |
| Convergence audit | [#56](https://github.com/mfiumara/spice-ts/issues/56) | [PR #68](https://github.com/mfiumara/spice-ts/pull/68) merged hard-circuit regressions and before/after evidence |
| Structured convergence telemetry | [#64](https://github.com/mfiumara/spice-ts/issues/64) | [PR #82](https://github.com/mfiumara/spice-ts/pull/82) merged typed phase, iteration, and retry diagnostics |
| Chua circuit | [#48](https://github.com/mfiumara/spice-ts/issues/48) | [PR #81](https://github.com/mfiumara/spice-ts/pull/81) merged reproducible UIC seeds, mutual-inductance support, and identical-netlist ngspice waveform evidence |
| Diode commutation transient parity | [#65](https://github.com/mfiumara/spice-ts/issues/65) | [PR #86](https://github.com/mfiumara/spice-ts/pull/86) merged the RED regression, diode series-resistance model, and matched-point ngspice comparison |
| Initial-state semantics | [#73](https://github.com/mfiumara/spice-ts/issues/73) | [PR #85](https://github.com/mfiumara/spice-ts/pull/85) merged `.ic`, `.nodeset`, `.tran uic`, parser, and execution coverage |
| PWL source semantics | [#74](https://github.com/mfiumara/spice-ts/issues/74) | [PR #83](https://github.com/mfiumara/spice-ts/pull/83) merged ngspice-compatible PWL parsing and execution coverage |
| Supported directive semantics | [#77](https://github.com/mfiumara/spice-ts/issues/77) | [PR #88](https://github.com/mfiumara/spice-ts/pull/88) merged option precedence plus control/output directive classification |
| Advanced showcase circuits | [#30](https://github.com/mfiumara/spice-ts/issues/30) | [PR #84](https://github.com/mfiumara/spice-ts/pull/84), [PR #90](https://github.com/mfiumara/spice-ts/pull/90), and [PR #95](https://github.com/mfiumara/spice-ts/pull/95) merged six parity-backed demos, including the final BJT common-emitter and full-wave rectifier residuals |
| Correctness-first issue map | [#51](https://github.com/mfiumara/spice-ts/issues/51) | [PR #58](https://github.com/mfiumara/spice-ts/pull/58) merged the charter-aligned roadmap baseline |
| First-wave roadmap reconciliation | [#91](https://github.com/mfiumara/spice-ts/issues/91) | [PR #92](https://github.com/mfiumara/spice-ts/pull/92) reconciled the issue map after the first accepted merge wave |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Advanced analysis support | [#75](https://github.com/mfiumara/spice-ts/issues/75) | Parser and execution coverage for advanced ngspice analyses remains open |
| Integrate classic corpus into comparison reporting | [#101](https://github.com/mfiumara/spice-ts/issues/101) | Run the byte-identical corpus through the CI-able comparison report; preserve the current 19/20 ngspice success and 0/20 spice-ts parser loss unless implementation changes them |
| Reconcile this roadmap | [#100](https://github.com/mfiumara/spice-ts/issues/100) | This documentation-only PR closes the issue only after merge |

The two public corpora currently contain 40 provenance-tracked circuits, not the ≥100 required for M1. Corpus A's
validator runs all 20 fixtures with ngspice (20/20 pass) and currently classifies 20/20 as unsupported or
reclassified by spice-ts; it also flags `jimi-fuzz` as newly parsing, so that catalogue status needs reconciliation
rather than being promoted to a parity result. Corpus B records 19/20 ngspice outputs and 0/20 spice-ts parses; its
integration into the comparison report remains #101. These are catalogued validation results, not a parity report
or milestone completion.

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
| Sparse MNA stamp lookup | [#69](https://github.com/mfiumara/spice-ts/issues/69) | [PR #89](https://github.com/mfiumara/spice-ts/pull/89) replaced dense O(n²) position storage with O(nnz) open-addressed lookup |
| Sparse symbolic-analysis reuse | [#70](https://github.com/mfiumara/spice-ts/issues/70) | [PR #97](https://github.com/mfiumara/spice-ts/pull/97) reused unchanged topology with parity checks and paired timings; 10k DC sweep improved 47.94%, while 10k one-shot OP and LC-50 transient regressed 1.28% and 1.75% respectively |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Parallel `.step` execution | [#27](https://github.com/mfiumara/spice-ts/issues/27) | Browser and Node worker paths with deterministic sequential fallback remain open |
| Long-running and continuous simulation performance (partial) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | Correct buck-boost long runs, bounded resources, and Falstad-style continuous/reset operation remain open after the measurement-only baseline |

The performance record keeps both sides visible. PR #72 measured the 10,000-node spice-ts API 1.41× faster than
fresh-process ngspice CLI wall time, but 8.02× slower than ngspice's internal analysis timer and at 37.39× its
peak RSS. Historical PR #18 also reported transient and AC still 2–3× slower than ngspice-WASM. These are current
gaps to close, not evidence for a blanket superiority claim.

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
