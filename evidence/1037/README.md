# #1037: reject a BJT-local stamp-aggregation candidate

Refs #1037. Evidence-only fallback, not a simulator fix. The issue stays open.
No production BJT, timestep, parser, MOS2, tolerance, fixture or corpus-expectation
change is shipped. The existing rest regression remains an explicit expected
failure. This bounded experiment does not prove that no BJT-only fix can exist.
It establishes that this candidate is not one.

## Semantics checked

The existing `BJT.convergenceTest` uses the collector/base predicted-current
formula from ngspice-47 `bjtconv.c`, including integrated B-E/B-C charge
conductances and currents stored by `bjtload.c`. The terminal diagnosis in
PR #1040 is a current-prediction rejection, not proof of a missing equation.

The native bypass gate also checks those predicted currents. It cannot accept
a one-ulp junction change when that change already exceeds the current tolerance.
A voltage-only bypass, omitting transient conductance from current convergence,
or tolerance padding would not preserve these semantics.

Verified upstream source, not the older GitHub mirror's master branch:

- https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/bjt/bjtconv.c#L48-L74
  SHA256 `18d334a7270319d7e95cbbc61846199a435ecc6d9d9c8a0352a73213c9eea5e0`.
- https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/bjt/bjtload.c#L355-L376
  SHA256 `44d89ff001169377123443fc3b1ddb4dc76b27d8d43ad4c348494df1ccace0db`.

The experiment aggregates each BJT's DC and integrated-charge matrix/RHS
contributions per entry before adding them to the global system. It changes
assembly rounding, not the equations, charge histories or convergence checks.
It intercepts transient Newton loads only. Accepted-history static restamps
remain untouched. The candidate is a runner-only wrapper, never installed in
production. It is not a full port of ngspice's combined load or bypass machinery.

## Same-byte executions

`receipt.json` records hashes, engine commands, timings, convergence counters and
max/RMS absolute/relative errors. Both engines receive the exact bytes recorded
there. Vendor attachments are fetched and hash-checked, never redistributed.
The existing manifest's include-path-only reconstruction is hash-gated before
any execution. No shortened TSTOP, LTPS mode, source edit or tolerance change.
Native command is `ngspice -n -b -r <raw> <deck>`, with
`SPICE_ASCIIRAWFILE=1`, a 120 s subprocess bound, and cwd at the deck directory.
`-n` avoids reading user/system startup configuration.

| deck | baseline spice-ts | candidate spice-ts | native ngspice-47 |
| --- | --- | --- | --- |
| Originalnetlist | dt-floor at 6.075652244586859e-11 s, 26 points | dt-floor at 1.1041506930422074e-10 s, 53 points | 120 s timeout |
| InductorSplit | dt-floor at 2.3555640717097648e-12 s, 9 points | dt-floor at 2.3555640717097627e-12 s, 9 points | 120 s timeout |
| self-written rest | dt-floor at 9.999999999999999e-16 s, 1 point | same failure and time, 1 point | success, 108 points, TSTOP 1e-11 s |
| existing ngspice Schmitt | success, 135 points | success, 138 points | success, 135 points |
| existing corpus-H BJT relay | success, 11364 points | success, 11365 points | success, 11363 points |

The native vendor decks still do not complete within the existing 120 s bound.
There is no complete ticket-764 oracle and no waveform-parity claim. Advancing
farther before failure on Originalnetlist is not a correctness improvement.
No transient metrics are calculated from interrupted rawfiles.

Control errors use the existing `alignAndMeasure` implementation, linear native
interpolation on each spice-ts grid, without extra breakpoint reconstruction.
This is sampled waveform evidence, not an exact-grid parity assertion. Schmitt
excludes the last sample just beyond native TSTOP by floating-point rounding.
Relative errors near zero references can be large; absolute errors are published
alongside them. All selected signals, not only the following examples, are in
the receipt.

| control / signal | baseline max / RMS absolute error (V) | candidate max / RMS absolute error (V) | baseline max / RMS relative error | candidate max / RMS relative error |
| --- | --- | --- | --- | --- |
| Schmitt v(6) | 0.0052592994 / 0.00051814777 | 0.27902338 / 0.034767782 | 0.21583269 / 0.019007578 | 0.54861313 / 0.067413944 |
| relay v(collector) | 0.27416213 / 0.0029375014 | 0.12204999 / 0.0020808054 | 0.73930727 / 0.0082886113 | 0.78564337 / 0.0082890845 |

The candidate leaves all three targeted losses unresolved and changes control
waveforms, worsening the Schmitt error. Reject it. These single-run elapsed times
are diagnostic receipts, not statistically valid speed claims.

## RED and verification

RED commit `7a19e053` removes `.fails` from the existing rest assertion.
`pnpm -C packages/core exec vitest run src/analysis/transient-bjt-rest-1037.test.ts`
exits 1 with `TimestepTooSmallError` at t=9.999999999999999e-16 s and
dt=1.2499999999999999e-16 s. Final code restores `.fails` honestly. There is no
RED-to-GREEN simulator fix.

Commands from repository root:

    pnpm install --frozen-lockfile
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 764
    spice-heavy pnpm exec tsx evidence/1037/run.ts
    pnpm exec tsx --test evidence/1037/receipt.test.ts
    pnpm build
    pnpm lint
    pnpm -C packages/core exec tsc --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --skipLibCheck ../../evidence/1037/run.ts ../../evidence/1037/receipt.test.ts
    pnpm -C packages/core exec vitest run src/analysis/transient-bjt-rest-1037.test.ts src/analysis/transient-ecl-schmitt-818.test.ts src/analysis/transient-nr-retry-804.test.ts src/devices/bjt.test.ts
    spice-heavy pnpm test

Install, runner, offline receipt test, build, lint, strict evidence typing and
focused tests pass. Focused tests report 40 passed and 1 expected failure in four
files. The local guarded root suite reports 4204 passed, 1 expected failure,
4 skipped, and one unrelated 5000 ms timeout in the BSIM3v3 inverter test in
`nonlinear-charge-history.test.ts`. It stops before completing the remaining
workspace/benchmark tests. Required exact-head CI is the authoritative full gate;
no tolerance or timeout edits are made to hide this result.

Sources/licences for both controls already live in `benchmarks/SOURCES.md`.
The reduction is self-written in the existing core test. This directory commits
no vendor deck, library, source-bearing diagnostic, native rawfile or raw log.
`local/` is ignored. Rerunning overwrites the local receipt with fresh timings.
The offline test validates pins, failure classification and the explicit rejection;
it does not substitute for rerunning the numerical experiment.

## Remaining scope

A well-balanced/reference-centered companion or Newton formulation is a possible
next investigation, not a demonstrated fix. It would require validating accurate
charge differences and matrix/RHS conditioning while retaining full current
convergence. The current absolute-coordinate StampContext does not expose an
increment solve. That work crosses this card's BJT-only boundary. Report it to
the supervisor rather than modifying the parallel timestep/solver lane here.
