# PR999 PARAMCHK correction-domain remediation

Refs #3. This is still a static slice, not completion of model-bin selection or dynamic BSIM4.

## Decision

Use the authorized conservative rejection, not a coefficient clamp. With PARAMCHK=1 (including its default), resolved NJS or NJD below 0.1 throws `UnsupportedModelParameterError`. This includes inherited NJD, zero and negative coefficients. Preprocessing rejects before evaluating any temperature law, so an invalid intermediate cannot mask the typed error. The public static load boundary independently guards preprocessed input. The standalone junction helper is a raw DIOMOD=1 law, not full model/PARAMCHK setup; it remains unchanged. PARAMCHK=0 leaves positive sub-0.1 coefficients unchanged. Exactly 0.1 is supported.

Native `b4check.c:797-806` corrects the coefficients after upstream temperature work. Clamping before temperature preprocessing would not establish that ordering. No native-ordering implementation is claimed.

## Reproduction and scalar evidence

The original MIT netlists are recorded in `paramchk-reference.json`. Both engines receive the same deck strings, including output-only control instrumentation. Native reference command is `ngspice -n -b`, ngspice-47 with KLU compiled in. All ten native invocations exit zero. Source, drain, inherited-drain and default-PARAMCHK probes warn about native coefficient correction. These four are now explicitly unsupported in spice-ts, with null numerical metrics rather than invented zero errors.

Before was the normal main merge `a7be0091446319f5ee59d12336131fe184b3819b` with simulator code from rejected `e87ccce9ab27f3b08d638ed31849919eb8ba4373`. `paramchk-before.json` and `paramchk-after.json` retain every numerical result, absolute and relative errors, and typed losses. There is no speed claim.

Reviewer source reproduction, TEMP27, Vgs1, Vds0.5, Vbs0.02, L1u/W2u, AS/AD1p and gmin1e-12:

| Signal | ngspice | Before spice-ts | Before absolute / relative error | After |
| --- | --- | --- | --- | --- |
| gbs (S) | 8.922063566058626e-11 | 4.025967504650611e-7 | 4.025075298294005e-7 / 4511.3725860531 | UnsupportedModelParameterError; unavailable |
| i(Vb) (A) | +2.3202450146045394e-13 | -5.202003813337282e-10 | 5.204324058351886e-10 / 2243.0062452860852 | UnsupportedModelParameterError; unavailable |

No physical cbs comparison against native's internal Newton-equivalent cbs is made.

For all six supported boundary/PARAMCHK0 probes, gbs and gbd equal native exactly. Their integrated i(Vb) does NOT equal native. The unchanged absolute residual is about 2e-14 A (signed spice-ts minus native is -2e-14 A). `newton-raphson.ts` adds global node-ground gmin on top of device gmin; at Vb=0.02 this contributes -gmin*Vb to branch current. The test explicitly characterizes this loss, instead of loosening a relative-current parity threshold or subtracting it from the published metrics. Largest retained relative-current error is 0.0861977932249056 on source-boundary. This shared solver policy is outside the correction-domain remediation and reported to the supervisor.

## RED and GREEN receipts

Initial new 17-test group: 16 failed, 1 passed. Ten failures are missing typed rejection (four integrated cases and six preprocessing coefficient domains). Six failures are the newly exposed unchanged global-gmin current residual, not coefficient-fix failures. After tracing the shared Newton diagonal, those six assertions were made explicit residual-characterization tests. Two additional direct-load boundary tests were added. Final focused group: 321 passed in nine files, including 19 PARAMCHK tests. Build, lint and core typecheck exit zero. Python original oracle integrity: five passed. Full suite uses `spice-heavy pnpm test`; exact-head GitHub CI remains the publication gate.

The original native suite regenerated 756 bias points in seven cards plus binning OP and four original corpus fixtures. `compare.ts` reproduces the prior `after.json` exactly apart from sourceHead (which is deliberately not rewritten in the historical receipt). The supported grid remains 648 points/2592 comparisons, max relative error 3.4008649204066223e-13. The three original typed unsupported fixture losses and G native diagnostic remain unchanged.

```sh
pnpm install --frozen-lockfile
spice-heavy python3 benchmarks/bsim4-validation-3/paramchk-native.py
pnpm exec tsx benchmarks/bsim4-validation-3/paramchk-compare.ts after
pnpm -C packages/core exec vitest run src/devices/bsim4/paramchk.test.ts src/devices/bsim4/parity.test.ts src/devices/bsim4-junction.test.ts src/devices/bsim4/setup.test.ts src/devices/bsim4/temp.test.ts src/devices/bsim4/load.test.ts src/devices/bsim4/device.test.ts src/parser/bsim-model-version.test.ts src/devices/mosfet-body-effect.test.ts
pnpm -C packages/core exec tsc --noEmit
spice-heavy python3 benchmarks/bsim4-validation-3/native.py
pnpm exec tsx benchmarks/bsim4-validation-3/compare.ts
PYTHONDONTWRITEBYTECODE=1 python3 packages/core/src/devices/__fixtures__/bsim4/test_generate.py
pnpm build
pnpm lint
spice-heavy pnpm test
```

## Main reconciliation

Normal merge of origin/main `3bb50649`, preserving branch ancestry without rebase or force-push. SOURCES.md retains both complete additive sections. The sole circuit.ts conflict resolution unions MOS2 and BSIM4 in temperature routing. No other circuit.ts implementation edits. Hotspots remain circuit.ts and SOURCES.md. PR text uses non-closing `Refs #3`. Independent exact-head review is still required; do not merge or publish.
