# .temp directive #871: bounded semantics and receipts

## Scope and invariant

The last selected `.temp` card sets the circuit temperature after all `.options TEMP` fields, independent of card order. It feeds the same existing device-temperature channel and the numparam `TEMPER` value; no solver, device, behavioral-expression or control interpreter changes.

Supported: one decimal/exponent temperature, optional `=`, independent brace/quoted numparam expressions, last-card precedence. Native ngspice-47 uses `strtod`, not SPICE suffix parsing: empty `.temp` becomes 0 C; `abc`, `77C`, and `77k` fall back to 27 C with a warning. A nonfinite or nonphysical requested numeric temperature is explicitly rejected by spice-ts. Temperature-dependent `.temp` expressions are explicitly unsupported instead of being frozen to a guessed temperature.

Multiple values are explicitly unsupported. ngspice-47 does NOT sweep `.temp 77 127`: it warns and runs at 27 C. spice-ts reports an unsupported multi-temperature card instead of silently using the first value or claiming a sweep. Existing non-nominal noise and resistor-instance-temperature limitations remain. No broad temperature/model overhaul is claimed.

## Provenance and licences

- All controls under `controls/`, probe.py, compare.ts and the new tests are original project-authored MIT material (repository LICENSE). Both engines receive identical file bytes, recorded SHA-256 in before.json/after.json.
- Native source pin: imr/ngspice tag `ngspice-47`, commit `a80f6e3e95d51534905b1f23410a951802666656`. `src/frontend/inp.c`, inp_spsource lines 1165–1195: collect last `.temp`, optional `=`, apply after inp_dodeck, use strtod, warn/default27 on remaining characters. https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/frontend/inp.c . SHA-256 of fetched whole file: `8c88368b7fc0499d62b2b541321cb9c36e1a89aaec99f5a4c5a3a532cddd29db`. Source is not redistributed here.
- Existing ngspice-bugs ticket 871 provenance/licence: `../corpus/ngspice-bugs/manifest.json` and `tickets/871/README.md`. Original circuits.zip is fetch-only from its recorded SourceForge attachment URL; fetch.ts verifies the archive hash. Extracted original temper_capture.cir SHA-256 `adc2a088a75c677e2d932b28a3b5c6252dc0fa883d757ed75ce37637a565c7f9`. Original vendor/user bytes are not added here. Existing dot-card quotation temper_capture_cards.cir SHA-256 `3854db1e2370c499745ac56e1ee1971b4ca2b98f85cd9c0c28506969f1b438f4` is used unchanged.
- Existing corpus-f vbic99_dc.sp: BSD-3-Clause, upstream ngspice commit `3ef069fb1f04177a153f342a32d941fc20ff047e`; SHA-256 `8ba2c99e6946ac9033a8e5b8abf41812291839efa2c9536026a22ba546ca7018`. See `../corpus/corpus-f/SOURCES.md`; unchanged fixture, no new vendor redistribution.
- Shared SOURCES, manifests, aggregate, roadmap and CI files are intentionally untouched under this lane's reservation. Register these controls in shared provenance only under a later supervisor reservation.

## Reproduction

Baseline is clean origin/main `c03dae530f9428f025d03e1a7f5a0f132a995da6`. Baseline source was extracted with git archive into git-ignored `baseline/` inside this isolated worktree; optional compare.ts module path runs that immutable code. after.json runs the modified source in this PR, with the same source baseline recorded for attribution. Neither JSON is a claim that the final committed head existed before measurement.

    pnpm install --frozen-lockfile
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 871
    unzip -o benchmarks/corpus/ngspice-bugs/fetched/871/circuits.zip -d benchmarks/corpus/ngspice-bugs/fetched/871
    spice-heavy python3 benchmarks/temp-directive-871/probe.py
    mkdir -p benchmarks/temp-directive-871/baseline
    git archive c03dae530f9428f025d03e1a7f5a0f132a995da6 packages/core/src packages/core/package.json | tar -x -C benchmarks/temp-directive-871/baseline
    spice-heavy pnpm exec tsx benchmarks/temp-directive-871/compare.ts before.json benchmarks/temp-directive-871/baseline/packages/core/src/simulate.ts
    spice-heavy pnpm exec tsx benchmarks/temp-directive-871/compare.ts after.json

ngspice reference command per deck: `ngspice -n -D filetype=ascii -b -r <output.raw> <unchanged.cir>`. Version and machine/Node metadata are in receipts. Full-precision ASCII raw OP values are used when exported. The original control-script deck prints only six-digit current and quits; its scalar metric is necessarily rounded. VBIC99 control execution exports no aligned vectors: metrics stay null. No synthetic reference data, waveform interpolation, tolerance tuning or speed claim. Wall times are single samples; native startup and in-process first-call overhead differ.

## Results and losses

16 identical-netlist rows, with verified paired hashes:

- Before: all 16 stop at unsupported `.temp`; no numerical metrics.
- After: 12 of the 13 self-authored controls run with maximum and RMS relative error exactly 0 at the exported full-precision operating point (current, circuit TEMPER voltage, plus device instance TC voltage for the device control).
- The remaining control is the explicitly unsupported multi-value form. Native warning/fallback27 is recorded; spice-ts numerical metrics remain null.
- Unchanged temper_capture_cards.cir and fetched original temper_capture.cir now run. spice-ts i(V1) = -1/6 A; ngspice-47 = -1/56 A. Formal-k shadowing mismatch is NOT resolved by this change. Cards max/RMS relative error = 8.333333333333332; rounded original = 8.333334826666905. Keep this mismatch visible; never count it as numerical parity.
- Unchanged vbic99_dc.sp advances from unsupported `.temp` to `BJT 'q1' has a thermal node, but only VBIC (LEVEL=4) instances accept a fifth terminal`. Native ngspice succeeds with 51 rows; spice-ts remains an unsupported-model loss. Metrics null; not a VBIC99 implementation.

Later manifest handoff: ticket871 can move from blanket unsupported to successful temper deck execution with the above formal-k mismatch; corpus-f vbic99_dc must retain loss/unsupported and replace only the obsolete `.temp` blocker. Do not alter aggregate claims until that separately reserved metadata refresh runs.

## Verification

- RED: new initial file had 23 tests, 21 failed (unsupported `.temp`), 2 pre-existing rejection checks passed; red.log, exit1.
- GREEN: final dedicated file 25 tests; targeted seven-file run 309 passed, green.log, exit0. Includes sync/async parsing, TEMPER, device TC/instance factor, options preservation, unsupported limits, serialization, and identical batch/stream transient arrays.
- `pnpm build`, `pnpm lint`: exit0, build.log/lint.log.
- `spice-heavy pnpm test`: exit0, full-test.log; core 3502 passed/2 skipped, all remaining package suites passed; root Node benchmark suite 144 passed/4 skipped/0 failed.
- `spice-heavy pnpm exec tsx benchmarks/accuracy.ts`: exit0, accuracy.log. Generated shared accuracy-results.json was restored, not committed.
- Native probe and both comparison commands: exit0. All original losses/nulls retained in JSON/logs.

Old tests that asserted all `.temp` cards fail were changed to assert multi-value rejection or the existing non-nominal noise limitation. The differential-noise smoke harness similarly expects the unchanged compile-time temperature rejection; its netlist and numerical model are unchanged.

/poteto-mode activation: read installed alias ~/.claude/skills/poteto-mode/SKILL.md, canonical pstack/SKILL.md and feature playbook. Shared parser/preprocessor ownership stays in this one bounded lane; independent exact-head spice-ts-review child is the publication gate. Supervisor alone may merge after that review and exact-head required CI.

## PR #924 remediation: select before validating

The rejected head `93ba64d3fdaca0f8677217de1bef4082ad15cdf5` validated every `.temp` card, including overwritten cards. Native ngspice-47 instead selects the last card before interpreting its value. The remediation evaluates only that effective card and blanks obsolete cards before downstream parameter substitution and parsing. Final-card multi-value, nonphysical/nonfinite and temperature-dependent limitations remain unchanged.

Data shape: the selected card is an optional existing `PendingStatement`. Selection precedes value evaluation; no new parser or simulator API is added. Both callers of `circuitTemperature` use this selection, including unconditional temperature used for `.if` decisions. Only the final preprocessing pass suppresses obsolete statements, preserving line positions and branch selection.

Regression coverage exercises sync/async parsing and batch/stream transient results at 77 C after overridden multi-value, nonphysical, malformed, undefined-parameter and TEMPER-expression cards. The final effective unsupported cards still reject through all four surfaces. RED was recorded before the fix in commit `986a3b5a`: 33 tests, 5 failed, 28 passed, exit1. GREEN: 33 dedicated tests and 317 focused tests pass, exit0. Logs use the `remediation-` prefix; the original receipts above remain unchanged.

Reproduce against the rejected source, not the original main baseline:

    git archive 93ba64d3fdaca0f8677217de1bef4082ad15cdf5 packages/core/src packages/core/package.json | tar -x -C benchmarks/temp-directive-871/baseline
    spice-heavy pnpm exec tsx benchmarks/temp-directive-871/compare.ts remediation-before.json benchmarks/temp-directive-871/baseline/packages/core/src/simulate.ts
    spice-heavy pnpm exec tsx benchmarks/temp-directive-871/compare.ts remediation-after.json

Both comparison commands exit0. The JSON baseline field is the measurement-time HEAD `986a3b5a`, before the fix was committed. The explicit module path above identifies the immutable rejected source used for the before report. The after report uses the working-tree fix. Timing remains single-run process/in-process wall time, not a speed comparison.

The 18 paired rows retain all 16 original deck hashes and maximum/RMS error metrics unchanged, plus two original MIT controls. Both engines receive identical netlists:

- `overridden-multiple.cir`: `.temp 27 77` then `.temp 77`. Before throws unsupported multi-temperature; after succeeds at 77 C.
- `overridden-nonphysical.cir`: `.temp -300` then `.temp 77`. Before throws invalid temperature; after succeeds at 77 C.
- Both new controls have ngspice and spice-ts i(V1) = -0.0009285051067780873 A and TEMPER voltage = 77 V. Maximum and RMS relative error are exactly zero for both matched OP signals.
- Native exits0 for all18 rows. Fourteen controls have zero maximum/RMS relative error. Final multi-value and VBIC99 losses retain null metrics. Formal-k cards/original retain relative errors 8.333333333333332 and 8.333334826666905, respectively. No loss is hidden or counted as parity.

Remediation verification:

- `pnpm install --frozen-lockfile`: exit0. Initial test attempt without dependencies returned254 (`vitest` missing); the recorded RED follows installation.
- `pnpm -C packages/core exec vitest run src/parser/temp-directive-871.test.ts src/parser/preprocessor.test.ts src/parser/options-directives.test.ts src/parser/ngspice-compatibility.test.ts src/options-temp.test.ts src/parser/param-functions-870.test.ts src/analysis/noise.test.ts`: exit0, 317 passed.
- `pnpm build && pnpm lint`: both exit0.
- `spice-heavy pnpm test`: exit0, core3510 passed/2 skipped, all other package suites pass; root benchmark Node suite144 passed/4 skipped/0 failed.
- `spice-heavy pnpm exec tsx benchmarks/accuracy.ts`: exit0. The existing BJT CE analytic metric remains 2.61%; the report contains no aligned native metrics, so it is not a new ngspice parity claim. Generated shared accuracy-results.json was restored.
- Guarded before/after comparison: exit0, 18 paired hashes verified, original16 hashes/metrics unchanged.

/poteto-mode remediation activation: read installed spice-ts-engineer pstack `skills/poteto-mode/SKILL.md`, bug-fix playbook and `skills/how/SKILL.md` directly after the plugin-qualified skill loader reported unavailable. Scope remains preprocessor, dedicated tests and this receipt directory. No control, XSPICE, circuit, solver, device, shared provenance or CI edits.
