# Unchanged Gnucap corpus-E gap audit

This audit runs all 20 provenance-tracked fixtures byte-for-byte through both engines. It does not adapt fixtures, alter tolerances, or claim simulator superiority.

## Result

- ngspice: 5/20 pass; parser=2, device/model=2, analysis=11, convergence=0, execution=0.
- spice-ts: 4/20 pass; parser=3, device/model=0, analysis=13, convergence=0, execution=0.
- The issue's 0/20 spice-ts baseline is not preserved: the unchanged-input rerun produces 4/20 passes after intervening simulator changes. The loss remains explicit: ngspice passes 5/20 while spice-ts passes 4/20.
- Fixture-set SHA-256: `e6346a45392800a58c186eb691d242f4b88611f1609b29db4b0f1c1110a08897`.
- Deterministic outcome SHA-256: `dd99c57c31e72613e2e532ab0708d9810b0e6d5d09950ba74c03539b66314290`.

## Reproduction receipt

- Source: https://github.com/gnucap/gnucap at `5acb027125d6ea7c546badd03e026d8781c6a400`; adaptation: none.
- ngspice command: `ngspice -b -r output.raw <unchanged-fixture-basename>`.
- spice-ts command: `node benchmarks/corpus/corpus-e/run-spice-ts.mjs <repo-root> <unchanged-fixture-path>`.
- Audit command: `node benchmarks/corpus-e-audit/audit.mjs --write`.
- Focused verification: `node --test benchmarks/corpus-e-audit/audit.test.mjs`.
- Versions: ** ngspice-47 : Circuit level simulation program; Node v22.23.1; spice-ts head `80a6f3f586410bb30c63e5a790ee253ba0d5c445`.
- Machine: macOS 27.0.1, arm64, Apple M5 Pro, 51539607552 bytes RAM.
- Each ngspice temporary copy and each spice-ts runner response was SHA-256 checked against the committed manifest before its result was accepted.

## Classification rule

The first hard engine diagnostic is mapped, in order, to parser, device/model, analysis, convergence, or execution. Passing requires a zero exit, a non-empty ngspice raw file with no hard diagnostic, or a successful spice-ts simulation. The focused tests exercise every cause, including zero-count convergence and execution buckets.

## Per-fixture evidence

| Fixture | Input SHA-256 | ngspice | spice-ts |
|---|---|---|---|
| cccs-mixed-analysis | `87e7a7e164e9cdac5891b12fd038c06945043f5455a79fb31d26c97bc0463e05` | fail — analysis: unimplemented dot command '.list' | fail — analysis: Parse error at line 17: Unsupported dot command: '.list' |
| vcvs-operating-point | `cd4c6c8b18a27254b06859424268763a7f5b4a39a648981fc27d6a18b91e2cd1` | fail — parser: device already exists, bail out | fail — analysis: Parse error at line 9: Unsupported dot command: '.list' |
| diode-bias-sweep | `f84c531a2e0b4ef201f1cef5d85279b360d5fd20d17d3deb91563581a9371055` | pass | pass |
| mos1-inverter-sweep | `e832b2a4c0099a68c035342e81e780256fa8369239fcd61c0fd1ad5a5a249de5` | pass | fail — analysis: Parse error at line 3: Unsupported dot command: '.width' |
| transmission-line-ac | `99cc373d602fad9ecd4ea0e8f14d9eba9322b0083ae02c7631091dcbece7828b` | fail — parser: unknown parameter (gen) | fail — analysis: Parse error at line 3: Unsupported dot command: '.width' |
| mutual-inductance-ac | `45bf5fdc96b7985a744455ff7c3222478665e3db487bbcfedc5c7efa8297fc3c` | fail — analysis: unimplemented dot command '.list' | fail — analysis: Parse error at line 24: Unsupported .options field: 'nopage' |
| bjt-diffpair-ac | `f8cde99b71d9978c5216dffbc9dfc036c8bdf7b37f1c9949fa9835e6eb741213` | fail — analysis: unimplemented dot command '.status' | fail — analysis: Parse error at line 6: Unsupported dot command: '.option' |
| opamp-open-loop-ac | `92e47652dbecdbd2c971cce3c047fc0b8e4a0406a7d2c953dffce299c60b183c` | fail — analysis: Missing DEC, OCT, or LIN. | fail — parser: Parse error at line 17: Cannot parse number: 'dc=0' |
| capacitor-step-transient | `2c0864497272439baa44213381271915107ccd9f8c47354df2e4b9c3028a1608` | fail — analysis: unimplemented dot command '.list' | fail — parser: Parse error at line 2: Cannot parse number: 'pulse' |
| capacitor-initial-condition | `65199506e3a8b9bd05b3842cc9ef180308d0d02ba2e9857e89f7f1f8c32c3c84` | fail — analysis: unimplemented dot command '.list' | fail — analysis: Parse error at line 4: Unsupported dot command: '.list' |
| lc-oscillator-transient | `020684099d172ec7cc2a6fe3d57792ef51b3d9162f41f83ed486704062d6d702` | fail — analysis: unimplemented dot command '.status' | fail — parser: Parse error at line 4: PWL source requires a parenthesized list of time/value pairs |
| bjt-diffpair-transient | `f142fa0c6378f80666343a83c8582cca065ed7ad5d49dd3d9e5cd88e7474301e` | pass | pass |
| bjt-schmitt-trigger | `ec6efed82593b525b1661173b3a11dbec4880449968389ff86424051d42274b5` | fail — device/model: unknown parameter (1) | pass |
| diode-temperature-sweep | `d2d7df0b8050008df98e6a8410433c6ef346d9851371c2032edaeb0c9c43dd48` | fail — analysis: unimplemented dot command '.list' | fail — analysis: Parse error at line 7: Unsupported dot command: '.list' |
| mos1-nand-transient | `183f57f24707d2597f83396a777896e336a17a4ec8a13027f89c5029440d8300` | fail — analysis: Error: unknown parameter on .tran - ignored | fail — analysis: Parse error at line 32: Cannot parse number: 'trace' |
| bjt-rtl-inverter-chain | `48b7f67014d43f0c9987ebbc9b349cf53908cc51426d784c4be6db3397fd6e2d` | pass | fail — analysis: Parse error at line 4: Unsupported dot command: '.width' |
| dual-lc-uic-rejection | `f1f6a53ef0bb2d41988b1ec4fb022abea8830cd8a847aa3b693d96fe7e66e36d` | fail — analysis: unimplemented dot command '.status' | fail — analysis: Parse error at line 8: Unsupported dot command: '.width' |
| opamp-voltage-follower | `923e0da63d9fbeca5cb94d049af3f85036f5b1a1af38a0701dbed8c258ff1ebd` | fail — analysis: unimplemented dot command '.stat' | fail — analysis: Parse error at line 34: Unsupported dot command: '.width' |
| mos7-nand-no-bypass | `81a387433d50c7d280d2b80d2463f3a9d42fc6ea969ef783333b16eaca046868` | fail — device/model: Device type MOS7 not available in this binary | fail — analysis: Parse error at line 3: Unsupported dot command: '.option' |
| bjt-diffpair-current-source | `7060377579bdb6bfef87225ee4710b81744462af1548ccff755adf061f14f37c` | pass | pass |

## Gap tracking

- Analysis/directive compatibility: [#228](https://github.com/mfiumara/spice-ts/issues/228).
- Source-syntax compatibility: [#227](https://github.com/mfiumara/spice-ts/issues/227).
- Device/model gaps are deduplicated against [#76](https://github.com/mfiumara/spice-ts/issues/76) (including coupled inductors), [#7](https://github.com/mfiumara/spice-ts/issues/7) (lossless T-lines), and [#3](https://github.com/mfiumara/spice-ts/issues/3) (advanced MOS models).
- Advanced analysis families remain tracked by [#75](https://github.com/mfiumara/spice-ts/issues/75).

## /poteto-mode receipt

RED: `node --test benchmarks/corpus-e-audit/audit.test.mjs` failed because `audit.mjs` did not exist. GREEN: the same focused test executes both engines over all 20 unchanged fixtures and locks totals plus stable hashes. REFACTOR: engine execution, classification, hashing, and report rendering are separated; no simulator, fixture, manifest, aggregate report, tolerance, or other corpus file is changed.
