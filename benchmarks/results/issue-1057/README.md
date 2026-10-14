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
- After on committed core tree `24918b5dac7ba4c42acf92ff8d6339aa4a660262`:
  both engines succeed with 5410 transient points; outcome `matched`.
- Worst peak-normalized error is 0.000367 on `tran i(vshiftlsp2)`, below 0.01.
  Full matched-point max/RMS absolute/relative metrics are in `jge.json`.
- Measured cold engine/adapter wall: ngspice 1978.631 ms, spice-ts 10080.134 ms.
  spice-ts is slower in this run. These include startup, adapter and export and
  are not solver-only timings or a performance-improvement claim.

The fixture is unchanged Xyce_Regression
`Netlists/CircuitSim90/MOS3/jge.cir`, upstream revision
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later. Source URL,
redistribution notice and per-file hash are retained in the pinned corpus-l
`SOURCES.md`, `licenses/xyce/` and `manifest.json`; this PR does not copy it.

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
