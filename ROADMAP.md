# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified against live GitHub state on 2026-10-10. The repository had 21 open issues: all
18 issues labelled `program:agent`, plus milestone issues [#27](https://github.com/mfiumara/spice-ts/issues/27),
[#30](https://github.com/mfiumara/spice-ts/issues/30), and [#32](https://github.com/mfiumara/spice-ts/issues/32).
Every one is represented below. A delivery is marked merged only when its PR is on `main`; accepted but unmerged
work remains an open gap. This reconciliation closes [#91](https://github.com/mfiumara/spice-ts/issues/91) only
when its PR merges.

## M1 Correctness parity

**Exit:** All open simulator bugs fixed; ≥100 public benchmark circuits run against ngspice in CI-able harness;
published parity report; agreed error thresholds met or gaps filed

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| Boost converter LTE collapse | [#43](https://github.com/mfiumara/spice-ts/issues/43) | [PR #78](https://github.com/mfiumara/spice-ts/pull/78) merged the RED regression, identical-netlist ngspice comparison, and general LTE retry fix |
| Common-source amplifier AC gain | [#44](https://github.com/mfiumara/spice-ts/issues/44) | [PR #66](https://github.com/mfiumara/spice-ts/pull/66) merged biased small-signal parity coverage |
| Comparison harness v2 | [#52](https://github.com/mfiumara/spice-ts/issues/52) | [PR #71](https://github.com/mfiumara/spice-ts/pull/71) merged CI-runnable OP/DC, AC, and TRAN aligned-error reports |
| Public ngspice corpus A | [#53](https://github.com/mfiumara/spice-ts/issues/53) | [PR #80](https://github.com/mfiumara/spice-ts/pull/80) merged 20 provenance-tracked fixtures; its BJT CE result remains an informational 2.70% bias warning, not a hidden pass |
| Netlist compatibility audit | [#55](https://github.com/mfiumara/spice-ts/issues/55) | [PR #79](https://github.com/mfiumara/spice-ts/pull/79) merged the fixture-backed support matrix and filed gaps |
| Convergence audit | [#56](https://github.com/mfiumara/spice-ts/issues/56) | [PR #68](https://github.com/mfiumara/spice-ts/pull/68) merged hard-circuit regressions and before/after evidence |
| Structured convergence telemetry | [#64](https://github.com/mfiumara/spice-ts/issues/64) | [PR #82](https://github.com/mfiumara/spice-ts/pull/82) merged typed phase, iteration, and retry diagnostics |
| PWL source semantics | [#74](https://github.com/mfiumara/spice-ts/issues/74) | [PR #83](https://github.com/mfiumara/spice-ts/pull/83) merged ngspice-compatible PWL parsing and execution coverage |
| Supported directive semantics | [#77](https://github.com/mfiumara/spice-ts/issues/77) | [PR #88](https://github.com/mfiumara/spice-ts/pull/88) merged option precedence plus control/output directive classification |
| Correctness-first issue map | [#51](https://github.com/mfiumara/spice-ts/issues/51) | [PR #58](https://github.com/mfiumara/spice-ts/pull/58) merged the charter-aligned roadmap baseline |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Chua circuit | [#48](https://github.com/mfiumara/spice-ts/issues/48) | Reproducible initial conditions and an identical-netlist waveform comparison remain open |
| Public classic/app-note corpus B | [#54](https://github.com/mfiumara/spice-ts/issues/54) | At least 20 circuits across at least four categories, with recorded source and licence, remain open |
| Diode commutation transient parity | [#65](https://github.com/mfiumara/spice-ts/issues/65) | The reported 26.6% RMS divergence still needs a RED regression and general fix |
| Initial-state semantics | [#73](https://github.com/mfiumara/spice-ts/issues/73) | `.ic`, `.nodeset`, `.tran uic`, and restored ring-oscillator waveform evidence are not yet merged on `main` |
| Advanced analysis support | [#75](https://github.com/mfiumara/spice-ts/issues/75) | Parser and execution coverage for advanced ngspice analyses remains open |
| Advanced showcase circuits (partial) | [#30](https://github.com/mfiumara/spice-ts/issues/30) | [PR #84](https://github.com/mfiumara/spice-ts/pull/84) and [PR #90](https://github.com/mfiumara/spice-ts/pull/90) merged four parity-backed demos; BJT common-emitter and full-wave rectifier demos remain open, so the issue is not complete |
| Reconcile this roadmap | [#91](https://github.com/mfiumara/spice-ts/issues/91) | This documentation-only PR closes the issue only after merge |

The showcase evidence includes losses as well as wins. The passive notch in PR #90 was near matched-point parity,
while the differentiator output reported max/RMS relative error of 0.917/0.180 and excluded 401 zero-reference
points from relative metrics. Demos remain supporting evidence, not substitutes for the M1 corpus and report.

## M2 Performance

**Exit:** Sparse/reuse solver path; scaling benchmark to ≥10k nodes; published runtime comparison vs ngspice

Optimization follows correctness measurement and must not weaken parity thresholds.

### Merged deliveries

| Work | Issue | Merged evidence |
|------|-------|-----------------|
| Sparse LU | [#8](https://github.com/mfiumara/spice-ts/issues/8) | [PR #18](https://github.com/mfiumara/spice-ts/pull/18) merged the Gilbert–Peierls sparse solver, pattern reuse, solver tests, and a three-way comparison benchmark |
| 10k-node measurement baseline (partial #40) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | [PR #72](https://github.com/mfiumara/spice-ts/pull/72) merged deterministic scaling measurements through 10,000 nodes; it did not close long-running or continuous simulation scope |
| Sparse MNA stamp lookup | [#69](https://github.com/mfiumara/spice-ts/issues/69) | [PR #89](https://github.com/mfiumara/spice-ts/pull/89) replaced dense O(n²) position storage with O(nnz) open-addressed lookup |

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Parallel `.step` execution | [#27](https://github.com/mfiumara/spice-ts/issues/27) | Browser and Node worker paths with deterministic sequential fallback remain open |
| Long-running and continuous simulation performance (partial) | [#40](https://github.com/mfiumara/spice-ts/issues/40) | Correct buck-boost long runs, bounded resources, and Falstad-style continuous/reset operation remain open after the measurement-only baseline |
| Sparse symbolic-analysis reuse | [#70](https://github.com/mfiumara/spice-ts/issues/70) | Reuse across unchanged topology still needs parity checks and before/after timings |

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

### Open residual gaps

| Work | Issue | Current residual |
|------|-------|------------------|
| Probe interactions in the schematic viewer | [#32](https://github.com/mfiumara/spice-ts/issues/32) | Node and branch probing across transient, AC, and DC views remains open |
| `circuit-json` adapter | [#35](https://github.com/mfiumara/spice-ts/issues/35) | Bidirectional typed conversion isolated from zero-dependency core/UI remains open |
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
