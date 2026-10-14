# Pump residual investigation (#1019)

Unresolved loss. This is an evidence-only slice, not a simulator fix. Keep #1019
open. No production source, deck, integration option, tolerance, or scoring rule
changes. The next step needs a controlled native limiting/bypass/convergence
comparison; the observations below do not establish a safe general correction.

## Identical-input results

The required remeasurement used merged main d8ab9d3374d8ada21f7d9dd221c3fc3595aa5783
(after #1021, #1031 and #1033). `before.json` preserves the report at a521e9e2;
`benchmarks/reference/maxord-983/report.json` is freshly regenerated. This delta
contains multiple upstream changes, not an isolated attribution to #1002.

| Case | Historical normalized error | Current | Current points, TS / ngspice |
| --- | ---: | ---: | ---: |
| Original pump k-13, i(vnin) | 0.0585 | 0.063, mismatch | 867 / 868 |
| RC trap MAXORD=1 | 1.24e-15 | 1.24e-15, matched | 97 / 97 |
| RC trap MAXORD=2 | 2.99e-15 | 2.99e-15, matched | 67 / 67 |
| RC gear MAXORD=1 | 1.24e-15 | 1.24e-15, matched | 97 / 97 |
| RC gear MAXORD=2 | 2.01e-7 | 2.01e-7, matched | 67 / 67 |

The historical pump had 869 TS points. Current normalized pump voltage errors
remain below 1%. Maximum absolute v(5)/v(6) error is about 0.990071 mV.
Current worst scored current error is 19.539446179088065 uA at
45.02373230181537 ns against a 310.1259607419718 uA reference peak. The first
1% current violation is 3.6502048935892987 uA at 15.208922042773343 ns.
`localization.json` and the complete `waveforms.json.gz` retain all common
signals and the violation window. The Python diagnostic reproduces the existing
shared-grid right-sided reconstruction, not a new comparison rule.

## Accepted device history and order localization

`native-trace.json.gz` retains all MOS2 loads, NIiter trial steps and CKTtrunc
bounds. `ts-trace.json.gz` retains accepted charges/currents/voltages/full
capacitances, step work and charge-LTE bounds. `state-localization.json` stores
selected paired observations. Instrumentation is observation only.

Both engines start at 2 ps, repeat a 2 ps step, then double. All native accepted
steps are order 1; all observed TS charge integrations are Euler. There is no
order-2 fallback explanation for this loss.

Tiny initial floating-point and iteration-count differences exist before the
source edge. The first rising-edge dynamic point at 5.006173196363713 ns has
matching qgb and gate voltage to floating-point precision. At the next accepted
point, 5.0185195890911405 ns, native last-loaded vgs is
0.448775742809802 V and TS accepted gate-source voltage is
0.4487750594998694 V; qgb differs by 4.517685251731772e-21 C. The grids still
coincide there. These are loaded/accepted states, not a forced common-step run.

At 5.0237739315258896 ns the native next-step charge-LTE bound is
4.292024542386742 ps, versus TS 4.292025075052835 ps. The first accepted-time
separation larger than 1 attosecond is native 5.027387877402101 ns versus TS
5.027387875826269 ns. That diagnostic resolution is not a scoring tolerance.
The remaining repeated-edge trajectories separate further, most visibly in
current during the short gate transitions around 45 ns.

Cautions for the continuation:

- Native logged Meyer caps are half-capacitances without overlap. TS accepted
  caps are full capacitances including overlap. Do not compare them directly.
- TS step iteration counts include rejected trial work in one advance; native
  STEPTRACE counts one NIiter call. They are not directly equal work counters.
- The first 1% violation at 15.208922 ns lies immediately after a PWL corner
  whose printed grids differ in the last bits (15.2 vs 15.200000000000004 ns).
  The unchanged harness recognizes only exactly shared breakpoints. This can
  contribute to that early score but does not explain the entire 45 ns loss.
- A small accepted-history delta is measured, not proven to be the root defect.
  Limiting/convergence, native bypass, and charge stamping at raw versus loaded
  terminals need controlled tests before altering the shared MOS2 path. This
  investigation does not justify shipping a speculative patch.

## Native verification and sources

The instrumented source is ngspice's ngspice-47 tag, object
`a80f6e3e95d51534905b1f23410a951802666656`, from
https://github.com/ngspice/ngspice. Its full 868-point waveform matches the
installed ngspice-47 reference exactly on all four common signals, including
times. `native-check.py` asserts this before producing the retained trace.
The source and build are ignored, not redistributed. The `fprintf` insertion
recipe is `instrument-native.py`. Source licence is ngspice's mixed BSD-style
licences, retained upstream; no native executable is committed.

Pump source/licence and unchanged SHA-256 remain pinned in corpus-k's manifest
and `benchmarks/SOURCES.md` (Xyce_Regression, GPL-3.0-or-later). No deck copy is
added. Analysis scripts and generated diagnostics are project-authored MIT.
No runtime or superiority claim is made.

## Guard receipts

- mosamp2 unchanged 5 uV guard passes, error 2.7059435190324166 uV, 2429 points.
- mosrect k-10 worst normalized error 0.00014821670590837676, 1008 points.
- ring k-15 worst normalized error 0.0001157572486297565, 1010 points.
- All four maxord RC cases match.
- 35 focused tests pass across five files. Full guarded suite passes, including
  core 4138 passed / 2 skipped. Build and lint pass. Compressed logs retained.

## Reproduce

From repository root after `pnpm install --frozen-lockfile`:

    pnpm build
    spice-heavy pnpm exec tsx benchmarks/reference/maxord-983/run.ts
    spice-heavy pnpm exec tsx evidence/1019/measure.ts
    pnpm exec tsx evidence/1019/trace.ts
    python3 evidence/1019/localize.py
    python3 evidence/1019/check.py
    python3 -m unittest discover -s evidence/1019 -p test_check.py
    pnpm lint
    spice-heavy pnpm test

The checker compares every pump report field except `runtime`: wall-clock
timings vary between runs and are retained only as observations. Error metrics,
point counts, hashes and outcomes must still match exactly. The regression tests
verify that timing-only changes pass while error and point-count changes fail.

Related guards use the existing `evidence/1002/run.ts pump-1019` and
`evidence/1002/mosamp.ts pump-1019` scripts. Move their generated receipts from
`evidence/1002/` to `related.json`, `mosrect-trace.json.gz`, and `mosamp.json`
here, as this run did. They compare the retained #996 ngspice-47 goldens already
verified by #1033, not a new native run for those guards.

To regenerate the native trace, archive the pinned ngspice-47 tag into ignored
`native-src/`, run autogen.sh, apply `instrument-native.py native-src`, configure
out-of-tree in `native-build` with `--with-readline=no --disable-debug
--disable-openmp` and Homebrew bison. With bison 3.8.2, explicitly generate the
frontend parse-bison and spicelib/parser inpptree-parser .c/.h outputs using
`bison -d -o ...`; the old system bison cannot compile these grammars. Build via
`spice-heavy make -j2`. Run the original pump bytes with `-b -r output.raw`, a
private HOME containing `set filetype=ascii` in .spiceinit, and capture stderr
as `native-build/trace.log`. Run `python3 evidence/1019/native-check.py`, then
`python3 evidence/1019/receipt.py`. No numerical source edits are made.
