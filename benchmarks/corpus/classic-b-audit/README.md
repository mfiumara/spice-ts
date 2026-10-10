# Classic SPICE3 corpus-B failure audit

Evidence suite SHA-256: `f1971684e48abfcce486b5ac2e6d8cb6047057d79ddbee115680eaefccb6c815`.

## Scope and totals

All 20 provenance-tracked fixtures ran unchanged through the existing ngspice and spice-ts paths. Fixture adaptation: none.

- ngspice: 19 success, 1 failed, 0 unsupported.
- spice-ts: 6 success, 3 failed, 11 unsupported.
- spice-ts losses: 14. Parser feature 5; unsupported analysis/device 6; convergence 3; execution 0.
- spice-ts parity candidates: 6. These are not parity claims because this audit does not compare numeric tolerances.

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
| bjt-noise | success | unsupported | parser-feature | other-parser-feature | `cf571d7bd460644e582e7f44e233806e96e535c8aa41d941da906bd22f125fb2` |
| bsim1-device-sweep | success | success | none | parity candidate | `4505ba9bfaad21c128d786aad5dde02dc0c5499434db09114b3300b470294d7e` |
| bsim2-device-sweep | success | success | none | parity candidate | `af6ff620fdcde68f58aa63d6098055149c46267715819da3ee3d13e27628ca2a` |
| bjt-differential-pair | success | success | none | parity candidate | `19382fed68a1a77e2682eac95f5cae0f2716428a031dbe4cc840c2f2442a07a0` |
| diode-distortion | success | unsupported | parser-feature | other-parser-feature | `731b7993db5ad051cba5cdf9fd0f385826a5f9b58ff2e062245ae05bff8fb1d4` |
| lossy-line-24-inch | success | unsupported | unsupported-analysis/device | ltra-device | `5820ba7ce4a1b1c30e58998c6dd95a07458e11f31bd6ae4e4aea74c1c8900b63` |
| lossy-line-aluminium | success | unsupported | unsupported-analysis/device | ltra-device | `c6d6fad16a349ec19d1fb33ac37013777b5dfa3a8a2856eb4902a4d457f1941d` |
| coupled-lossy-lines | success | unsupported | unsupported-analysis/device | ltra-device | `a1820c7931664ceae464f4d5508c447aeaeb6ade6f35af092be5373d67cb7e47` |
| bjt-mixer-distortion | failed | unsupported | parser-feature | other-parser-feature | `394f50c47632e5b712f65cea585512685cd468da96d944aba39e8b0162f7f1b0` |
| mos6-inverter-chain | success | failed | convergence | solver-convergence | `0ab45bd42ddedecb58a0ea6d8f9275aca1c1110afc9080f78ca7565462d6256e` |
| mos-amplifier | success | failed | convergence | solver-convergence | `97b49a4a0f955508c4847aa652d0e407f0ed5ee72554fb2838d2c1a6dcd54b4c` |
| mos-memory-cell | success | failed | convergence | solver-convergence | `762affdfe6b5af3c4b1857e4e4b9d52730fd782b408cab354d0764ddd6898e66` |
| pole-zero-four-stage | success | unsupported | unsupported-analysis/device | pole-zero-analysis | `730ac7421ecf45ebeed0f7843e3e40bc5b9af4b689485defb6e9eeefcd690721` |
| pole-zero-three-stage | success | unsupported | unsupported-analysis/device | pole-zero-analysis | `a049312596b097c4708d732dd2094e427694357e01297a9f7b332e9ea8400286` |
| rc-transient | success | success | none | parity candidate | `92ef236e38d8426dd70b12ad1de0f8fee23a91b3719d736bacbfb2715914bb16` |
| rca3040-wideband-amplifier | success | success | none | parity candidate | `5a1122a5ed8c2f62e890b611a98e65c7826ddb222ba3b913e991c241c1075b1a` |
| resistor-noise | success | unsupported | parser-feature | other-parser-feature | `b099f2fa10c9fb13576a189fd216476be1cbf7e67157c8d242f0522b84e5f266` |
| rtl-inverter-chain | success | success | none | parity candidate | `7c898c8358c833a029da9817d0e10aa79e9b0f9c19981384e4b5fd76ca5b49de` |
| ecl-schmitt-trigger | success | unsupported | parser-feature | other-parser-feature | `4a9d82abd3c375c3e3bbf7f91c8ff3e7e1c4a1b7dc92059ffc1ee85f861d0b7c` |
| high-pass-pole-zero | success | unsupported | unsupported-analysis/device | pole-zero-analysis | `e84e9ed8d324193a8da0840680f9b5cc0d15c7ed8c51ddfa4dfcd1736c36cda1` |

## Failure evidence

### bjt-noise

- Input SHA-256: `183a30585cee976f2990857df941ca500aea2755a1e4ecf946c14699f09b36fc`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/other-parser-feature, signature `other-parser-error`
- Error: `Parse error at line 15: Unsupported .noise form; expected '.noise v(node) source {lin|dec|oct} points start stop' .noise v ( 3 ) vin dec 10 10 100k 1`
- Evidence SHA-256: `cf571d7bd460644e582e7f44e233806e96e535c8aa41d941da906bd22f125fb2`

### diode-distortion

- Input SHA-256: `912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/other-parser-feature, signature `other-parser-error`
- Error: `Parse error at line 11: Two-tone .disto is not supported; omit f2overf1 .disto dec 20 1.0e3 1.0e8 0.9`
- Evidence SHA-256: `731b7993db5ad051cba5cdf9fd0f385826a5f9b58ff2e062245ae05bff8fb1d4`

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
- spice-ts: unsupported, not-run, unsupported-analysis/device/ltra-device, signature `unsupported-ltra-card`
- Error: `Parse error at line 249: Lossy transmission line model LTRA is unsupported; use the bounded lossless T-card Z0/TD form .model llfifth ltra nocontrol rel=10 r=0 g=0 l=9.13e-9 c=3.65e-12 len=0.2 steplimit quadinterp`
- Evidence SHA-256: `a1820c7931664ceae464f4d5508c447aeaeb6ade6f35af092be5373d67cb7e47`

### bjt-mixer-distortion

- Input SHA-256: `9f172a78faabd09f0b4e61d733b542e48380a452a4767b83e05617ab4642894e`
- ngspice: failed, not-run, `no raw analysis data produced`
- spice-ts: unsupported, not-run, parser-feature/other-parser-feature, signature `other-parser-error`
- Error: `Parse error at line 16: Unsupported BJT Q-card form: 'q1 3 1 4 2 mod1' q1 3 1 4 2 mod1`
- Evidence SHA-256: `394f50c47632e5b712f65cea585512685cd468da96d944aba39e8b0162f7f1b0`

### mos6-inverter-chain

- Input SHA-256: `60f1f49e2f9ac1eccf6bbf717b3c177de885e1e2438b175db4a4360bfe080434`
- ngspice: success, converged
- spice-ts: failed, failed, convergence/solver-convergence, signature `convergence-error`
- Error: `Timestep too small at t=3.071226114412814e-8: dt=6.362405548354911e-16`
- Evidence SHA-256: `0ab45bd42ddedecb58a0ea6d8f9275aca1c1110afc9080f78ca7565462d6256e`

### mos-amplifier

- Input SHA-256: `d8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469`
- ngspice: success, converged
- spice-ts: failed, failed, convergence/solver-convergence, signature `convergence-error`
- Error: `Singular matrix: zero pivot at matrix column 22 (nodes: ; branches: vddn)`
- Evidence SHA-256: `97b49a4a0f955508c4847aa652d0e407f0ed5ee72554fb2838d2c1a6dcd54b4c`

### mos-memory-cell

- Input SHA-256: `f63d832e7e63dd866e528d6e41eb653859243fdbfed48a83e55d9274e111859d`
- ngspice: success, converged
- spice-ts: failed, failed, convergence/solver-convergence, signature `convergence-error`
- Error: `Timestep too small at t=2.9772551177916905e-8: dt=7.331183713840461e-16`
- Evidence SHA-256: `762affdfe6b5af3c4b1857e4e4b9d52730fd782b408cab354d0764ddd6898e66`

### pole-zero-four-stage

- Input SHA-256: `c21a9628a46581ad9e163632d992422afafeaa15443787e00153dbd7331d3b73`
- ngspice: success, converged
- spice-ts: unsupported, not-run, unsupported-analysis/device/pole-zero-analysis, signature `missing-result-pz`
- Error: `no spice-ts result for analyses: pz`
- Evidence SHA-256: `730ac7421ecf45ebeed0f7843e3e40bc5b9af4b689485defb6e9eeefcd690721`

### pole-zero-three-stage

- Input SHA-256: `1c50c0623b02d991eb04a1523d1aa50914e88c0ea53a64438daeec97ec359a18`
- ngspice: success, converged
- spice-ts: unsupported, not-run, unsupported-analysis/device/pole-zero-analysis, signature `missing-result-pz`
- Error: `no spice-ts result for analyses: pz`
- Evidence SHA-256: `a049312596b097c4708d732dd2094e427694357e01297a9f7b332e9ea8400286`

### resistor-noise

- Input SHA-256: `241ea1ce167a449e91b1cf29904f5c9513338cff31c2c0beb72a845482048661`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/other-parser-feature, signature `other-parser-error`
- Error: `Parse error at line 14: Unsupported .noise form; expected '.noise v(node) source {lin|dec|oct} points start stop' .noise v ( 1 ) iin dec 10 10 100k 1`
- Evidence SHA-256: `b099f2fa10c9fb13576a189fd216476be1cbf7e67157c8d242f0522b84e5f266`

### ecl-schmitt-trigger

- Input SHA-256: `ad673d52014030a49980fcbafeda898d547ab701fb5cf8eeaf374c9338324a31`
- ngspice: success, converged
- spice-ts: unsupported, not-run, parser-feature/other-parser-feature, signature `other-parser-error`
- Error: `Parse error at line 16: Unsupported BJT Q-card form: 'q1 3 2 4 qstd off' q1 3 2 4 qstd off`
- Evidence SHA-256: `4a9d82abd3c375c3e3bbf7f91c8ff3e7e1c4a1b7dc92059ffc1ee85f861d0b7c`

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
