# adder_mos (BSIM3 4-bit NAND adder) re-measured after #648/#689 (#604)

Measurement and regression guard only; no simulator change. The diagnosis that
#604 was split from is in [`../adder-timeout-611/README.md`](../adder-timeout-611/README.md).

## Outcome

- **Timeout: fixed on main.** The `.control`-stripped deck (the one PR #618 measured)
  now runs 0-6.4 µs to completion with the same number of timesteps as ngspice-47.
  PR #618 measured 85,926 accepted steps by 3.0 µs and a 120 s timeout. The step count
  came down with #648 (`e8916f92`, BSIM3 sized by charge truncation alone, like
  ngspice-47 CKTtrunc), which #689 then generalised.
- **Logic-level mismatch: gone.** PR #618 saw outputs at the opposite logic level
  for 24 / 17 / 10 / 5 / 1 % of samples. On main it is 0 % on every output, and each
  1.5 V crossing is within 36 ps of ngspice-47.
- **The corpus-f row is still not a match. It is a published loss.** The byte-identical
  fixture fails fast with the typed `UnsupportedControlCommandError` for
  `pre_set strict_errorhandling` in its `.control` block. That is the control-language
  gap (#488), not BSIM3. The circuit body is at 7.5 % worst normalised error against the
  1 % threshold. That is inside ngspice-47's own step-grid spread on this deck: see below.
- **Speed is the remaining gap.** spice-ts needs 76 s against 5.3 s for ngspice-47 with
  the same step count. Per Newton iteration that is 1.06 ms against 0.078 ms. This is
  M2 (speed) work, not step control.

## Numbers (`results.json`)

Main `b04bc1ee`, Apple M5 Pro, macOS 27.0.1, Node v22.23.1, ngspice-47 (Homebrew),
1-minute load 10-14. The deck is `run.sh`'s `adder_mos_body.cir`: the corpus-f bytes
with `.control` removed and `.save V(9) V(10) V(11) V(12) V(13)` added. Both engines
read the same file (sha256 `ef804f3a…ba5738`).

| full deck, 0-6.4 µs | wall | accepted | rejected | Newton iterations |
|---|---:|---:|---:|---:|
| spice-ts at PR #618 (main 7c66aab9 + #600/#605), 120 s bound | timeout at 3.0 µs | 85,926 | 20,909 | 318,153 |
| spice-ts main `b04bc1ee` | 76.0 s | 18,106 | 2,289 | 71,597 |
| ngspice-47 | 5.25 s | 18,073 | 2,429 | 67,718 |

Waveform error, corpus-f metric (`../adder-timeout-611/compare.ts`: max |error| on the
candidate grid divided by the ngspice peak, 1 % threshold), together with 1.5 V
crossing shifts (`crossings.mts`). The two ngspice-47 rows re-run the identical deck
with only `.option trtol` moved by ±1 %. They show how far this deck moves when nothing
but the step grid changes:

| candidate vs ngspice-47 default | points | worst normalised error, v(9)..v(13) | opposite level | max crossing shift (ps) | mean shift (ps) |
|---|---:|---|---|---|---|
| spice-ts main | 18,107 | 0.075 / 0.054 / 0.049 / 0.073 / 0.037 | 0 % | 35 / 17 / 23 / 36 / 29 | +0.6 / -2.0 / +2.6 / +6.2 / +4.9 |
| ngspice-47 trtol=7.07 | 18,065 | 0.028 / 0.056 / 0.056 / 0.056 / 0.046 | 0 % | 14 / 13 / 24 / 28 / 25 | +1.2 / -0.2 / -2.9 / -0.9 / -0.2 |
| ngspice-47 trtol=6.93 | 18,257 | 0.052 / 0.089 / 0.054 / 0.089 / 0.061 | 0 % | 38 / 66 / 27 / 65 / 44 | -1.7 / -7.8 / -8.4 / -3.3 / +4.6 |

spice-ts falls between the two ngspice-47 self-comparisons. The edges sit 5 ns apart, so
a crossing shift of tens of ps already gives a 4-9 % sample error at the edge. On this
deck the 1 % threshold is below ngspice-47's own step-grid sensitivity, the same finding
as adder_bip (#611). The metric and threshold stay unchanged, and the row is not tuned.

## Regression guard

`packages/core/src/devices/bsim3v3-adder-mos-604.test.ts` runs the fixture bytes with
`.control` removed and the stop time cut to 400 ns. It pins three things against
ngspice-47 on the identical deck:

- Accepted timepoints: ngspice-47 has 1,142. The bound is -20 % / +25 %.
- Newton iterations: ngspice-47 has 4,289. The bound is below 1.5x.
- Five 1.5 V crossings from `.meas tran`, within 0.1 ns.

| tree | accepted | iterations | crossings v9 first, v10 first, v13 first, v9 last, v10 last (ns) | test |
|---|---:|---:|---|---|
| ngspice-47 | 1,142 | 4,289 | 32.500 / 7.977 / 6.459 / 381.392 / 331.676 | |
| `e8916f92~1` (before #648) | 10,476 | 32,337 | | fails (step count) |
| `e8916f92` (#648, before the #626 charge port) | 1,190 | 4,969 | 32.615 / 8.076 / 6.522 / 381.546 / 331.692 | passes at 0.2 ns, fails at 0.1 ns |
| main `b04bc1ee` | 1,141 | 4,522 | 32.496 / 7.977 / 6.459 / 381.392 / 331.659 | passes (~9 s) |

## Reproduce

    pnpm build
    D=<scratch>; F=benchmarks/corpus/corpus-f/fixtures/examples/digital/compare/adder_mos.cir
    awk '/^\.control/{s=1} !s{ if (toupper($0) ~ /^\.END$/) print ".save V(9) V(10) V(11) V(12) V(13)"; print } /^\.endc/{s=0}' $F > $D/body.cir
    (cd $D && ngspice -b -r ref.raw body.cir)          # needs `set filetype=ascii` in ~/.spiceinit
    for t in 7.07 6.93; do sed "s/^.option noinit acct/& trtol=$t/" $D/body.cir > $D/tr$t.cir
      (cd $D && ngspice -b -r tr$t.raw tr$t.cir); done
    spice-heavy pnpm exec tsx benchmarks/adder-timeout-611/measure.mts $D/body.cir --budget-ms 600000 \
      --out $D/st.json --record $D/st.wave.json --nodes 9,10,11,12,13
    for c in st.wave.json tr7.07.raw tr6.93.raw; do
      pnpm exec tsx benchmarks/adder-timeout-611/compare.ts $D/$c $D/ref.raw
      pnpm exec tsx benchmarks/adder-timeout-611/crossings.mts $D/$c $D/ref.raw; done
