# spice-ts Roadmap

spice-ts is pursuing correctness parity with ngspice before performance, AI-native APIs, or additional device
models. [CHARTER.md](CHARTER.md) is the source of truth for priorities and program rules; this document is the
public issue map and measurable delivery sequence.

Issue state below was verified on 2026-10-09. At that snapshot, all 12 open issues that predate the program and
all seven program issues [#51](https://github.com/mfiumara/spice-ts/issues/51)–[#57](https://github.com/mfiumara/spice-ts/issues/57)
are represented. This rewrite closes #51 when merged.

## M1 Correctness parity

**Exit:** all open simulator bugs are fixed; at least 100 public benchmark circuits run against ngspice in a
CI-able harness; a parity report is published; agreed error thresholds are met or every remaining gap is filed.

| Work | Issue | Delivery evidence expected |
|------|-------|----------------------------|
| Boost converter output collapse | [#43](https://github.com/mfiumara/spice-ts/issues/43) | RED regression, ngspice comparison, and a general solver fix |
| Common-source amplifier AC gain | [#44](https://github.com/mfiumara/spice-ts/issues/44) | Biased small-signal result compared with the identical ngspice netlist |
| Chua circuit | [#48](https://github.com/mfiumara/spice-ts/issues/48) | Reproducible initial conditions and waveform comparison |
| Comparison harness v2 | [#52](https://github.com/mfiumara/spice-ts/issues/52) | CI-runnable OP/DC, AC, and TRAN reports with aligned waveform errors |
| Public ngspice corpus | [#53](https://github.com/mfiumara/spice-ts/issues/53) | At least 20 licensed or reproducibly fetched circuits with provenance |
| Public classic/app-note corpus | [#54](https://github.com/mfiumara/spice-ts/issues/54) | At least 20 circuits across at least four categories, with provenance |
| Netlist compatibility audit | [#55](https://github.com/mfiumara/spice-ts/issues/55) | Fixture-backed supported/partial/unsupported matrix and filed gaps |
| Convergence audit | [#56](https://github.com/mfiumara/spice-ts/issues/56) | At least three distinct hard-circuit regressions and before/after evidence |
| Advanced showcase circuits | [#30](https://github.com/mfiumara/spice-ts/issues/30) | Correctness-backed examples; demos do not substitute for parity evidence |
| Keep this issue map current | [#51](https://github.com/mfiumara/spice-ts/issues/51) | This documentation-only rewrite |

## M2 Performance

**Exit:** a sparse/reuse solver path is in place; a scaling benchmark reaches at least 10,000 nodes; and a
reproducible runtime comparison against ngspice is published. Optimization follows correctness measurement and
must not weaken parity thresholds.

| Work | Issue | Delivery evidence expected |
|------|-------|----------------------------|
| Parallel `.step` execution | [#27](https://github.com/mfiumara/spice-ts/issues/27) | Browser and Node worker paths with deterministic sequential fallback |
| Long-running and continuous simulation performance | [#40](https://github.com/mfiumara/spice-ts/issues/40) | Reproducible long-run timing, bounded resource use, and correct converter results |

Sparse LU is not future work. [Issue #8](https://github.com/mfiumara/spice-ts/issues/8) is closed and was delivered
by merged [PR #18](https://github.com/mfiumara/spice-ts/pull/18), which added the Gilbert–Peierls sparse solver,
pattern reuse, solver tests, and a three-way comparison benchmark. That PR also reported losses: transient and AC
were still 2–3× slower than ngspice-WASM. The remaining M2 exit is therefore reuse/scaling measurement and closing
the gaps shown by current benchmarks—not reimplementing #8 or repeating its historical headline numbers as current
results.

## M3 AI-native API

**Exit:** an MCP server package, JSON netlist schema, structured errors, and agent-focused documentation and
examples are delivered. Results must remain deterministic; streaming, cancellation, resource limits, and WASM
packaging must have explicit contracts.

| Work | Issue | Delivery evidence expected |
|------|-------|----------------------------|
| Probe interactions in the schematic viewer | [#32](https://github.com/mfiumara/spice-ts/issues/32) | Node/branch probing across transient, AC, and DC views |
| `circuit-json` adapter | [#35](https://github.com/mfiumara/spice-ts/issues/35) | Bidirectional typed conversion isolated from zero-dependency core/UI |
| MCP, JSON, structured-error, and WASM API design | [#57](https://github.com/mfiumara/spice-ts/issues/57) | Concrete package/schema contracts and independently testable follow-ups |

## M4 Device models

**Exit:** Gummel–Poon, BSIM4 (or a documented subset), EKV, and a lossless transmission line are implemented and
verified. Benchmark gaps determine model order; feature breadth does not outrank known correctness bugs.

| Work | Issue | Delivery evidence expected |
|------|-------|----------------------------|
| BSIM4 MOSFET model or documented subset | [#3](https://github.com/mfiumara/spice-ts/issues/3) | Reference operating points and benchmark-driven supported parameter set |
| EKV compact MOSFET model | [#4](https://github.com/mfiumara/spice-ts/issues/4) | Reference-circuit operating points across inversion regions |
| Gummel–Poon BJT model | [#5](https://github.com/mfiumara/spice-ts/issues/5) | Reference operating points and multi-BJT convergence coverage |
| Lossless transmission line | [#7](https://github.com/mfiumara/spice-ts/issues/7) | Matched and mismatched transient step-response comparisons |

## Benchmark policy

- Record every circuit's source URL, revision, licence, redistribution decision, and adaptations in
  `benchmarks/SOURCES.md`. If redistribution is forbidden, commit deterministic fetch instructions instead.
- Run spice-ts and ngspice on semantically identical netlists. Record versions, machine, commands, analysis type,
  convergence status, runtime, and matched-point max/RMS absolute and relative waveform errors.
- Publish failures, unsupported features, and speed losses alongside wins. Never cherry-pick circuits, hide errors
  with per-circuit tolerance tuning, or claim category superiority without reproducible evidence.

## Publication boundary

The program may create and update GitHub issues, labels, milestones, Projects, branches, and PRs in
`mfiumara/spice-ts`. A PR may be squash-merged only when CI is green on its exact head SHA and an independent
`spice-ts-review` has accepted that same SHA.

Without Mattia's approval, the program must not publish npm packages, create tags or releases, publish changeset
versions, change Vercel production deployment, force-push `main`, spend money, touch secrets, edit
`~/repos/spicets/web`, or post on social media.
