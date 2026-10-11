# TRNOISE / TRRANDOM sources vs ngspice-47 (issue #501)

spice-ts now runs the ngspice-47 transient noise sources `TRNOISE(NA TS [NALPHA NAMP RTSAM
RTSCAPT RTSEMT])` and `TRRANDOM(TYPE TS [TD PARAM1 PARAM2])` on independent V and I sources, and
rejects `EXTERNAL` with a typed `UnsupportedSourceWaveformError`. Sources and licences:
`benchmarks/SOURCES.md`, section "TRNOISE / TRRANDOM sources, issue #501".

    pnpm exec tsx benchmarks/trnoise-501/compare.ts

The script needs `ngspice` on PATH (ngspice-47 was used, macOS arm64). It writes `report.json`.

## What is ported

`packages/core/src/devices/transient-noise.ts` ports, from ngspice-47:

- `maths/misc/randnumb.c`: the combined Tausworthe/LCG generator (CombLCGTaus, CombLCGTausInt),
  TausSeed, drand, gauss0, exprand, poisson;
- `frontend/trannoise/wallace.c`: the Wallace normal generator (initw, NewWa, GaussWa), including
  the reuse of `jj` in NewWa's backward transform;
- `frontend/trannoise/1-f-code.c`: Kasdin 1/f^alpha noise (f_alpha, FFTW build: circular
  convolution over `TSTOP/TS + 10` points), trnoise_state_gen/get and trrandom_state_get;
- `spicelib/devices/{vsrc,isrc}/*load.c` and `*acct.c`: linear interpolation between samples, the
  RTS capture/emission state machine, the TRRANDOM hold, and the breakpoints each source sets.

ngspice keeps one random stream per process. spice-ts keeps one per compiled circuit and visits
the sources in ngspice's CKTaccept order (current sources, then voltage sources, each in reverse
netlist order), so multi-source decks draw in the same order.

## Seeds and what can match draw for draw

ngspice-47 seeds TausSeed with libc `srand`/`rand`. At startup `initw()` calls
`srand(getpid())` and fills the Wallace pool from that stream. `.option seed=N` later reseeds
only the uniform streams. So:

- **White and 1/f noise** come from the Wallace pool. In the ngspice-47 executable they change
  from run to run: two runs of `rts-1.cir` gave 3051 and 3087 timepoints. They cannot be
  compared sample by sample. spice-ts emulates the BSD/macOS `rand()` (Park-Miller minimal
  standard) and builds its pool as if the process id were 1, so its runs are reproducible.
- **RTS and TRRANDOM** draw from the uniform streams. With `.option seed=N` they are
  reproducible in ngspice, and spice-ts makes the same draws.

Bit-level evidence in `packages/core/src/devices/transient-noise.test.ts` uses golden values printed
by the verbatim ngspice-47 C sources (randnumb.c, wallace.c, macOS libSystem `rand`):

- `rand`, CombLCGTaus and drand match exactly;
- GaussWa, gauss0 and exprand go through `log()`. JavaScript's `Math.log` and the C library can
  differ in the last place, so these agree to within 4e-15 relative;
- after one million GaussWa variates the running rms (1.005265483479068) and the last variate
  still agree to 1e-12. That rms is above 1 in ngspice too: the `jj` reuse in NewWa is not
  orthogonal, so the pool variance drifts until the renormalisation every 65536 pools.

Seeded decks (`fixtures/seeded-vsrc.cir`, `fixtures/seeded-isrc.cir`, from `report.json`):

| Fixture | Vector | Source | Draws compared | Max relative difference |
|---|---|---|---|---|
| seeded-vsrc | v(1) | V RTS, 2 captures | capture times | 1.7e-16 |
| seeded-vsrc | v(2) | V TRRANDOM type 2 (Gaussian) | 21 | 3.8e-15 |
| seeded-vsrc | v(5) | V TRRANDOM type 3 (exponential, TD 15u) | 20 | 1.2e-16 |
| seeded-vsrc | v(6) | V TRRANDOM type 4 (Poisson) | 20 | 0 |
| seeded-isrc | v(3) | I RTS, 2 captures | capture times | 0 |
| seeded-isrc | v(4) | I TRRANDOM type 1 (uniform) | 21 | 1.5e-16 |
| seeded-isrc | v(7) | I TRRANDOM type 2 (Gaussian) | 21 | 2.3e-16 |

ngspice shows one more draw than spice-ts on v(2) and v(6). Its last breakpoint lands just
before TSTOP, because of the breakpoint drift described below.

## Statistics on the corpus-f decks of #501

Both engines run the deck body with the `.control` block removed. ngspice then runs `linearize`
onto the k*TS grid; spice-ts is interpolated onto that grid. These are single runs of random
processes: ngspice gives different numbers each run. The expected values follow from the source
parameters.

| Deck | Vector | Statistic | Expected | ngspice-47 | spice-ts |
|---|---|---|---|---|---|
| rts-1.cir | v(21) | rms (white 1m + 1/f 0.1m) | ≈1.005e-3 | 1.010e-3 | 0.9805e-3 |
| rts-1.cir | v(11) | RTS high fraction (500 samples, ~8 cycles) | 0.667 | 0.604 | 0.644 |
| simple-noise.cir | v(2) | rms (white 0.05) | 0.05 | 0.05033 | 0.04989 |
| simple-noise.cir | v(3) | I TRRANDOM std / mean | 1 / -0.01 | **0.0053** / 0.276 | 1.004 / -0.0053 |
| simple-noise.cir | v(4) | V TRRANDOM std / mean | 1 / 0.01 | 0.9978 / 0.0054 | 0.9996 / 0.0131 |
| noise_vnoi.cir | v(1) | spectral slope (alpha 1.7) | -1.7 | -1.59 | -1.62 |
| noise_vnoi.cir | v(2) | spectral slope (alpha 1.4) | -1.4 | -1.26 | -1.43 |
| noise_vnoi.cir | v(3) | spectral slope (alpha 1.0) | -1.0 | -0.95 | -1.00 |
| noise_vnoi.cir | v(4) | spectral slope (alpha 0.5) | -0.5 | -0.45 | -0.53 |
| noise_vnoi.cir | v(5) | rms (white 1n), 250000 samples | 1e-9 | 0.9996e-9 | 1.019e-9 |
| mtimeavg_test.cir | v(1) | rms (white 20n) | 2e-8 | 1.991e-8 | 1.965e-8 |

The 1.9% on noise_vnoi v(5) is the Wallace variance drift above, after about 1.5 million
variates from one stream. ngspice's own generator does the same from its own starting pool.

## Known differences from ngspice-47

1. **White and 1/f values** cannot match: ngspice's Gaussian pool depends on the process id.
2. **VSRC breakpoint drift.** vsrcacct.c subtracts CKTminBreak from `VSRCbreak_time` after each
   TRNOISE/TRRANDOM breakpoint, so ngspice's k-th sample breakpoint lands at about
   k·TS − (k−1)·CKTminBreak. spice-ts schedules accumulated k·TS (`+= TS`, as ngspice does before
   that subtraction). The values are the same; a new TRRANDOM value is first shown at a slightly
   different timepoint.
3. **ngspice's current source can freeze; spice-ts's does not.** isrcacct.c only advances when the
   accepted time is within 3 ULPs of n·TS. When another source's breakpoint within CKTminBreak
   displaces that timepoint (here `v4`'s accumulated TRRANDOM breakpoint on the same 8 ps grid),
   the test fails, no next breakpoint is set and the source holds its value. In
   `simple-noise.cir` ngspice holds `i3` (std 0.0053 instead of 1). With the strict 3-ULP test
   spice-ts froze the same way (2792 instead of 5000 draws in the regression deck). spice-ts now
   also accepts times within its breakpoint tolerance, so `i3` keeps a new value every TS.
   This is a deliberate deviation from an ngspice defect. Regression test: "keeps drawing a new
   value every TS" in `packages/core/src/transient-noise-source.test.ts`.
4. **Repeated runs.** ngspice continues one stream across `run` commands. spice-ts compiles each
   run afresh, so every run starts from the seed.
5. **Not supported yet:** the `notrnoise` and `rndseed` control-language variables, and
   `.option seed=random` (rejected; a clock seed would make runs unrepeatable).
6. **EXTERNAL** exists only in ngspice's shared-library build, where the host supplies the value
   through a callback. The ngspice-47 executable rejects `vext ctl 0 0 external` ("unknown
   parameter (external)"). spice-ts raises `UnsupportedSourceWaveformError`
   (`code: 'UNSUPPORTED_SOURCE_WAVEFORM'`, `keyword: 'EXTERNAL'`, with the line).

## corpus-f outcomes of the five #501 decks

Identical fixture bytes. `outcomes.ts --corpus-f-fixture-child` for `shared/t.cir`;
`control-vectors.ts --control-vector-child` (ngspice-47 `source` + `write` wrapper) for the four
`.control` decks. Before: origin/main `32564012`. After: this branch.

| Fixture | ngspice-47 | spice-ts before | spice-ts after | Outcome after |
|---|---|---|---|---|
| examples/shared/t.cir | unsupported (EXTERNAL) | unsupported: EXTERNAL | unsupported: typed EXTERNAL error | both-failed |
| examples/transient-noise/noise_vnoi.cir | success | unsupported: TRNOISE | unsupported: `.control` `linearize` | spice-ts-loss |
| examples/transient-noise/rts-1.cir | success | unsupported: TRNOISE | success | mismatch (worst 1.69, v(21)) |
| examples/transient-noise/simple-noise.cir | success | unsupported: TRNOISE | success | mismatch (worst 46.9, v(3)) |
| examples/various/mtimeavg_test.cir | success | unsupported: TRNOISE | unsupported: `.control` `mtimeavg()` | spice-ts-loss |

The two mismatches are expected and stay published as losses: the ngspice reference is a
process-id-seeded random run, so no pointwise threshold can pass, and this change does not add
one. The statistics above are the comparison. The simple-noise worst signal is `v(3)`, the
current source that ngspice freezes. Note that the corpus adapter scores
spice-ts's last `run` (after the deck's `alter`) against ngspice's `tran1`.

noise_vnoi.cir and mtimeavg_test.cir now get past their sources. They stop at control-language
commands (`linearize`, and `meas`/`fft` after it; the `mtimeavg()` vector function), which belong
to the control-language work in #488.
