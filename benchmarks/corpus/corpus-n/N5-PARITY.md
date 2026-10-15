# n-5 plot-pairing reconciliation (#1121)

Measured on main `2a8f68a6ce328f358b5c01f64037193d31198ec6`, which contains #1115 (`fbb4a840`) and #1118. Core tree `12d34b5bfa1bfb1a9c5724a24a095533efaefec3`. No simulator or plot-pairing change is needed in this PR. #1115 already pairs spice-ts `tran1` with the single native `Transient Analysis` raw header, index 0.

Original fixture `fixtures/ngspice/paranoia_parallel/examples/various/adder_mos.cir` SHA-256 `837642247b44a0c70ac952e4d24a6fa52a4132ed50c1f5c6a4cbd35bd1747f7e` was verified before execution. Both engines run identical original bytes. Existing corpus-f metrics, the uniform 0.01 peak-normalized threshold and quantity floors are unchanged. Provenance and licenses remain in [SOURCES.md](SOURCES.md).

## Commands and receipts

```
pnpm install --frozen-lockfile
pnpm build
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-n/parity.ts
pnpm exec tsx benchmarks/corpus/corpus-n/integration.ts
pnpm exec tsx --test benchmarks/corpus/corpus-n/corpus-n.test.ts
pnpm exec tsx --test benchmarks/vdmos-1106/comparison.test.ts
pnpm lint
spice-heavy pnpm test
```

Full rerun completed on darwin 27.0.0 arm64, Apple M5 Pro, Node v22.23.1, ngspice-47, spice-ts 0.3.0. [outcomes.json](outcomes.json) contains all 24 rows and unrounded metrics. Outcome digest `341be4a804bd919ff40356936c2a5cf72bc471e477a7b228964721c36a9e3bc5`.

The n-5 receipt assertion failed against the old committed outcomes (unsupported instead of success), then passed after the real corpus regeneration. Corpus tests pass 4/4; existing generic pairing/export regressions pass 9/9. This is a receipt refresh, not a RED/GREEN simulator or harness implementation.

## n-5 result

Previous #1118 receipt, measured without #1115, is retained unchanged in [corpus-n-outcomes.json.gz](../../control-pre-set-1097/corpus-n-outcomes.json.gz). It had 0 compared signals, 0 aligned points, null max/RMS and `not-compared`.

Now both engines succeed with 1827 transient points. One analysis pairs, with 14 compared common voltage signals, 14 matched and 0 mismatched under the existing corpus-f rule. All 1827 points align; none are excluded as out of range. Worst peak-normalized maximum error is 0.00228 at `v(12)`. The peak-normalized maximum is the match criterion, not pointwise relative error.

| Signal | Samples | Max absolute error (V) | RMS absolute error (V) | Max pointwise relative error | RMS pointwise relative error |
|---|---|---|---|---|---|
| v(1) | 1827 | 6.3527471044e-14 | 7.56146571991e-15 | 1 | 0.118920594073 |
| v(10) | 1827 | 0.00157736459852 | 0.000115769312803 | 0.410879336343 | 0.017521927553 |
| v(11) | 1827 | 0.00517148875665 | 0.000207031942958 | 0.327214129246 | 0.0252395686332 |
| v(12) | 1827 | 0.0077775799364 | 0.000295747081318 | 1.50723774978 | 0.0397074131936 |
| v(13) | 1827 | 0.000279347692773 | 8.86905165341e-06 | 0.0101070023204 | 0.000309210333538 |
| v(2) | 1827 | 3.24185123191e-14 | 5.27024322943e-15 | 1 | 0.0779888432602 |
| v(3) | 1827 | 3.24185123191e-14 | 4.11124456381e-15 | 1 | 0.0663236532428 |
| v(4) | 1827 | 3.24185123191e-14 | 2.27846785114e-15 | 1 | 0.0435429096577 |
| v(5) | 1827 | 3.17801340799e-14 | 1.65587356723e-15 | 1.41245040355e-13 | 6.42066999191e-15 |
| v(6) | 1827 | 3.19744231092e-14 | 1.82652027537e-15 | 1.41245040355e-13 | 4.88606226668e-15 |
| v(7) | 1827 | 8.881784197e-16 | 2.57234908563e-17 | 3.23916272684e-16 | 1.36993992414e-17 |
| v(8) | 1827 | 8.881784197e-16 | 2.57234908563e-17 | 3.23916272684e-16 | 1.36993992414e-17 |
| v(9) | 1827 | 0.000540480880401 | 5.32715578016e-05 | 21.0694811053 | 0.497287294269 |
| v(x1.x1.x1.7) | 1827 | 6.2086148878e-05 | 8.09664447639e-06 | 0.00243842759208 | 0.000125938415954 |

Pointwise relative metrics exclude exact zero reference values. Counts and both breakpoint-aware and linear interpolation receipts are published in outcomes.json. Large pointwise relative errors at near-zero references are published, not hidden. For example `v(9)` has pointwise relative max about 21, despite absolute max about 0.000540481 V and a match under the unchanged peak-normalized rule.

Equal point counts alone do not prove parity. This result covers these 14 common exported signals in this deck, not every BSIM3 operating regime or internal/branch signal. No n-5 waveform mismatch remains under the agreed rule, so no new simulator issue is opened by this card.

## All 24 outcomes, before and after

The previous run used #1118 without #1115, not the much older committed corpus baseline. The original post-rebase snapshot has also been preserved byte-for-byte (compressed) in [outcomes-after-rebase.json.gz](outcomes-after-rebase.json.gz), so [INTEGRATION.md](INTEGRATION.md) remains a historical receipt.

| Outcome | #1118 without #1115 | Main with both |
|---|---|---|
| matched | 4 | 10 |
| mismatch | 5 | 8 |
| not-compared | 9 | 0 |
| spice-ts-loss | 6 | 6 |
| ngspice-failed | 0 | 0 |
| both-failed | 0 | 0 |

Native succeeds on all 24 decks in both runs. spice-ts has 18 success, 3 failed and 3 unsupported in both runs. Newly comparable rows expose losses as well as wins. n-3, n-4 and n-12 move from not-compared to mismatch; n-5 and n-8..n-11, n-13 move from not-compared to matched. Existing mismatches and execution losses remain published in the generated README. These are inherited pairing/export changes, not simulator improvements authored in this evidence PR. No aggregate refresh is included.

The unchanged row classifier also calls unmatched extra plots a mismatch. n-3 and n-12 have paired-signal worst errors below 0.01, but retain unmatched `tran2` and `dc2` respectively. n-4 retains an unmatched `tran2` and has paired-signal worst error 4.49. Thus not all eight mismatch rows establish an above-threshold numerical error. Missing plots/signals remain visible and are not forced into a match.

n-5 cold child wall is 1283.112334 ms native and 19742.574042 ms spice-ts. It includes startup, adapter, parse/solve/export on a shared host, not solver-only time. No speed claim.
