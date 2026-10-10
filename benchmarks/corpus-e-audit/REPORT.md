# Unchanged Gnucap corpus-E gap audit

This audit runs all 20 provenance-tracked fixtures byte-for-byte through both engines. It does not adapt fixtures, alter tolerances, or claim simulator superiority.

## Result

- ngspice: 5/20 pass; parser=2, device/model=2, analysis=11, convergence=0, execution=0.
- spice-ts: 14/20 pass; parser=5, device/model=1, analysis=0, convergence=0, execution=0.
- Issue #228 baseline at `f737698e90b4e025de65c9f621fcf75f6c27b15d`: spice-ts 4/20 pass; parser=3, device/model=0, analysis=13, convergence=0, execution=0; outcome SHA-256 `dd99c57c31e72613e2e532ab0708d9810b0e6d5d09950ba74c03539b66314290`.
- All 20 baseline/current status and first-cause pairs are below: 15 changed and 5 unchanged; 10 fail-to-pass transitions and 0 pass-to-fail regressions.
- Losses remain explicit. ngspice-pass/spice-ts-fail fixtures: none. Remaining spice-ts failures: vcvs-operating-point (parser), transmission-line-ac (parser), mutual-inductance-ac (device/model), opamp-open-loop-ac (parser), opamp-voltage-follower (parser), mos7-nand-no-bypass (parser).
- The pass counts are execution statuses, not waveform parity. Different accepted syntax and device coverage make them unsuitable for a simulator-superiority claim.
- Fixture-set SHA-256: `e6346a45392800a58c186eb691d242f4b88611f1609b29db4b0f1c1110a08897`.
- Deterministic outcome SHA-256: `163acb09d3c7225916ea9dca4336ebbe97b7fd0e4c706a46538f3b1934d8727d`.

## Reproduction receipt

- Source: https://github.com/gnucap/gnucap at `5acb027125d6ea7c546badd03e026d8781c6a400`; adaptation: none.
- ngspice command: `ngspice -b -r output.raw <unchanged-fixture-basename>`.
- spice-ts command: `node benchmarks/corpus/corpus-e/run-spice-ts.mjs <repo-root> <unchanged-fixture-path>`.
- Audit command: `node benchmarks/corpus-e-audit/audit.mjs --write`.
- Focused verification: `node --test benchmarks/corpus-e-audit/audit.test.mjs`.
- Versions: ** ngspice-47 : Circuit level simulation program; Node v22.23.1; spice-ts head `80cd13123ef9943b27bf2dca5134c0b0016b55e0`.
- Machine: macOS 27.0.1, arm64, Apple M5 Pro, 51539607552 bytes RAM.
- Each ngspice temporary copy and each spice-ts runner response was SHA-256 checked against the committed manifest before its result was accepted.

## Classification rule

The first hard engine diagnostic is mapped, in order, to parser, device/model, analysis, convergence, or execution. Passing requires a zero exit, a non-empty ngspice raw file with no hard diagnostic, or a successful spice-ts simulation. The focused tests exercise every cause, including zero-count convergence and execution buckets.

## Per-fixture evidence

| Fixture | Input SHA-256 | ngspice current | spice-ts #228 baseline | spice-ts current | spice-ts transition |
|---|---|---|---|---|---|
| cccs-mixed-analysis | `87e7a7e164e9cdac5891b12fd038c06945043f5455a79fb31d26c97bc0463e05` | fail — analysis: unimplemented dot command '.list' | fail/analysis | pass | fail/analysis → pass |
| vcvs-operating-point | `cd4c6c8b18a27254b06859424268763a7f5b4a39a648981fc27d6a18b91e2cd1` | fail — parser: device already exists, bail out | fail/analysis | fail — parser: Parse error at line 17: Cannot read properties of undefined (reading 'trim') | fail/analysis → fail/parser |
| diode-bias-sweep | `f84c531a2e0b4ef201f1cef5d85279b360d5fd20d17d3deb91563581a9371055` | pass | pass | pass | pass → pass |
| mos1-inverter-sweep | `e832b2a4c0099a68c035342e81e780256fa8369239fcd61c0fd1ad5a5a249de5` | pass | fail/analysis | pass | fail/analysis → pass |
| transmission-line-ac | `99cc373d602fad9ecd4ea0e8f14d9eba9322b0083ae02c7631091dcbece7828b` | fail — parser: unknown parameter (gen) | fail/analysis | fail — parser: Parse error at line 5: Cannot parse number: 'gen' | fail/analysis → fail/parser |
| mutual-inductance-ac | `45bf5fdc96b7985a744455ff7c3222478665e3db487bbcfedc5c7efa8297fc3c` | fail — analysis: unimplemented dot command '.list' | fail/analysis | fail — device/model: K-element 'k1' references unknown or non-inductor device(s): l1a, l1b | fail/analysis → fail/device/model |
| bjt-diffpair-ac | `f8cde99b71d9978c5216dffbc9dfc036c8bdf7b37f1c9949fa9835e6eb741213` | fail — analysis: unimplemented dot command '.status' | fail/analysis | pass | fail/analysis → pass |
| opamp-open-loop-ac | `92e47652dbecdbd2c971cce3c047fc0b8e4a0406a7d2c953dffce299c60b183c` | fail — analysis: Missing DEC, OCT, or LIN. | fail/parser | fail — parser: Parse error at line 49: Cannot read properties of undefined (reading 'toLowerCase') | fail/parser → fail/parser |
| capacitor-step-transient | `2c0864497272439baa44213381271915107ccd9f8c47354df2e4b9c3028a1608` | fail — analysis: unimplemented dot command '.list' | fail/parser | pass | fail/parser → pass |
| capacitor-initial-condition | `65199506e3a8b9bd05b3842cc9ef180308d0d02ba2e9857e89f7f1f8c32c3c84` | fail — analysis: unimplemented dot command '.list' | fail/analysis | pass | fail/analysis → pass |
| lc-oscillator-transient | `020684099d172ec7cc2a6fe3d57792ef51b3d9162f41f83ed486704062d6d702` | fail — analysis: unimplemented dot command '.status' | fail/parser | pass | fail/parser → pass |
| bjt-diffpair-transient | `f142fa0c6378f80666343a83c8582cca065ed7ad5d49dd3d9e5cd88e7474301e` | pass | pass | pass | pass → pass |
| bjt-schmitt-trigger | `ec6efed82593b525b1661173b3a11dbec4880449968389ff86424051d42274b5` | fail — device/model: unknown parameter (1) | pass | pass | pass → pass |
| diode-temperature-sweep | `d2d7df0b8050008df98e6a8410433c6ef346d9851371c2032edaeb0c9c43dd48` | fail — analysis: unimplemented dot command '.list' | fail/analysis | pass | fail/analysis → pass |
| mos1-nand-transient | `183f57f24707d2597f83396a777896e336a17a4ec8a13027f89c5029440d8300` | fail — analysis: Error: unknown parameter on .tran - ignored | fail/analysis | pass | fail/analysis → pass |
| bjt-rtl-inverter-chain | `48b7f67014d43f0c9987ebbc9b349cf53908cc51426d784c4be6db3397fd6e2d` | pass | fail/analysis | pass | fail/analysis → pass |
| dual-lc-uic-rejection | `f1f6a53ef0bb2d41988b1ec4fb022abea8830cd8a847aa3b693d96fe7e66e36d` | fail — analysis: unimplemented dot command '.status' | fail/analysis | pass | fail/analysis → pass |
| opamp-voltage-follower | `923e0da63d9fbeca5cb94d049af3f85036f5b1a1af38a0701dbed8c258ff1ebd` | fail — analysis: unimplemented dot command '.stat' | fail/analysis | fail — parser: Parse error at line 35: Unsupported behavior-changing .options field: 'dampstrategy' | fail/analysis → fail/parser |
| mos7-nand-no-bypass | `81a387433d50c7d280d2b80d2463f3a9d42fc6ea969ef783333b16eaca046868` | fail — device/model: Device type MOS7 not available in this binary | fail/analysis | fail — parser: Parse error at line 3: Unsupported behavior-changing .options field: 'noincmode' | fail/analysis → fail/parser |
| bjt-diffpair-current-source | `7060377579bdb6bfef87225ee4710b81744462af1548ccff755adf061f14f37c` | pass | pass | pass | pass → pass |

## Gap tracking

- Analysis/directive compatibility: [#228](https://github.com/mfiumara/spice-ts/issues/228).
- Source-syntax compatibility: [#227](https://github.com/mfiumara/spice-ts/issues/227).
- Device/model gaps are deduplicated against [#76](https://github.com/mfiumara/spice-ts/issues/76) (including coupled inductors), [#7](https://github.com/mfiumara/spice-ts/issues/7) (lossless T-lines), and [#3](https://github.com/mfiumara/spice-ts/issues/3) (advanced MOS models).
- Advanced analysis families remain tracked by [#75](https://github.com/mfiumara/spice-ts/issues/75).

## /poteto-mode receipt

Loaded `pstack:poteto-mode`, `pstack:how`, the feature playbook, and `pstack:architect`; compared a policy-table design with the chosen lower-surface inline parser-helper design. Parser RED commit `c4cfe9bee38f9d90d4f2e0b4ece9ee83563fcb78` produced 21 failed / 46 passed across 67 focused cases. GREEN passed all 67. Audit RED commit `40e830182bc1d52c14b21db15b0bd8855d9eaafd` failed the K-element classification and post-change totals. GREEN runs both engines over all 20 unchanged fixtures, locks totals and stable hashes, and records every #228 transition. REFACTOR keeps output-only classification internal and leaves every corpus fixture, manifest, source revision, and tolerance unchanged.
