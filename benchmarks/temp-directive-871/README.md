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
