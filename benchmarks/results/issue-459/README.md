# Issue #459: `.OPTIONS TEMP` and the aggregate refresh after #470, #537, #542, #541, #546, #545, #550, #552, #562 and #554

Host: Apple M5 Pro, darwin arm64, Node v22, ngspice-47 (shared host, load average above 200, so
runtimes are diagnostic only). Every row is one full 100-fixture `benchmarks/aggregate-report.ts`
run. Rows 1-7 and 9 ran in throwaway worktrees (`git worktree add --detach <main commit>`) with only the
`SOURCES_SHA256` pin in `benchmarks/aggregate-report.ts` set to that commit's `benchmarks/SOURCES.md`
(`33b51481` for rows 1-7, where #537 was the last SOURCES.md change on main; row 9 kept the `d4a0994d` pin that #552 committed). Rows 1-3 used `--check`
against the committed #470 artifact: it then fails only on the pin, and its error lists the
fixtures whose deterministic projection differs. Rows 4-7 and 9 are generation runs, compared per fixture
with a throwaway script (statuses, grids and every per-signal metric; error text excluded, as in the
deterministic projection). Rows 8, 10 and final are this branch. Nothing from the bisect
worktrees is committed.

| Run | Main commit | PR | Outcome | spice-ts S/F/U | Analyses / fixtures | Change vs previous row |
|---|---|---|---|---|---|---|
| 0 | `38acdbb` | #470 aggregate refresh (head `969d955`, identical tree) | `9d9321d6` (committed; `--check` passed in review) | 63/1/36 | 70 / 51 | baseline |
| 1 | `fdc3af6` | #537 Xyce SPICE3 translation corpus | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | pin `2552da00` → `33b51481` only |
| 2 | `327aa28` | #542 typed UnsupportedModelTypeError | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | spice-ts error text of corpus-d/pwm-switch only (stays unsupported; error text is outside the projection) |
| 3 | `5589ab1` | #541 LU factor reuse | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | outcome-neutral |
| 4 | `5589ab1` (generation) | — | `c703b84a` | 63/1/36 | 70 / 51 | per-fixture metrics, grids and statuses identical to row 0 |
| 5 | `21eea3e` | #546 mcp lifecycle scripts | `c703b84a` | 63/1/36 | 70 / 51 | outcome-neutral (reproduces row 4 exactly) |
| 6 | `7b8a1ba` | #545 ngspice first transient step at t = 0 | `b682fde3` | 63/1/36 | 70 / 51 | 25 transient analyses; **losses** mos-amp v(5) 5.255 → 5.300 V, schmitt v(6) 0.7573 → 0.7638 V, relative RMS envelope 201300.6 → 203361.3 (hfet i(vdd)); gains coupled-lossy-lines 0.927 → 0.828 V, rca3040 TRAN 0.256 → 0.230 V |
| 7 | `2a8112c` | #550 GP BJT junction limiting + substrate junction | `75420c0c` | 63/1/36 | 70 / 51 | 24 analyses on 14 BJT fixtures; coupled-lossy-lines RMS down on 38 of 47 but **loss** worst v(x3.3) 0.8275 → 0.8435 V; lossy-line-24-inch 0.498 → 0.456 V; **loss** bjt-noise onoise_total rel 1.23e-7 → 1.91e-7 |
| 8 | `2a8112c` + #459 (pin `c00b9106`, before ledger edit) | #459 `.OPTIONS TEMP` | `e5d648fa` | 64/1/35 | 71 / 52 | only ngspice/vbic-temperature: unsupported → success (superseded by rows 9-10) |
| 9 | `2812371` (its own pin `d4a0994d`) | #552 MOS1 body effect, signed VTO, LD; typed UnsupportedModelLevelError | `3c88e414` | 59/1/40 | 66 / 47 | **coverage loss**: mos-amplifier pair (LEVEL=2), bsim1 (LEVEL=4), bsim2 (LEVEL=5) success → unsupported (follow-up #565); mos-memory-cell 1.906 → 0.248 V gain |
| 10 | `2812371` + #459 (pin `2ce09abb`, before ledger edit) | #459 `.OPTIONS TEMP` | `d3b4fb48` | 60/1/39 | 67 / 48 | only ngspice/vbic-temperature: unsupported → success (superseded by row 13) |
| 11 | `a32f755` (pin `d4a0994d`, unchanged by #562) | #562 VDMOS power MOSFET | `3c88e414` | 59/1/40 | 66 / 47 | outcome-neutral (reproduces row 9 exactly) |
| 12 | `0e1aeb4` (pin `fa95e5d0`, #554's SOURCES.md) | #554 XSPICE A elements | `8a19a9d7` | 59/1/40 | 66 / 47 | per-fixture metrics, grids and statuses identical to row 11; only the pin moves the hash (main 0e1aeb4 itself still pins `d4a0994d`, so `--check` fails there on the pin) |
| 13 | `0e1aeb4` + #459 (pin `fd8b534c`, before ledger edit) | #459 `.OPTIONS TEMP` | `c9cb2850` | 60/1/39 | 67 / 48 | only ngspice/vbic-temperature: unsupported → success |
| final | this branch on `0e1aeb4`, regenerated ledger | — | see `AGGREGATE_PARITY.md` | 60/1/39 | 67 / 48 | ledger text only; `--check` passes |

ngspice stays at 52/9/39 throughout. The full gain and loss lists for rows 6, 7 and 9 are in the
`metricTransitions` ledger of `benchmarks/aggregate-report.ts` (rendered in `AGGREGATE_PARITY.md`).
Row 9 used the pin that #552 itself committed. The four fixtures it rejects keep stale `spiceTs`
reasons in their corpus manifests; updating those would change the fixture-tree pin, so it is left
for a follow-up, as #552 noted.

An earlier pass of this branch on main 5589ab1 (pushed as `0f381ea`, outcome `6dc28693`, `--check`
exit 0) went stale when #546, #545 and #550 merged, and row 8 went stale when #552 merged. Rows 5-10 replace them.
The pass on main 2812371 (pushed as `ea541987`, outcome `4ed6d9d3`, `--check` exit 0) went stale when #562 and
#554 merged; rows 11-13 replace it.

## ngspice/vbic-temperature (unchanged `tests/vbic/temp.cir`, TEMP = 150 C)

One DC analysis, 101 of 101 points aligned, 6 signals:

| Signal | abs max | abs RMS | rel max |
|---|---|---|---|
| i(vc) | 9.2353e-7 A | 1.7138e-7 A | 1.130e-4 |
| i(v1) | 7.6074e-7 A | 1.3568e-7 A | 8.794e-5 |
| i(vb) | 1.6704e-7 A | 3.7293e-8 A | 3.428e-4 |
| v(1), v(q1_b), v(q1_c) | 0 | 0 | 0 |

These are losses against ngspice-47 and are published as such. An independent rerun outside the
harness (ngspice-47 `wrdata` with 12 digits against `simulate()` on the same bytes) gives the same
maxima. The same deck with TEMP=27 differs by up to 2.669e-6 A on i(vc) and 5.65e-7 A on i(vb), so
the residual at 150 C is the existing bounded-model gap (#76), not the temperature mapping.

On top of main 0e1aeb4 (per fixture identical to 2812371), #459 moves totals from 873 to 879 absolute and from 841 to 847 relative
signals, and from 9,388,320 to 9,388,926 absolute and from 9,364,374 to 9,364,980 relative samples.
#459 changes neither envelope. No fixture, tolerance or harness logic changed.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm -C packages/core build
pnpm exec tsx benchmarks/aggregate-report.ts --check
```
