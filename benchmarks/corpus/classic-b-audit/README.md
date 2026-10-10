# Classic SPICE3 corpus-B failure audit

Evidence suite SHA-256: `69da171c70b6dafc55679888990f8d5f2c1d2714c61916f7274fcdc1824a8532`.

## Scope and totals

All 20 provenance-tracked fixtures ran unchanged through the existing ngspice and spice-ts paths. Fixture adaptation: none.

- ngspice: 19 success, 1 failed, 0 unsupported.
- spice-ts: 2 success, 0 failed, 18 unsupported.
- spice-ts losses: 18. Parser feature 15; unsupported analysis/device 3; convergence 0; execution 0.
- spice-ts parity candidates: 2. These are not parity claims because this audit does not compare numeric tolerances.

## Environment

- ngspice: `ngspice-47`
- spice-ts: `0.3.0`
- Node: `v22.23.1`; pnpm: `10.28.1`
- Machine: `darwin 27.0.0 arm64`, `Apple M5 Pro`

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm exec tsx benchmarks/corpus/classic-b-audit/audit.ts --output benchmarks/corpus/classic-b-audit/report.json --markdown benchmarks/corpus/classic-b-audit/README.md`
- `pnpm exec tsx benchmarks/corpus/classic-b-audit/audit.ts --check`
- `pnpm exec tsx --test benchmarks/corpus/classic-b-audit/audit.test.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm bench:accuracy`
- `git diff --check`

## Every fixture outcome

| Fixture | ngspice | spice-ts | Classification | Cause | Evidence SHA-256 |
|---|---|---|---|---|---|
| bjt-noise | success | unsupported | parser-feature | ac-only-independent-source | `dc1da23e7ffef83d3379cbe2bb27dae26cb9a78516c7b7676bc32543aa8d3995` |
| bsim1-device-sweep | success | unsupported | parser-feature | legacy-output-limit-option | `d00672c621fbdc5d58df099bb979904a4d231f53e273ca77d7074355276a8963` |
| bsim2-device-sweep | success | unsupported | parser-feature | legacy-output-limit-option | `95da94dc7eabfeb0a5ecf9a99bf26b3ccbcd0febf884d55cec8ac916941f4b5d` |
| bjt-differential-pair | success | unsupported | parser-feature | legacy-options-directive | `ee2d3b6cac7908539a644f0d18d056476b628073826b33377e93b581dd7d9ed0` |
| diode-distortion | success | unsupported | parser-feature | compound-independent-source | `aea01dfd9acd1c4e136e42f9017a7fef942a20ac9d9c5d486ea4be8a424adb17` |
| lossy-line-24-inch | success | unsupported | unsupported-analysis/device | ltra-device | `5820ba7ce4a1b1c30e58998c6dd95a07458e11f31bd6ae4e4aea74c1c8900b63` |
| lossy-line-aluminium | success | unsupported | unsupported-analysis/device | ltra-device | `c6d6fad16a349ec19d1fb33ac37013777b5dfa3a8a2856eb4902a4d457f1941d` |
| coupled-lossy-lines | success | unsupported | parser-feature | legacy-iteration-option | `687d8ac74e477901ab0ef536ecd4c9a2ef5eb6379a39f22a27e30dbbc0dc8d92` |
| bjt-mixer-distortion | failed | unsupported | parser-feature | compound-independent-source | `800e666928630c5581c22fb5136f8ab2741be076dc7dd6f61d95d072f374a119` |
| mos6-inverter-chain | success | unsupported | parser-feature | legacy-accounting-option | `8c8f8e14e83976ed19bebd61331e059aed24578b092c52e78e65262a8dd82b50` |
| mos-amplifier | success | unsupported | parser-feature | legacy-accounting-option | `07badbb23041a003d49cd05684a36b94931740fcb5a6fc990f487340ec6e1af4` |
| mos-memory-cell | success | unsupported | parser-feature | legacy-output-directive | `04d01cbb452ad5eb1885dd2121b080a4e6e0a3a5ef5d9b90726887682f09eed6` |
| pole-zero-four-stage | success | unsupported | parser-feature | ac-only-independent-source | `8b265b837c444d55bbf2d06e5ed7662fffb50a22c81ba0ab2574b03868f70831` |
| pole-zero-three-stage | success | unsupported | parser-feature | ac-only-independent-source | `7c02b01e44b18927e0952162df83a01a9ddaef55b8895387b99bb58b746ba52a` |
| rc-transient | success | success | none | parity candidate | `92ef236e38d8426dd70b12ad1de0f8fee23a91b3719d736bacbfb2715914bb16` |
| rca3040-wideband-amplifier | success | success | none | parity candidate | `5a1122a5ed8c2f62e890b611a98e65c7826ddb222ba3b913e991c241c1075b1a` |
| resistor-noise | success | unsupported | parser-feature | ac-only-independent-source | `af386b0b9ab86baa4980f757b31944edfadee411f5c70d5f2d210acf2300ff6b` |
| rtl-inverter-chain | success | unsupported | parser-feature | legacy-output-directive | `36af5f576352a85d1a131099cb1e602f0945dee96653df800cdd3f41099df2bd` |
| ecl-schmitt-trigger | success | unsupported | parser-feature | legacy-output-directive | `a36aa1983ed4ebb1f16ab0d54ec921123fe24e8ae0a14c229ec86b4c435decb6` |
| high-pass-pole-zero | success | unsupported | unsupported-analysis/device | pole-zero-analysis | `e84e9ed8d324193a8da0840680f9b5cc0d15c7ed8c51ddfa4dfcd1736c36cda1` |

## Failure evidence

### bjt-noise

- Input SHA-256: `183a30585cee976f2990857df941ca500aea2755a1e4ecf946c14699f09b36fc`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/ac-only-independent-source, signature `ac-source-missing-dc-value`
- Error: `Parse error at line 4: Cannot read properties of undefined (reading 'trim') vin 1 0 ac`
- Evidence SHA-256: `dc1da23e7ffef83d3379cbe2bb27dae26cb9a78516c7b7676bc32543aa8d3995`

### bsim1-device-sweep

- Input SHA-256: `dffabf12d196b6b3d5ac058f7a402ee0dbb51c597c23599379f0502e84088062`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-output-limit-option, signature `unsupported-option-limpts`
- Error: `Parse error at line 21: Unsupported .options field: 'limpts' .OPTIONS LIMPTS=5000 ACCT`
- Evidence SHA-256: `d00672c621fbdc5d58df099bb979904a4d231f53e273ca77d7074355276a8963`

### bsim2-device-sweep

- Input SHA-256: `ff2da08b0c8db25fe617c9f1ba2f99d5169c26b8167b30258a1631d93b79beee`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-output-limit-option, signature `unsupported-option-limpts`
- Error: `Parse error at line 21: Unsupported .options field: 'limpts' .OPTIONS LIMPTS=5000 ACCT`
- Evidence SHA-256: `95da94dc7eabfeb0a5ecf9a99bf26b3ccbcd0febf884d55cec8ac916941f4b5d`

### bjt-differential-pair

- Input SHA-256: `d67594a868128d758cfa593047884990abff05d7ee4cc050afca8a152ace3add`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-options-directive, signature `unsupported-dot-opt`
- Error: `Parse error at line 3: Unsupported dot command: '.opt' .opt acct list node lvlcod=2`
- Evidence SHA-256: `ee2d3b6cac7908539a644f0d18d056476b628073826b33377e93b581dd7d9ed0`

### diode-distortion

- Input SHA-256: `912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/compound-independent-source, signature `compound-source-distof`
- Error: `Parse error at line 5: Cannot parse number: 'sin' vcc 1 3 5v ac 0.001 sin(5 0.01 1000) distof1 0.01 distof2 0.01`
- Evidence SHA-256: `aea01dfd9acd1c4e136e42f9017a7fef942a20ac9d9c5d486ea4be8a424adb17`

### lossy-line-24-inch

- Input SHA-256: `53e333e9629c3e3c4e839c4b72c9a512a220dec4baf0536e36626f290d240cd6`
- ngspice: success, converged
- spice-ts: unsupported, not-run, unsupported-analysis/device/ltra-device, signature `unsupported-ltra-card`
- Error: `Parse error at line 23: Lossy transmission line (LTRA) cards are unsupported; use the bounded lossless T-card Z0/TD form o2 2 0 3 0 lline`
- Evidence SHA-256: `5820ba7ce4a1b1c30e58998c6dd95a07458e11f31bd6ae4e4aea74c1c8900b63`

### lossy-line-aluminium

- Input SHA-256: `4b5bacda04d9c528d4c88d58d211114cb53edbc213c34a62a8c6b2379958db97`
- ngspice: success, converged
- spice-ts: unsupported, not-run, unsupported-analysis/device/ltra-device, signature `unsupported-ltra-card`
- Error: `Parse error at line 48: Lossy transmission line model LTRA is unsupported; use the bounded lossless T-card Z0/TD form .model lline ltra rel=1.8 r=12.45 g=0 l=8.792e-9 c=0.468e-12 len=16 steplimit`
- Evidence SHA-256: `c6d6fad16a349ec19d1fb33ac37013777b5dfa3a8a2856eb4902a4d457f1941d`

### coupled-lossy-lines

- Input SHA-256: `1927a2a547342e6c60ab1e0489c26d5ca7e92f36d5b08f6a03690b95aa7448b3`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-iteration-option, signature `unsupported-option-itl5`
- Error: `Parse error at line 81: Unsupported .options field: 'itl5' .options itl5=0 acct reltol=1e-3 abstol=1e-12`
- Evidence SHA-256: `687d8ac74e477901ab0ef536ecd4c9a2ef5eb6379a39f22a27e30dbbc0dc8d92`

### bjt-mixer-distortion

- Input SHA-256: `9f172a78faabd09f0b4e61d733b542e48380a452a4767b83e05617ab4642894e`
- ngspice: failed, not-run, `no raw analysis data produced`
- spice-ts: unsupported, not-run, parser-feature/compound-independent-source, signature `compound-source-distof`
- Error: `Parse error at line 6: Cannot parse number: 'distof1' v1 1 0 0v ac 1.0 distof1 0.001`
- Evidence SHA-256: `800e666928630c5581c22fb5136f8ab2741be076dc7dd6f61d95d072f374a119`

### mos6-inverter-chain

- Input SHA-256: `60f1f49e2f9ac1eccf6bbf717b3c177de885e1e2438b175db4a4360bfe080434`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-accounting-option, signature `unsupported-option-acct`
- Error: `Parse error at line 44: Unsupported .options field: 'ACCT' .OPTIONS ACCT`
- Evidence SHA-256: `8c8f8e14e83976ed19bebd61331e059aed24578b092c52e78e65262a8dd82b50`

### mos-amplifier

- Input SHA-256: `d8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-accounting-option, signature `unsupported-option-acct`
- Error: `Parse error at line 2: Unsupported .options field: 'acct' .options acct abstol=10n vntol=10n`
- Evidence SHA-256: `07badbb23041a003d49cd05684a36b94931740fcb5a6fc990f487340ec6e1af4`

### mos-memory-cell

- Input SHA-256: `f63d832e7e63dd866e528d6e41eb653859243fdbfed48a83e55d9274e111859d`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-output-directive, signature `unsupported-dot-width`
- Error: `Parse error at line 2: Unsupported dot command: '.width' .width in=72`
- Evidence SHA-256: `04d01cbb452ad5eb1885dd2121b080a4e6e0a3a5ef5d9b90726887682f09eed6`

### pole-zero-four-stage

- Input SHA-256: `c21a9628a46581ad9e163632d992422afafeaa15443787e00153dbd7331d3b73`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/ac-only-independent-source, signature `ac-source-missing-dc-value`
- Error: `Parse error at line 2: Cannot read properties of undefined (reading 'trim') iin 1 0 ac`
- Evidence SHA-256: `8b265b837c444d55bbf2d06e5ed7662fffb50a22c81ba0ab2574b03868f70831`

### pole-zero-three-stage

- Input SHA-256: `1c50c0623b02d991eb04a1523d1aa50914e88c0ea53a64438daeec97ec359a18`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/ac-only-independent-source, signature `ac-source-missing-dc-value`
- Error: `Parse error at line 2: Cannot read properties of undefined (reading 'trim') iin 1 0 ac`
- Evidence SHA-256: `7c02b01e44b18927e0952162df83a01a9ddaef55b8895387b99bb58b746ba52a`

### resistor-noise

- Input SHA-256: `241ea1ce167a449e91b1cf29904f5c9513338cff31c2c0beb72a845482048661`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/ac-only-independent-source, signature `ac-source-missing-dc-value`
- Error: `Parse error at line 5: Cannot read properties of undefined (reading 'trim') iin 1 0 1m AC`
- Evidence SHA-256: `af386b0b9ab86baa4980f757b31944edfadee411f5c70d5f2d210acf2300ff6b`

### rtl-inverter-chain

- Input SHA-256: `29aa3c8914aa7908881b4ab2657c23b5c4877811f09d1526ea6d5c833fce95c0`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-output-directive, signature `unsupported-dot-width`
- Error: `Parse error at line 2: Unsupported dot command: '.width' .width in=72`
- Evidence SHA-256: `36af5f576352a85d1a131099cb1e602f0945dee96653df800cdd3f41099df2bd`

### ecl-schmitt-trigger

- Input SHA-256: `ad673d52014030a49980fcbafeda898d547ab701fb5cf8eeaf374c9338324a31`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/legacy-output-directive, signature `unsupported-dot-width`
- Error: `Parse error at line 2: Unsupported dot command: '.width' .width in=72`
- Evidence SHA-256: `a36aa1983ed4ebb1f16ab0d54ec921123fe24e8ae0a14c229ec86b4c435decb6`

### high-pass-pole-zero

- Input SHA-256: `750846efbf93b9ae9f93e477922589439b859648de15b7508d2ea8e39da23720`
- ngspice: success, converged
- spice-ts: unsupported, not-run, unsupported-analysis/device/pole-zero-analysis, signature `missing-result-pz`
- Error: `no spice-ts result for analyses: pz`
- Evidence SHA-256: `e84e9ed8d324193a8da0840680f9b5cc0d15c7ed8c51ddfa4dfcd1736c36cda1`

## Gap issues

- https://github.com/mfiumara/spice-ts/issues/75: advanced analyses including pole-zero and distortion.
- https://github.com/mfiumara/spice-ts/issues/223: AC-only independent-source parser crash.
- https://github.com/mfiumara/spice-ts/issues/224: classic no-op directives and .options fields.
- https://github.com/mfiumara/spice-ts/issues/225: compound independent-source syntax with DISTOF terms.
- https://github.com/mfiumara/spice-ts/issues/226: lossy LTRA transmission-line device support.

## Limitations

- The audit classifies the first unchanged-fixture failure exposed by the existing parser/simulator path. Later failures can remain masked.
- A spice-ts success is only a parity candidate here. This audit does not add tolerances or declare numeric parity.
- The upstream bjt-mixer-distortion fixture has no enabled analysis, so ngspice exits without raw analysis data and is counted as failed.
- Unsupported and failed outcomes remain losses. No fixture bytes, directives, models, or per-circuit tolerances are adapted.
