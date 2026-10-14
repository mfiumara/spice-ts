# MOS3 circuit-temperature admission (#1057)

## Result

The existing `mos3.ts` port already contained the ngspice-47 temperature equations.
The failing path was `Circuit.applyCircuitTemperature`, which rejected every MOS3
instance before calling `setTemperature`. This change admits LEVEL=3 only, audits
and cites the existing equations, and rejects unported supplied model parameters
with a structured `UnsupportedTemperatureError` naming the field. Instance
TEMP/DTEMP overrides fail closed rather than being silently ignored. LEVEL=6 and
LEVEL=9 remain outside the validated non-nominal circuit-temperature surface.
No MOS2 implementation, corpus fixture, harness, outcome or tolerance was edited.

## Reproduce

From the repository root, with ngspice-47 on PATH:

```sh
pnpm install --frozen-lockfile
spice-heavy pnpm exec tsx benchmarks/results/issue-1057/reference.ts
pnpm -C packages/core exec vitest run src/devices/mos3-temperature-1057.test.ts src/devices/mos3.test.ts src/devices/mos2-temperature-995.test.ts src/temperature-ngspice-parity.test.ts
pnpm build
pnpm lint
spice-heavy pnpm exec tsx benchmarks/results/issue-1057/jge.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1057/rich3.ts
```

The reference generator runs `ngspice -b -r probe.raw probe.cir` with an isolated
HOME whose `.spiceinit` selects ASCII output. It never modifies a simulation deck
for either engine. `reference.json` stores the exact deck text, SHA-256, OP values
and eleven interpolated samples over a complete sinusoidal cycle. The tests feed
that same text to `simulate`. All twelve references use TNOM=50 C, TEMP=100/-40 C,
NMOS/PMOS, no/direct/sheet series resistance, M=2, body bias, junction depletion
capacitances, NFS, VMAX and short-channel terms. Synthetic probes are original
project work under the repository MIT licence. Provenance is also registered in
`benchmarks/SOURCES.md`.

## RED / GREEN receipts

- RED commit `ef71a6d3`: 30 tests, 16 failures, 14 passes. Twelve public OP+TRAN
  cases fail at the circuit guard; four fail the required parameter-specific
  diagnostic. Device-level OP law tests already pass, confirming the location of
  the bug. See `red.log.gz`.
- GREEN: 4 files, 123 passing tests (33 new MOS3 temperature tests, 15 existing
  MOS3, 37 MOS2 temperature, 38 general temperature parity). See `green.log.gz`.
- `pnpm build` and `pnpm lint` exit 0. See `build.log.gz`, `lint.log.gz`.
- Only targeted tests were run locally, per this card. Required GitHub CI on the
  final PR head is the full monorepo gate, not an unguarded local full-suite run.

## Identical-byte jge result

`jge.ts` reads the fixture and manifest directly from reviewed corpus-l commit
`66d67caff2f10e4d6a36d2e59898cc52d661b98d` via `git show`, checks its hash, and
passes the same Buffer to unchanged corpus-f engine runners. The unchanged
corpus-j `reduceRow` applies the standard 0.01 peak-normalized match threshold,
including the existing quantity floors. No adapted/fine-step reference is used.

- Before, recorded in that reviewed corpus-l baseline (not remeasured): ngspice
  succeeds, spice-ts fails with `UnsupportedTemperatureError` for m0 at 100 C.
  No comparable waveform, so worst error is null, not zero.
- After merging main and rerunning on committed core tree
  `7a189dd51b7dc41559272741791ccd90a6839aa4`:
  both engines succeed with 5410 transient points; outcome `matched`.
- Worst peak-normalized error is 0.000367 on `tran i(vshiftlsp2)`, below 0.01.
  Full matched-point max/RMS absolute/relative metrics are in `jge.json`.
- Measured cold engine/adapter wall: ngspice 2012.298833 ms, spice-ts 10777.347041 ms.
  spice-ts is slower in this run. These include startup, adapter and export and
  are not solver-only timings or a performance-improvement claim.

The fixture is unchanged Xyce_Regression
`Netlists/CircuitSim90/MOS3/jge.cir`, upstream revision
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later. Source URL,
redistribution notice and per-file hash are retained in the pinned corpus-l
`SOURCES.md`, `licenses/xyce/` and `manifest.json`; this PR does not copy it.

## Identical-byte rich3 result (residual loss)

The same pinned corpus-l commit supplies l-19, unchanged
`Netlists/CircuitSim90/MOS3/rich3.cir` at TEMP=125 C. SHA-256 is
`5cf5ebcafb990907419d4844249ed6c8a53e47be8faf06f8e16fd08a5ef353ae`.
The upstream revision and GPL-3.0-or-later provenance are the same as jge above.
`rich3.ts` uses the unchanged corpus-f runners and corpus-j reducer with the
unchanged 0.01 threshold. There is no per-circuit tuning or fine-step reference.

- Before, freshly measured on main `d39157cd467ddd63ce501334b330609e7ee0a644`:
  ngspice succeeds with tran:1314. spice-ts fails with the temperature-model
  rejection for m$600 at 125 C. Error and signal are null, not zero.
  Cold wall is ngspice 268.501000 ms, spice-ts 598.842542 ms (failed run).
- After, on merged revision `8da46c02aaa19dccf26e5b76535d588378b1a820`:
  ngspice succeeds with tran:1314, spice-ts succeeds with tran:1341.
  The outcome is `mismatch`, across 56 compared signals. Worst normalized error
  is 0.284 on `tran i(v$d7)`, above 0.01. For that signal, max absolute error is
  0.00038097756419687353 A and RMS is 0.000014831501890016032 A.
  Cold wall is ngspice 354.445417 ms, spice-ts 2770.781167 ms.
- Full metrics, machine/tool details, revision and clean-core-diff hashes are in
  `rich3-before.json` and `rich3-after.json`. Timings include startup and export;
  these are not solver-only measurements or a speed-improvement claim.

This admission fix removes the guard failure but does not establish rich3 parity.
The PR therefore references #1057 rather than closing it. The waveform residual
has not been attributed to the temperature law versus transient/grid behavior.
No new production changes or residual diagnosis are included in this slice.

For a fresh before/after rerun, retain the untracked `rich3.ts` in this path,
check out the recorded main revision, run `pnpm build`, then run
`spice-heavy pnpm exec tsx benchmarks/results/issue-1057/rich3.ts --before`.
Return to the PR revision, rebuild, and run without `--before`.
`remediation-*.log.gz` retain the fresh build, lint, 123 targeted-test and jge
receipts. Required exact-head CI is the full-suite gate.

## Source audit

Sources are ngspice-47, under their existing Berkeley/ngspice source notices:

- https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos3/mos3temp.c
  SHA-256 `c84497effed3e65741626121e4c448a05ecb3178602778bc3cf604db35b9a089`.
  Lines 44-50 and 131-145 compute nominal/instance thermal factors; 214-251
  compute KP/U0, PHI/VTO, IS/JS, PB and capacitance scaling; 253-339 compute
  critical voltages and depletion polynomial coefficients.
- https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos3/mos3load.c
  SHA-256 `5e925cdd5bfa2c8b569653832be49fd481add162f658d080645bec08739ae7fb`.
  Lines 111, 152-154, 567-575, 615, 626-638, 657 and 1081-1087 consume the
  temperature-adjusted thermal voltage, KP, PHI, Vbi and surface mobility.
- https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos3/mos3.c
  SHA-256 `4c287340027acd1041e690321ec7576bfd4cb1b9c37f0c77a30b0d5d4709ea76`.
  Lines 114-157 list the model parameter surface. Dialect temperature extensions
  such as TCV, UTE, TRD and XTI have no ported MOS3 law and are explicitly tested
  as rejected, not silently interpreted as another model family.
