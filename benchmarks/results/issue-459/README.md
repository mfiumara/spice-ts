# Issue #459: `.OPTIONS TEMP` and the aggregate refresh after #470, #537, #542 and #541

Host: Apple M5 Pro, darwin arm64, Node v22, ngspice-47 (shared host, load average above 200, so
runtimes are diagnostic only). Every row is one full 100-fixture `benchmarks/aggregate-report.ts`
run. Rows 1-3 ran in throwaway worktrees (`git worktree add --detach <main commit>`) with only the
`SOURCES_SHA256` pin in `benchmarks/aggregate-report.ts` set to that commit's `benchmarks/SOURCES.md`
(`33b51481`), using `--check` against the committed #470 artifact. `--check` then fails only on the
pin, and its error lists the fixtures whose deterministic projection differs. Row 4 is a generation
run on the same 5589ab1 worktree, so its outcome hash can be quoted. Rows 5 and 6 are this branch.
Nothing from the bisect worktrees is committed.

| Run | Main commit | PR | Outcome | spice-ts S/F/U | Analyses / fixtures | Change vs previous row |
|---|---|---|---|---|---|---|
| 0 | `38acdbb` | #470 aggregate refresh (head `969d955`, identical tree) | `9d9321d6` (committed; `--check` passed in review) | 63/1/36 | 70 / 51 | baseline |
| 1 | `fdc3af6` | #537 Xyce SPICE3 translation corpus | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | pin `2552da00` → `33b51481` only |
| 2 | `327aa28` | #542 typed UnsupportedModelTypeError | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | spice-ts error text of corpus-d/pwm-switch only (stays unsupported; error text is outside the projection) |
| 3 | `5589ab1` | #541 LU factor reuse | `--check`: "differing fixtures: none" | 63/1/36 | 70 / 51 | outcome-neutral |
| 4 | `5589ab1` (generation) | — | `c703b84a` | 63/1/36 | 70 / 51 | per-fixture metrics, grids and statuses identical to row 0 |
| 5 | `5589ab1` + #459 (pin `c00b9106`, before ledger edit) | #459 `.OPTIONS TEMP` | `ea68964e` | 64/1/35 | 71 / 52 | only ngspice/vbic-temperature: unsupported → success |
| final | this branch, regenerated ledger (pin `c00b9106`) | — | `6dc28693` | 64/1/35 | 71 / 52 | ledger text only; `--check` passes |

ngspice stays at 52/9/39 throughout.

## ngspice/vbic-temperature (unchanged `tests/vbic/temp.cir`, TEMP = 150 C)

One DC analysis, 101 of 101 points aligned, 6 signals:

| Signal | abs max | abs RMS | rel max |
|---|---|---|---|
| i(vc) | 9.2353e-7 A | 1.7138e-7 A | 1.130e-4 |
| i(v1) | 7.6074e-7 A | 1.3568e-7 A | 8.794e-5 |
| i(vb) | 1.6704e-7 A | 3.7293e-8 A | 3.428e-4 |
| v(1), v(q1_b), v(q1_c) | 0 | 0 | 0 |

These are losses against ngspice-47 and are published as such. The same bounded VBIC on the same
deck at 27 C differs by up to 2.67e-6 A on i(vc), so the residual is the existing bounded-model gap
(#76), not the temperature mapping.

Totals move from 969 to 975 absolute and 933 to 939 relative signals, and from 9,427,074 to
9,427,680 absolute and 9,400,650 to 9,401,256 relative samples. Both envelopes are unchanged
(absolute 7853.15771484375 on vbic-common-emitter-ac pole(1), relative 1075904.729730855 on
ngspice/mos6-inverter-transient). No fixture, tolerance or harness logic changed.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm -C packages/core build
pnpm exec tsx benchmarks/aggregate-report.ts --check
```
