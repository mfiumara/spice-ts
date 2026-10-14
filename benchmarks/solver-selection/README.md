# Solver-selection hints (#812)

`.options klu` and `.options sparse` are accepted as `solverSelection` hints.
They do not choose another backend: all native analyses retain spice-ts's sparse
LU path. Last hint wins, including across cards. `.option`, mixed case,
multi-field lines and Xyce package cards share this handling. Assigned forms
(including `klu=foo`, `klu=1`, `sparse=0`) retain structured ParseError rejection.
No stderr diagnostic is added and ngspice's KLU noise/PZ refusals are not emulated.

## Execution evidence

Baseline core `e89ed6a9f0836dea7d613ac303ad1f3a1b065cf4` includes only the RED
regression commit on top of `a521e9e2`. After core
`7442372721074e0e3e0237862768e7fc5963eb76` includes the parser/type fix.
Subsequent lane changes add only evidence and control-parser assertions.
An origin/main merge at `822bdec67610a59766eb9c2b7b90b28e65c76cda` brings
upstream changes, including #1009's repeated-dot-analysis retention. The separate
`postMain` receipt reruns every variant on that merged source, with identical
pins; the earlier before/after evidence is retained rather than overwritten.
Node v22.23.1, darwin arm64, Apple M5 Pro, Homebrew ngspice-47 with KLU.

Every one of the 14 variants was verified against its existing manifest SHA-256
before either engine ran. Both engines received the same lossless UTF-8 bytes.
No tolerance, model, netlist, pinned-hash or numerical solver changes were made.
The native adapters and comparison metrics are the existing classic/aggregate
harness. Runs use native ngspice `-b -r output.raw`, with `set filetype=ascii` in
an isolated HOME; no compatibility mode. Bounds are 180 seconds per variant and
120 seconds per ngspice child. This report is correctness evidence, not a speed
benchmark or a claim of superiority.

| Ticket / variant | Before spice-ts first error | After spice-ts first error / result | ngspice-47 reference |
|---|---|---|---|
| 645 klu | Unsupported .options field: klu | noise completes, 84 spectral + 1 integrated rows | KLU noise explicitly refused |
| 645 sparse | Unsupported .options field: sparse | noise completes, 84 spectral + 1 integrated rows | completes; metrics below |
| 690 klu | Unsupported .options field: klu | PZ completes, one pole, no zeros | KLU PZ explicitly refused |
| 690 sparse | Unsupported .options field: sparse | PZ completes, one pole, no zeros | completes; metrics below |
| 691 klu | Unsupported .options field: klu | AC 501 rows + PZ completes | KLU PZ explicitly refused, so whole reference fails |
| 691 sparse | Unsupported .options field: sparse | AC 501 rows + PZ completes | completes; metrics below |
| 718 klu | Unsupported .options field: klu | SingularMatrixError, column 40, control_node | singular/convergence failure |
| 718 sparse | Unsupported .options field: sparse | SingularMatrixError, column 40, control_node | completes despite pathological singular network; no own waveform to compare |
| 720 klu | Unsupported .options field: klu | ParseError at line 28, differential .sens v(5,4) | SIGSEGV in diagnostic rerun; no comparison |
| 720 sparse | Unsupported .options field: sparse | ParseError at line 28, differential .sens v(5,4) | exits 0; adapter cannot classify sensitivity raw plots, no metrics |
| 725 klu | Unsupported .options field: klu | SingularMatrixError, column 1, control_1 | OP completes, no own waveform to compare |
| 725 sparse | Unsupported .options field: sparse | SingularMatrixError, column 1, control_1 | OP completes, no own waveform to compare |
| 852 klu | Unsupported .options field: klu | AC 13 rows + TRAN 59 rows complete; second AC plot missing | intermittent native failure; exploratory run completes |
| 852 sparse | Unsupported .options field: sparse | AC 13 rows + TRAN 59 rows complete; second AC plot missing | completes; matched and missing plots retained |

Counts: before 14 parser rejections; after 8 executions complete, 4 singular
failures and 2 unsupported differential-sensitivity variants. All 14 solver
flags are accepted. Execution completion is not full-analysis parity: 852
spice-ts/adapter exports one of two repeated dot-AC sweeps. The missing sweep
is an unmatched plot with missing signals in the receipt, not zero error.
#812 remains open. 718 and 725 have floating controls and no unique control-node
voltage oracle. 718 now reaches singularity rather than an `isp` first-gap on
this baseline. These gaps and 720's sibling-owned sensitivity work are reported,
not fixed here.

## Comparison metrics, including residual losses

Final post-main results keep the same 8 complete / 4 singular / 2 unsupported
denominator. #1009 now exports both 13-row AC sweeps plus the 59-row transient
on 852. Both sparse AC sweeps match with the same errors in the table below;
the historical missing second plot is resolved upstream, not by the option fix.
Native KLU completes this final trial, but one of its AC plots contains
non-finite values: the harness serializes its max/RMS as null. That plot is
unscorable, not a zero-error win. The other KLU AC plot has the exploratory
metrics below; all final samples and null metrics are retained in `postMain`.

Existing aggregate harness matches grids with linear alignment; no endpoints
are excluded in the comparisons below. Full grids, signals, all root errors,
missing plots and diagnostics remain in `receipts.json.gz`.

| Reference / signal | Matched points | Absolute max | Absolute RMS | Relative max | Relative RMS |
|---|---:|---:|---:|---:|---:|
| 645 sparse / onoise_spectrum | 84 | 2.9478846941461046e-14 | 2.0805582685808688e-14 | 1.2817787191677196e-7 | 1.0255969023370908e-7 |
| 690 sparse / pole(1) | 1 | 0 | 0 | 0 | 0 |
| 691 sparse AC / v(4) | 501 | 3.825438583876056e-8 | 8.057790173857085e-9 | 5.586570456651667e-11 | 4.510768821953229e-11 |
| 691 sparse PZ / pole(6) | 1 | 80.35322856903076 | 80.35322856903076 | 7.617585113469103e-8 | 7.617585113469103e-8 |
| 852 sparse matched AC / v(out) | 13 | 2.2887833992611187e-16 | 1.1547163082627575e-16 | 2.4002839229001683e-16 | 1.2348428717786747e-16 |
| 852 sparse TRAN / v(out) | 59 | 0 | 0 | unavailable (zero reference) | unavailable (zero reference) |
| 852 klu exploratory matched AC / v(out) | 13 | 2.2247786310271853e-16 | 1.2728432628739117e-16 | 2.235853311487114e-16 | 1.3449518020511325e-16 |

690 agrees with the independent analytic single pole -6.666666666666667e7 rad/s.
691 has seven poles and six zeros; pole(6) is the largest relative root residual,
not a claim that all roots are exact. KLU references failing an analysis are not
used as correctness oracles. 852 KLU completed in the baseline, exploratory
post-fix and diagnostic runs, but failed the committed post-fix run. This
variability is published; no favorable trial substitutes for the failed trial.
The exploratory post-fix production source is the same as 74423727 but was not
yet committed; its receipt is explicitly labelled. Its second AC plot is also
missing. Native 720 sparse diagnostic exits 0 with 493676 raw bytes; the current
adapter's `no raw analysis data produced` means no recognized plot, not engine
nonconvergence. KLU exits -11 (SIGSEGV) with 982 raw bytes.

## Reproduce

Run from the repository root. PR1038 was still open during this run, so the
standalone scoped runner avoids any edits beneath the tracked corpus.

1. `pnpm install --frozen-lockfile`
2. `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 645 690 691 718 720 725 852`
3. `python3 benchmarks/solver-selection/prepare.py`
4. `pnpm build`
5. `spice-heavy pnpm exec tsx benchmarks/solver-selection/run.ts "$TMPDIR/solver-selection.jsonl"`
6. `pnpm -C packages/core exec vitest run src/parser/solver-selection.test.ts src/analysis/pole-zero.test.ts src/analysis/noise.test.ts`
7. `pnpm exec tsx --test benchmarks/solver-selection/receipts.test.ts`
8. `pnpm lint && spice-heavy pnpm test`

For before/after reproduction, build core at the RED commit, run the same
standalone runner, then rebuild core at the fix commit and rerun with a new
output filename. The runner refuses to overwrite receipts. `prepare.py`
reconstructs only the already documented 718/720 variants and refuses any pin
mismatch before writing them. The other ten inputs are already committed
small corpus quotations. No third-party netlist is added to this directory.
Source/licence restrictions remain in `../SOURCES.md` and the corpus manifest.

Observed exits: frozen install 0; fetch 1 solely for ticket 725 log drift;
preparation 0 with all four reconstructed pins matching; all three 14-variant
runs 0 (individual failures are data); build 0; lint 0; RED targeted regression
1 (7 failures, 6 passes); GREEN targeted regression 0 (13 passes); combined
AC-adjacent/noise/PZ regression 0 (90 passes); receipt checks 0 (2 passes);
`spice-heavy pnpm test` 0 (guarded full monorepo suite, about 431 seconds).
The final standalone benchmark-test stage reports 177 passes, 4 skips, 0 failures.

Changed non-input log on 725: actual
`bfc5ea49f206bda2371c50aa21cdc7af986dcce6f02f20d7dbddd8d958d4b7e4`, recorded
`04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2`.
It is not supplied to either simulator and its pin was not changed.

`receipts.json.gz` is losslessly compressed JSON containing baseline, committed
post-fix, exploratory post-fix, post-main-merge and explicit native diagnostic executions.
Absolute workspace/scratch prefixes are sanitized; numerical samples are not
truncated. No complete third-party netlist or model library is included;
native error diagnostics retain the small excerpts printed by ngspice.
Regression tests check exact
result equality for klu/sparse/no option separately for AC/noise/PZ/TRAN, and
receipt checks assert denominator, pins, equal hint results and retained losses.
