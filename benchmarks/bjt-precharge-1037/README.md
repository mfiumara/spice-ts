# BJT pre-charge residual boundary experiment (#1037)

Evidence only. No production simulator change or issue closure. The two existing
production/post-assembly rest assertions retain `it.fails`. Refs #1037.

## Result and limits

Moving the charge residual boundary before `geq * voltage` succeeds on the
self-written rest reduction. An instance-local prototype accepts 107 steps,
matching native ngspice-47's 108 rows including DC. Production still accepts one
step and fails. The prior post-assembly candidate still accepts zero steps.

This is a positive boundary experiment, not RED-to-GREEN production work. The
helper still computes `b_static - A_static * anchor` after the static/C-matrix
load. It supports exactly one charge-integrating BJT and rejects any other
charge-integrating device. It does not solve generic device/source assembly,
multiple charge devices, held rows, general C-matrix conditioning, or integration
history conditioning. Those seams need a coherent production design and mixed
nonlinear-device validation before shipping. Do not copy this monkey-patch into
the simulator or infer ticket-764 closure from a constant-bias reduction.

All changes under `packages/core/src` are test or `.fixtures.ts` files. The
experimental solver receives a charge-boundary residual but otherwise uses the
same assembled Jacobian and unmodified BJT predicted-current convergence checks.
It does not loosen tolerances, force timesteps, bypass limiting/convergence,
zero a physical current, or detect the rest circuit to select different rules.
The moving-source control exercises nonzero integrated currents as well.

## Exact stamping term

At the first trial step, dt = 9.999999999999999e-16 s:

- `TransientChargeState.current(qbc)` is exactly zero. Integration itself has
  not generated a current on this first unchanged charge.
- `capBC / dt` is 1783.6747270989981 S and vbc is -46.49999995294196 V.
- `stampChargeBranch` in `devices/charge-state.ts:371` forms
  `current - conductance * voltage`, yielding +82940.87472616718 A.
- The B-E equivalent is approximately -1.0230366556117359e-5 A. Its cross term
  is also present in the original load and the residual experiment.
- Before charge stamping, the static binary64 residual is `[0,0,0,0]`.
  After original charge stamping, it is
  `[-1.4551915228366852e-11, +1.4551915228366852e-11, 0, 0]`.
- The base RHS addition of -82940.87472616718 A to
  +1.0230366557828613e-5 A rounds by -6.354406006575989e-12 A. The collector
  RHS addition entirely absorbs the prior -1.1666666540102564e-14 A value.

`check.py` uses Decimal.from_float at 100 digits to quantify the individual
RHS additions, not a claim of exact physical residuals. The final residual also
includes matrix accumulation/product rounding. These numbers localize an
absolute charge-companion conditioning floor; they do not prove an LU bug.

The experiment instead adds each charge branch's residual as
`-current + geq * (linearizationVoltage - anchorVoltage)` with the B-E cross
term's corresponding voltage difference. Subtraction precedes the large
multiplication. For the first rest load this is zero without manufacturing a
zero current. The original load still runs to populate the Jacobian and device
convergence state. All before/after terms and every trial residual are retained.

## ngspice-47 comparison

Read-only reference:
https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/bjt/bjtload.c

Downloaded source SHA-256:
`44d89ff001169377123443fc3b1ddb4dc76b27d8d43ad4c348494df1ccace0db`.
No upstream C source is redistributed.

Lines 802-811 integrate qbe/qbc and add `geq` to gpi/gmu, charge currents to
cb, and subtract cqbc from cc. Lines 895-905 form and stamp combined equivalents:
`ceqbe = type*(cc+cb-vbe*(gm+go+gpi)+vbc*(go-geqcb))` and
`ceqbc = type*(-cc+vbe*(gm+go)-vbc*(gmu+go))`.
spice-ts updates the same integrated convergence quantities at
`bjt.ts:742-750`, but stamps static equivalents separately from charge branches
(`bjt.ts:751-784`). Both implementations form large absolute equivalents;
ngspice is not demonstrated to use reference-centered assembly. The prototype
matches the charge linearization algebra and preserves the convergence state,
not native instruction ordering or per-Newton identity. Native saved junction
states are accepted device state, not internal Newton traces. The earlier
aggregation-only rejection (#1060) is not overturned by this result.

## Identical-byte native comparisons

Original MIT-licensed spice-ts rest/control decks, with observational `.save`
cards, plus an original PWL-source control. No vendor content. SHA-256 and actual
deck strings are in `receipt.json.gz`; source provenance is additive in
`benchmarks/SOURCES.md`. Both engines receive identical input bytes. Native
ngspice-47 runs with `-n -b -r`, ASCII raw output and a 120 s child bound.

| deck | production baseline | pre-charge experiment | native rows including DC |
| --- | --- | --- | --- |
| rest, 10 ps | dt-floor, 1 accepted | success, 107 accepted | success, 108 |
| nanosecond grid, 100 ns | success, 107 accepted | success, 107 accepted | success, 108 |
| moving-source, 10 ps | dt-floor, 1 accepted | success, 113 accepted | success, 114 |

All experiment runs have zero NR retries and zero LTE retries. These are single
instrumented runs, not performance comparisons. Runtime receipts are retained,
but native/TS speed is not claimed.

`metrics.json` reports max/RMS absolute and relative errors on every accepted TS
time, using linear interpolation of full saved native junction states. Relative
error divides by the magnitude of native junction voltage with no normalization
floor. Exact-time matches are 76/107 (rest), 72/107 (nanosecond) and 86/113
(moving). One nanosecond endpoint differs only by time rounding and uses the
native endpoint; no waveform extrapolation. Small rest vbe makes its relative
error much larger than vbc despite smaller absolute error.

| deck / mode | max abs vbe (V) | max relative vbe | max abs vbc (V) | max relative vbc |
| --- | ---: | ---: | ---: | ---: |
| rest experiment | 8.851596468072497e-15 | 1.9034706863998274e-5 | 6.394884621840902e-14 | 1.3752440060887143e-15 |
| nanosecond baseline | 4.041605274368709e-15 | 8.691361250926055e-6 | 1.4210854715202004e-14 | 3.056097791308259e-16 |
| nanosecond experiment | 2.9429603668293155e-15 | 6.3287578960962924e-6 | 1.4210854715202004e-14 | 3.056097791308259e-16 |
| moving experiment | 1.3366926315816485e-9 | 1.768692621940593e-5 | 1.706929708689131e-9 | 3.676892506693091e-11 |

Rest/moving production runs have no complete waveform score. The moving
experiment's larger absolute error is reported, not hidden by the rest success.

## Vendor status and regressions

Ticket-764 vendor cases were not rerun in this slice. The source-bound prior
receipt `evidence/1037/receipt.json` and merged PRs #1040/#1060 remain the latest
vendor results. Original baseline dt-floor at 6.075652244586859e-11 s (26 points),
Split dt-floor at 2.3555640717097648e-12 s (9 points), native 120 s timeout on
both. #1060's aggregation candidate still failed both (53/9 accepted points),
worsened Schmitt max absolute error from 0.0052593 to 0.279023 V, and did not
complete the rest reduction. Those are still losses. This prototype is not a
complete vendor waveform oracle or proof of a general correction.

BJT device tests, transient-nr-retry-804 and transient-ecl-schmitt-818 pass with
production behavior unchanged. No production solver/device/tolerance changes.

## Reproduction and gates

- RED `70edfef51cfc4b25447dcec7058f13121eebb7cc` removes both old `.fails`
  annotations. `pnpm -C packages/core exec vitest run
  src/analysis/transient-centered-1037.test.ts
  src/analysis/transient-bjt-rest-1037.test.ts` exits 1, 2 failures/4 passes.
  Final head restores `.fails`. This is not a production GREEN SHA.
- `pnpm install --frozen-lockfile`: exit 0.
- `spice-heavy pnpm exec tsx benchmarks/bjt-precharge-1037/run.ts`: exit 0,
  all three native children exit 0; engine errors are receipt data.
- `python3 benchmarks/bjt-precharge-1037/check.py`: exit 0, source/deck hashes,
  all native completions, individual RHS rounding and full waveform metrics.
- `pnpm -C packages/core exec vitest run src/devices/bjt
  src/analysis/transient-precharge-1037.test.ts
  src/analysis/transient-centered-1037.test.ts
  src/analysis/transient-bjt-rest-1037.test.ts
  src/analysis/transient-nr-retry-804.test.ts
  src/analysis/transient-ecl-schmitt-818.test.ts`: exit 0, 11 files,
  109 passed plus 2 expected failures (111 total).
- `pnpm build`: exit 0. `pnpm lint`: exit 0.
- `pnpm -C packages/core exec tsc --noEmit --strict --target ES2022
  --module NodeNext --moduleResolution NodeNext --esModuleInterop
  --skipLibCheck --types node ../../benchmarks/bjt-precharge-1037/run.ts`: exit 0.
- Full suite and original post-assembly reproduction are queued under
  `spice-heavy`; final execution/CI receipts belong in the PR/card handoff.

The remaining production slice must carry reference residuals through the
companion/solver boundary, accumulate contributions from every charge device,
preserve held-row/source constraints, and validate mixed circuits and the vendor
losses. Engineer does not merge. #1037 remains open.
