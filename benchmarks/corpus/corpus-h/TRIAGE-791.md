# corpus-h triage for #791: the three SpiceSharpParser cookbook decks above 1%

Three SpiceSharpParser (MIT) cookbook decks run in both engines but exceed the uniform 1% corpus-h threshold. This note gives the root cause for each. One is a spice-ts simulator difference and is fixed here. The other two are not simulator bugs. Fixtures, metric and threshold are unchanged.

Measured on main `a2001a93` (before) and this branch (after), with Homebrew ngspice-47 on macOS arm64. Decks are byte-identical to `manifest.json`. ngspice runs as `HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r <raw> <deck>`. Diagnostic variants change only the `.tran` TMAX (the relay 1 ns variant also stops at 1.2 ms and drops the `.MEAS` cards), and they are never scored. Receipts are in `triage-791.test.ts`, which runs in the root `pnpm test`.

| Fixture | Worst before (main a2001a93) | Worst after (this branch) | Root cause |
|---|---|---|---|
| `transmission-line-termination.cir` | 0.0625 `v(open_out)`, mismatch | 5.29e-14, matched | spice-ts lossless T did not step like ngspice-47 TRA. Fixed. |
| `bjt-relay-driver.cir` | 0.0215 `v(collector)` | 0.0215 (unchanged) | #592 reference-grid artefact on a 60 ns switching edge |
| `astable-led-flasher.cir` | 1.27 `v(base2)` | 1.27 (unchanged) | Free-running oscillator phase: a 16 us edge offset, below ngspice's own 430 us TMAX dependence |

The "after" numbers are corpus-h's own runner (`parity.ts --corpus-h-fixture-child <id>`) on this branch. This PR does not regenerate `outcomes.json` or `README.md`; the nightly refresh owns that.

## transmission-line-termination.cir: fixed (spice-ts T stepping differed from ngspice-47 TRA)

The deck drives a 50 ohm, 20 ns lossless `T` line open-ended (1 Meg) and matched (50 ohm), from a 10 ohm source with `PULSE(0 5 5n 1n 1n 150n 300n)`.

**What differed.** spice-ts wrote 929 points and ngspice-47 wrote 819. ngspice-47 has no point at TD = 20 ns or at the 25 ns arrival. Its grid is a uniform 0.25 ns grid at 0.125 ns offsets, and every value on it is exact (1e-12 against an ngspice TMAX 25 ps run). spice-ts deviated in three ways, all in `packages/core/src/devices/transmission-line.ts`:

1. **Breakpoint at TD.** spice-ts added a breakpoint at TD. ngspice-47 tra/ has none: TRAaccept only sets one when a launched wave changes slope.
2. **Node-voltage truncation.** The line has accepted-state history but no DEVtrunc, so spice-ts's node-voltage LTE checked its port nodes. ngspice-47 has no node-voltage truncation (`newtrunc` is not compiled in) and limits the step with TRAtrunc only. This LTE shrank the steps geometrically towards the 25 ns corner (24.875, 24.9375, 24.96875, ... ns) and moved the grid off ngspice's.
3. **History interpolation.** spice-ts interpolated the delayed waves linearly between two points. ngspice-47 traload.c uses three-point Lagrange interpolation, with traacct.c pruning and TRAaccept/TRAtrunc slope-change breakpoints (REL = ABS = 1 by default).

Because the grid was offset, spice-ts's delayed history straddled the reflection corners. Its own points were off the exact answer by up to 0.206 V (0.0248 of the 8.33 V peak) at 105 ns. The corpus metric then also interpolated ngspice across the 25 ns corner at spice-ts's 25 ns point: 0.52 V, which is 0.0625.

**Fix.** The T line now ports ngspice-47 tra/: traload.c quadratic interpolation, traacct.c history and breakpoints, and tratrunc.c as `truncateTransientStep` with `truncationCoversCharges`. There is no TD breakpoint.

| Measurement | Before | After |
|---|---|---|
| spice-ts points (ngspice-47: 819) | 929 | 819, the same times |
| corpus-h headline (worst normalised, at spice-ts points) | 0.0625 `v(open_out)` | 5.29e-14 `v(match_out)`, **matched** |
| spice-ts at its points vs ngspice-47 TMAX 25 ps (normalised) | 0.0248 | 1.3e-13 |
| #592 fine column: spice-ts vs fine / ngspice default vs fine | 0.0271 / 0.0563 | 0.0563 / 0.0563 |

The fine column is a loss to report: spice-ts used to be closer to the TMAX-fine reference (0.0271) than ngspice's default run, and now it equals ngspice's default run (0.0563). The parity target is ngspice-47's algorithm, so spice-ts now takes the same discretisation as ngspice, including its error against a finer grid.

**Other T-line decks.**

| Deck | Before | After |
|---|---|---|
| corpus-h `kicad/.../tlines.spice` (#809) | 0.0453, mismatch; fine column spice-ts 0.00234, ngspice 0.0433 | 1.08e-13, **matched**; fine column 0.0433 / 0.0433. spice-ts now writes ngspice's 1126 points, and its error against the analytic delayed pulse is ngspice's 0.00403 (was 1.6e-13 lossless T and 2.9e-3 LTRA). |
| `benchmarks/lossless-tline/mismatched.cir` (receipt.json) | max abs error vs ngspice-47: input 4.55e-3, output 3.35e-3 | input 3.3e-10, output 3.3e-10 |
| `benchmarks/lossless-tline/matched.cir` | 1.9e-15 | 4.1e-14 |
| corpus-g `TRANSLINE/ErrorMessageTest2.cir` | spice-ts-loss (error-message deck) | not affected |

`triage-809.test.ts` now pins the tlines.spice result: ngspice's grid and its 0.00403 analytic error, instead of spice-ts's former exact answer.

## bjt-relay-driver.cir: not a simulator bug (#592 grid artefact)

The worst error is on the turn-on edge at 1.00025 ms. v(collector) falls about 12 V in about 60 ns, so 0.27 V (0.0215 of the 12.76 V peak) is about 1.3 ns of timing. ngspice's default grid brackets the edge more coarsely than spice-ts's.

v(collector) falling crossings after the 1 ms edge, in ns after 1 ms:

| Run | 6 V | 2 V |
|---|---|---|
| ngspice-47 default (identical deck) | 213.04 | 240.01 |
| spice-ts default (identical deck) | 213.25 | 239.13 |
| ngspice-47, TMAX 1 ns (reference) | 213.42 | 239.19 |

On 0.9 to 1.2 ms, against the ngspice TMAX 1 ns reference:

- v(collector): spice-ts 0.0027, ngspice default 0.0029.
- v(base): spice-ts 0.0072, ngspice default 0.0128.

spice-ts is at least as close to the converged answer as ngspice's own default run. The pair only exceeds 1% when the metric interpolates ngspice's coarse points onto spice-ts's edge points. At ngspice's points (spice-ts interpolated) it is 0.0116.

The #592 fine column (TMAX 0.1 us) shows 0.467 for spice-ts and 0.385 for ngspice. That comes from the 6 ms flyback, which neither default run resolves. The two default runs agree there, and so do the two TMAX 0.1 us runs (0.0084 on collector, 0.045 on base). This is a resolution limit shared by both engines.

## astable-led-flasher.cir: not a simulator bug (free-running oscillator phase)

This is a two-transistor astable multivibrator with 22 uF timing capacitors and about 100 ns switching edges. It runs about 9.5 periods in 5 s.

v(collector1) rising through 2.5 V, in s:

| Run | edge 1 | edge 2 | edge 10 | period (edges 3 to 10) |
|---|---|---|---|---|
| ngspice-47 default | 0.096460 | 0.327997 | 4.555484 | 0.5285466 |
| spice-ts default | 0.096461 | 0.328013 | 4.555501 | 0.5285466 |
| ngspice-47 TMAX 10 us (#592 fine) | 0.096460 | 0.327565 | 4.555060 | 0.5285484 |
| spice-ts TMAX 10 us | 0.096462 | 0.327641 | 4.555138 | 0.5285484 |

- The two engines agree on the period to 2e-7 (relative).
- They agree on the first edge to 1 us. From the second edge on, spice-ts is a constant 16 to 17 us later.
- ngspice's own edges move by 430 us between TMAX 100 us and 10 us, which is 25 times the engine difference.
- At ngspice's 100 ns edges, 16 us of phase is a full-swing pointwise error. That is the 1.27 on v(base1)/v(base2), and 0.98 on the collectors.
- Against the TMAX 10 us reference, both default runs score 1.27 (#592 fine column).

An older main (`f5edcffc`) also had a startup difference: the first UIC step failed Newton at 10 us and the latch resolved in nanoseconds, so the first edge came at 9.7 ms instead of 96.5 ms. That is gone on `a2001a93`. In between, #836 (ngspice-47 transient Newton rules for BJT regenerative edges) landed; this triage did not bisect further.

This is the same class as #734 (decks whose pointwise error measures phase, not waveform). Evidence is added there for the owner's metric decision. No per-circuit tolerance is changed. The deck stays a published mismatch until the corpus-wide rule changes.

## Reproduce

```
pnpm build
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-h/parity.ts --corpus-h-fixture-child <fixture-id>   # one fixture, corpus metric + #592 column
pnpm exec tsx --test benchmarks/corpus/corpus-h/triage-791.test.ts benchmarks/corpus/corpus-h/triage-809.test.ts
pnpm -C packages/core exec vitest run src/devices/transmission-line.test.ts
spice-heavy pnpm exec tsx benchmarks/lossless-tline/compare.ts --output benchmarks/lossless-tline/receipt.json
```
