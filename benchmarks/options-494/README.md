# ngspice-47 options compatibility (#494)

## Implemented boundary

- `noinit` suppresses ngspice's printed initial transient solution. It does not mean UIC. `seedinfo` requests seed printing and does not change the seed. Both are diagnostic-only no-ops in spice-ts.
- Integer `warn` and `maxwarns` control SOA diagnostics, not circuit equations. Native SOA checks are not implemented; these are documented diagnostic-only no-ops.
- Integer `bypass` is preserved; negative values are rejected in decks and the API. Native nonlinear-device evaluation reuse is not implemented. The native solver always evaluates devices. `simulate()` returns an explicit `option` warning for nonzero requests. This is not a claim of ngspice bypass parity: runtimes, iteration counts and tolerance-level values can differ.
- `ramptime` adds the transient ramp-end breakpoint. ngspice-47 release builds do not ramp ordinary V/I sources: their ramp calls are guarded by `XSPICE_EXP`. XSPICE `capacitoric` and `inductoric`, which use the linear ramp factor in normal builds, remain explicitly unsupported. Finite and open-ended transient APIs, reset, batch/stream parity, API precedence and serialization are tested.

Source references use the [ngspice-47 release](https://sourceforge.net/p/ngspice/ngspice/ci/ngspice-47/tree/): `src/frontend/spiceif.c:449–451` (`noinit`), `src/frontend/inp.c:439–440,1446–1454` (`seedinfo`, SOA controls), `src/spicelib/analysis/cktsopt.c` (bypass/ramptime), `src/spicelib/analysis/dctran.c:217–221` (breakpoint), `src/spicelib/devices/vsrc/vsrcload.c:464–470` and `isrc/isrcload.c:447–453` (experimental source ramp guard), `src/xspice/cm/cm.c:498–522` (linear ramp factor). The separate `optran` cosine ramp is not used.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm test
pnpm -C packages/core exec vitest run src/parser/options-494.test.ts
pnpm exec tsx benchmarks/options-494/compare.ts
# optional, heavy (wrap in spice-heavy on shared hosts); evidence only, never committed over corpus-f:
pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4
cp benchmarks/corpus/corpus-f/outcomes.json benchmarks/options-494/corpus-f-rerun-outcomes.json
git checkout -- benchmarks/corpus/corpus-f
pnpm exec tsx benchmarks/options-494/corpus-delta.ts
```

No committed fixture bytes or numerical tolerances are changed. Project-authored MIT probes and upstream BSD-3-Clause corpus provenance are recorded in `benchmarks/SOURCES.md`. The before corpus is the committed snapshot at `bf2e4169d8c903d7e35f5de6886d5aaa127d9cf8`, not a contemporaneous rerun; unrelated drift must not be attributed to this patch.

## Identical-input numerical probes

Before implementation, both probes fail to parse: `ramptime.cir` at `noinit`, `bypass.cir` at `bypass`. These failures were reproduced using the base parser extracted with `git archive`. After implementation both engines run the same complete fixture bytes. Full initial/final signal values, maximum/RMS absolute and relative errors, point counts, versions, machine and timings are in `report.json`.

| Probe | ngspice / spice-ts points | Worst max absolute error / reference signal peak |
|---|---:|---:|
| RAMPTIME, ordinary V/I sources, PWL and held RC initial condition | 65 / 67 | 0.00012272823750621915 |
| BYPASS request, nonlinear diode DC sweep | 21 / 21 | 0.00016725044661708124 |

The diode current's pointwise relative error reaches **0.17617266017448674** near zero; its max absolute error is **6.19754732735932e-8 A**, RMS **1.6992974482834132e-8 A**. This residual is retained, not hidden by reporting only peak normalization. `bypass` is not implemented as an optimization. Timings include ngspice process startup and spice-ts dynamic import and support no speed/superiority claim.

## Verification receipts

- Frozen install, initial build and lint: exit 0.
- Initial focused RED: 9 failed / 5 passed. Focused GREEN after implementation and fixture coverage: 32 passed. Open-ended breakpoint regression was separately RED before its fix and GREEN afterward.
- Full local `pnpm test`: exit 1 on an existing BJT 5-second timeout (1796 passed, 2 skipped). A later full retry also exited 1 under severe host contention: 20 deadline failures, 1795 passed, 2 skipped. All 20 failures were test timeouts, not assertion mismatches. No deadlines were loosened.
- The retry's preceding `pnpm build` and `pnpm lint`: exit 0.
- After the full corpus rerun finished, final `pnpm build`, `pnpm lint`, all four root harness test files (46 tests), and the identical-input option probes each exited 0.
- During the corpus run, `VITEST_MAX_WORKERS=1 pnpm test` (same tests and deadlines, reduced concurrency) exited 1: 1810 passed / 5 timed out / 2 skipped. The five timeouts were existing HFET, 20,000-stage MOS chain, omitted-PULSE-period, rectifier and BSIM3 charge-history tests. A subsequent quiet run cleared every core test but hit an MCP stdio deadline; a standalone MCP retry passed its unit tests but hit the packed-worker polling limit.
- **Final local workspace verification exited 0**, with `VITEST_MAX_WORKERS=1` and no concurrent corpus run. The workspace invocation included the root `pnpm test` script (all packages, packed consumers, examples and 46 root harness tests), followed by the selected remaining packages. Core: 1815 passed / 2 skipped, including all 32 option regressions. Earlier timing failures are retained above, not presented as assertion failures or hidden by increased deadlines.
- CI test (20), test (22), build and accuracy are green on `56f2f08a3cd3285d6106574f2d0b25de76335c32`. Vercel's optional preview deployment reports its daily rate limit; no paid upgrade was attempted.
- Aggregate verification exits 1 before simulation on a stale fixture-tree provenance pin already present in the base; follow-up is [#598](https://github.com/mfiumara/spice-ts/issues/598). This patch also adds probe provenance to SOURCES.md. No aggregate parity refresh is claimed.

## Corpus-f

**This patch does not change the committed corpus-f `outcomes.json` or `README.md`.** The full 336-fixture rerun ran on a loaded shared host, from base `bf2e4169`, before #605 and #610 landed. In that run 13 ngspice reference runs that succeed in the committed snapshot hit the 600000 ms bound: 12 `examples/cider/*` decks and `examples/transient-noise/noi-sc-tr.cir` (listed in `corpus-delta.json` as `hostReferenceTimeouts`). Those are host-load timeouts, not ngspice failures, so the rerun must not replace the published corpus. It is kept here as `corpus-f-rerun-outcomes.json`, an evidence-only receipt. `corpus-delta.ts` reads it from that path. A quiet-host corpus-f refresh belongs to the corpus owners, not this options patch.

The rerun exited 0. `corpus-delta.json` preserves every before/after row and hash for all 18 first-failure members in the base #494 bucket, including the original 12. All 18 advance beyond the named options. The bucket shrinks **18 → 2**; its two residual members now reject `seed` and `NOMOD`, not the options implemented here.

**None of the original 12 produces a new completed native simulation or numerical comparison.** Eleven reach a further explicit unsupported decision; the bipolar adder reaches the unchanged 120-second execution bound. All 12 reference runs succeed. A timeout has no waveform score, not zero error. The synthetic probes above validate the implemented semantics without pretending these upstream decks now have parity.

| Original issue fixture | ngspice-47 output | spice-ts after option parsing | Numerical error |
|---|---|---|---|
| `examples/cider/mos/charge.cir` | TRAN, 403 points | unsupported `NUMOS` | not comparable |
| `examples/cider/mos/pass.cir` | TRAN, 33 points | unsupported `NUMOS` | not comparable |
| `examples/cider/serial/charge.cir` | TRAN, 403 points | unsupported `NUMOS` | not comparable |
| `examples/cider/serial/pass.cir` | TRAN, 33 points | unsupported `NUMOS` | not comparable |
| `examples/digital/compare/adder_bip.cir` | TRAN, 13690 points | 120000 ms execution timeout | not comparable |
| `examples/digital/compare/adder_mos.cir` | TRAN, 18073 points | model `version=3.3.0` parsing | not comparable |
| `examples/Monte_Carlo/rand_numb_test.cir` | control-only; no raw vectors | unsupported behavior-changing `seed=55` | not comparable |
| `examples/mos/adder_mos.cir` | TRAN, 18073 points | model `version=3.3.0` parsing | not comparable |
| `examples/plot/inv-chain-pyplot.cir` | control-only; no raw vectors | unsupported `pyplot` control command | not comparable |
| `examples/vdmos/soa_chk.sp` | control-only; no raw vectors | unsupported repeated control DC analysis | not comparable |
| `examples/xspice/original-examples/supply_ramping.deck` | TRAN, 67 points | unsupported XSPICE `capacitoric` | not comparable |
| `examples/xspice/various/ro_nand_digi.cir` | control-only; no raw vectors | unsupported `NOMOD` (also contains `XTRTOL`) | not comparable |

Full corpus totals (committed snapshot → evidence-only rerun receipt):

| Measure | Before | After |
|---|---:|---:|
| Fixtures | 336 | 336 |
| ngspice success / failed / unsupported | 306 / 18 / 12 | 293 / 31 / 12 |
| spice-ts success / failed / unsupported | 32 / 8 / 296 | 59 / 14 / 263 |
| Matched / mismatch / not-compared | 11 / 10 / 11 | 25 / 13 / 21 |
| spice-ts-loss / both-failed | 274 / 30 | 234 / 43 |

These global changes are **not an improvement claim for this patch**. There are 177 other changed fixture rows, including point-count variation, intervening simulator fixes relative to the old snapshot and host-resource failures. This run retains 16 ngspice bound failures and 10 native bound failures. The additional baseline option member `examples/cider/serial/recovery.cir` has a new ngspice 600000 ms timeout; its native outcome advances to unsupported `NUMD`. No prior successful reference result was substituted for that failed rerun.

The aggregate A–E report contains **zero byte-identical members** of these 18 option-bucket fixtures, so there are no matching aggregate rows to promote. Its whole-report verification is blocked by #598 as noted above, not claimed unchanged or green. Remaining unsupported models/control behavior have their existing gap issues. `seed`, `NOMOD`/`XTRTOL`, and quiet-host reproduction of the adder timeout require follow-up rather than expanding this parser/plumbing patch.
