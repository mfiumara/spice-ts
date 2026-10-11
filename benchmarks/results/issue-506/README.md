# Issue #506: VDMOS power MOSFET vs ngspice-47

`compare.ts` produces `report.json`. Reproduce it with:

```sh
pnpm install --frozen-lockfile && pnpm -C packages/core build
git fetch origin wt/corpus-f-batch1-484   # deck bytes come from corpus-f commit 5014ae0b
npx tsx benchmarks/results/issue-506/compare.ts --output benchmarks/results/issue-506/report.json
# or read the decks from an ngspice-47 source tree:
npx tsx benchmarks/results/issue-506/compare.ts --decks <ngspice-47>/examples/vdmos
```

- **Decks:** the unchanged ngspice-47 `examples/vdmos` decks (BSD-3-Clause), byte-identical to the corpus-f fixtures (#484). They are not committed; their SHA-256 is recorded in the report.
- **Variants:** every deck runs its analyses from `.control`, and `ngspice -b -r` does not export those analyses. So each analysis is compared on an in-memory variant, in which the `.control` block is replaced by that one analysis as a dot card. Both engines get the same variant bytes, and the hash of each variant is in the report.
- **Match rule:** the corpus-f rule. Per signal, `max|spice-ts - ngspice| <= 1% x max(peak |ngspice|, 1e-12)`. The rule allows no per-circuit tolerance.
- **DC comparison:** point by point, on identical grids.
- **Transient comparison:** two ways.
  - On the spice-ts grid, with ngspice linearly interpolated (the corpus-f rule).
  - At the ngspice timepoints, with spice-ts interpolated (`atNg` in the transient table below).
- **Tools:** ngspice-47 (Homebrew), Node v22.23.1, macOS arm64.

## Before (origin/main 5589ab1)

All 5 decks stop at parse time with the typed `UNSUPPORTED_MODEL_TYPE` error from #509. spice-ts compares nothing on any of them.

## After (this branch)

| deck / analysis | unchanged deck in spice-ts | points (ts / ng) | worst signal (normalised) | outcome at 1% |
|---|---|---|---|---|
| vdmos-out_ir_mtr.sp `.dc vd -1 7 0.05 vg 3 7 1` | runs | 805 / 805 | i(vs) 8.3e-5 | **match** |
| vdmosp-out.sp `.dc vd -15 1 0.1 vg 0 -5 -1` (#509 repro deck) | runs | 966 / 966 | i(vs) 1.5e-8 | **match** |
| vdmos-out.sp `dc vd -1 15 0.05 vg 3 7 1` | **fails**: repeated `.control` `dc` (#558) | 1605 / 1605 | i(vg) 3.7e-2 (noise floor, see below); i(vd)/i(vs) 8.7e-5 | mismatch (noise floor only) |
| vdmos-out.sp `dc vg 2 7 0.05 vd 0.5 2.5 0.5` | (same) | 505 / 505 | i(vg) 2.4e-2 (noise floor); i(vd)/i(vs) 1.6e-9 | mismatch (noise floor only) |
| vdmosp-out-mtr.sp `dc vd -12 1 0.05 vg 0 -5 -1` | **fails**: repeated `.control` `dc` (#558) | 1566 / 1566 | v(s2) 8.0e-3 (noise floor); currents 3.2e-5 | **match** |
| vdmosp-out-mtr.sp `dc vg 0 -4 -0.05 vd -1 -12 -2` | (same) | 486 / 486 | v(s2), v(s3) 1.8e-2 (noise floor); currents 1.1e-5 | mismatch (noise floor only) |
| inv_vdmos.sp `dc Vin 0 5 0.05` | runs | 101 / 101 | i(vin) 1.8e-7 | **match** |
| inv_vdmos.sp `tran 1n 1u` | runs | 1871 / 1050 | i(vdd) 0.100 (atNg 0.037); v(3) 0.032 (atNg 2.3e-3) | **mismatch (loss)** |
| inv_vdmos.sp `.tran 1n 300n 0 0.005n` (TMAX 5 ps, both engines) | n/a | 60022 / 60017 | i(vdd) 9.9e-3; v(3) 6.8e-4 | **match** |
| ro_11_vdmos.sp `.tran 0.1n 10u` (corpus-f) | runs | 100001 / 100008 | v(8) 1.00 | **mismatch (loss)**, start-up offset from `.ic` (#531) |

### Notes on the losses

- **Noise floor.** Four DC variants fail the rule only because of signals that should be exactly zero:
  - `i(vg)`: there is no DC gate current. Errors are at most 3.7e-14 A against an ngspice peak of 2e-16 A.
  - `v(s2)` and `v(s3)`: these nodes are held at 0 V by a source. Errors are at most 1.8e-14 V against 0 V.
  - These differences are rounding noise, judged against the rule's 1e-12 floor. Every non-zero current in those variants is within 8.7e-5 of ngspice.
  - The 8.7e-5 itself is Newton-tolerance level. With reltol=1e-9, ngspice-47 moves by up to 9e-5 on the same decks, and the unit tests in `packages/core/src/devices/vdmos.test.ts` agree with tight-tolerance ngspice to 1e-6 relative.
- **inv_vdmos transient at default steps** (published loss).
  - The worst errors are on the switching edges. ngspice takes 1 ns steps through an edge that moves about 1 V/ns (1050 points against 1871 for spice-ts).
  - Measured at the ngspice timepoints, the errors are i(vdd) 3.7% of its 0.297 A spike and v(3) 0.23%.
  - With TMAX = 5 ps in both engines, every signal is within 1%. The residual is time-step control, not the device model.
  - At TMAX = 20 ps the i(vdd) error is about 4%; it is not recorded in the report.
- **ro_11_vdmos** (published loss, not a VDMOS model error).
  - The oscillation period agrees: 1.52448 µs (spice-ts) against 1.52415 µs (ngspice), 2.2e-4 relative. In the report, the period metric's mean is over the periods after the first two.
  - The deck sets `.ic v(6)=2.5`. ngspice holds that node during the transient operating point, so the ring starts away from its metastable point: at t=0, v(5)=5.8e-7 V, v(6)=2.5 V, v(7)=4.56 V.
  - spice-ts uses `.ic` only as an initial guess (#531). It starts with every ring node at 2.7576 V, and the first rising crossing of v(6) comes at 5.02 µs instead of 1.50 µs. The waveforms are therefore out of phase over the whole 10 µs window.
- **Runtime.** Runtimes in the report include ngspice raw-file export, so they make no speed claim. On `ro_11_vdmos` spice-ts takes 21.9 s against 10.8 s for ngspice (ngspice alone is about 2.8 s without raw export).

## corpus-f VDMOS bucket (18 fixtures)

Measured with the corpus-f harness unchanged (`outcomes.ts --corpus-f-fixture-child`, commit 51daac5). Only `packages/core/dist` was swapped between the two runs.

| outcome | before (origin/main 5589ab1) | after (this branch) |
|---|---|---|
| matched | 0 | 2 (vdmos-out_ir_mtr, vdmosp-out) |
| mismatch | 0 | 1 (ro_11_vdmos, #531) |
| not-compared (ngspice exports no `.control` vectors, #521/#528) | 0 | 2 (inv_vdmos, crss_coss_ciss) |
| spice-ts-loss | 17 | 12 |
| both-failed | 1 (dcdc) | 1 |

The 12 remaining spice-ts losses all fail on something other than the VDMOS model:

- `.control` commands spice-ts does not support (`set`, `let`, `foreach`, `save`, `altermod`)
- a repeated `dc` (#558)
- `.options warn`
- the self-heating thermal instance form (#559)
