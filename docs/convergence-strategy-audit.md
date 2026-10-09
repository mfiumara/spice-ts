# Convergence strategy audit (#56)

This is an audit-and-fixture slice only. It adds no solver or convergence
implementation changes. The three checked-in fixtures use one global settings
profile; there is no circuit-specific tolerance override.

## Reproduction contract

- Command: `pnpm bench:convergence`
- Reference: native `ngspice-47` (`ngspice --version`)
- Native invocation: `ngspice -b <generated-deck>`
- Machine recorded by the checked-in result: Apple M5 Pro, arm64 macOS,
  Node.js v22.23.1
- Netlists: the exact checked-in `.cir` text is given to both engines.
- Settings: `reltol=1e-3 abstol=1e-12 vntol=1e-6 gmin=0 itl1=100`;
  transient also uses `itl4=50 method=trap trtol=7`.
- The runner passes the same values through spice-ts's options API because
  spice-ts currently ignores `.options`. For ngspice it leaves the `.options`
  card in the deck. The only ngspice-only text is a generated `.control` block
  containing `run`, result export, `rusage all`, and `quit`.
- Runtime is median-of-five end-to-end calls for in-process spice-ts. ngspice
  analysis time is `rusage all`; process time is also retained so the native
  launch overhead is not hidden.
- Waveforms are compared at spice-ts timestamps by linear interpolation of the
  ngspice waveform. Relative error uses `max(abs(reference), 1e-6 V)` as its
  denominator. Both the maximum and RMS of those pointwise relative errors are
  reported.

Sources and redistribution terms are in `benchmarks/SOURCES.md`. Full raw
series, settings, versions, counters, failures, and metrics are in
`benchmarks/convergence-results.json`.

## Current strategy versus ngspice

### DC operating point

spice-ts first performs a fixed 13-point source ramp for every nonlinear
circuit (`0.01, 0.02, 0.05, ... 1.0`). A failed ramp point is silently restored
and skipped. It then attempts full-source Newton-Raphson. Only if that final
solve fails does it try a fixed gmin schedule from `1e-2` down through `1e-11`,
then solve once at the user gmin. See `packages/core/src/analysis/dc.ts`.

ngspice's operating-point fallback is adaptive rather than a fixed one-pass
schedule: successful gmin/source steps save the node solution and enlarge the
next step, while failed steps restore the prior solution and reduce the step.
Its documented fallback order includes direct solve, gmin variants, source
stepping, and finally transient operating-point search. References:

- ngspice-47 manual, simulator variables and operating-point analysis:
  https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml
- ngspice operating-point analysis overview at the ngspice-47 mirror:
  https://github.com/danchitnis/ngspice-sf-mirror/blob/pre-master-47/ANALYSES
- ngspice `CKTop` implementation:
  https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/src/spicelib/analysis/cktop.c

The material gap is observability as well as policy. spice-ts does not reveal
which source/gmin points were attempted, failed, or accepted. The audit records
`not-exposed` rather than inferring retries from runtime or output points. This
is tracked by #64.

### Transient stepping

spice-ts computes a DC point, lands on queued source breakpoints, discards
second-order history after a breakpoint, cuts the next step by 10, and uses a
Backward-Euler settling step. Newton failure restores the last accepted state,
divides `dt` by 8, and retries until the 1 fs floor. LTE failure uses a bounded
adaptive factor; after ten consecutive LTE rejections the current implementation
bypasses further LTE rejection. Accepted state is committed only after NR and
LTE acceptance. See `packages/core/src/analysis/transient-driver.ts`.

ngspice `dctran.c` likewise handles breakpoints, drops integration order after a
breakpoint, limits the next step to 0.1 of the relevant interval, divides the
step by 8 after non-convergence, and counts rejected timepoints. It also exposes
iteration/rejection statistics through `rusage all`:

- https://github.com/ngspice/ngspice/blob/032b1c32/src/spicelib/analysis/dctran.c
- ngspice-47 manual transient analysis/options:
  https://ngspice.sourceforge.io/docs/ngspice-html-manual/manual.xhtml

spice-ts exposes accepted samples but not NR retries, LTE rejections, iteration
counts, or minimum attempted `dt`; #64 tracks that missing telemetry.

## Fixture results

All figures below are the committed result from `pnpm bench:convergence`.
Losses are intentionally visible.

| Fixture / target mechanism | Convergence | spice-ts runtime | ngspice analysis / process | Accepted points (spice-ts / ngspice) | Retries | Max / RMS relative error |
|---|---|---:|---:|---:|---|---:|
| `gmin-reverse-diode` / gmin stepping | both converged | 0.704 ms | 0.694 / 21.778 ms | 1 / 1 | spice-ts not exposed; ngspice 0 rejected | 0.445% / 0.445% |
| `source-step-bjt` / source stepping | both converged | 0.737 ms | 6.507 / 45.639 ms | 1 / 1 | spice-ts not exposed; ngspice 0 rejected | 0.923% / 0.923% |
| `timestep-diode-rectifier` / timestep rejection | both converged | 6.414 ms | 3.032 / 26.023 ms | 214 / 245 | spice-ts not exposed; ngspice 3 rejected | 290.147% / 26.628% |

ngspice reports 3, 6, and 567 total iterations respectively. spice-ts iteration
counts are not exposed. For the transient fixture, final `v(out)` is 8.55213 V
in spice-ts versus 8.77829 V in ngspice. The much larger edge-local maximum and
26.628% RMS error are a correctness loss, not a convergence win; #65 tracks the
general root cause.

## Before / after

This PR intentionally does not alter simulator code, so the numerical before
and after are identical by construction: all three fixtures converge before and
after; max/RMS errors remain 0.445/0.445%, 0.923/0.923%, and
290.147/26.628%. The runtime values above characterize the unchanged core and
are not claimed as a speed improvement. The only behavioral addition is a
reproducible audit runner and hard fixtures.

## Findings and follow-ups

1. DC fallback policy is fixed and partially silent, unlike ngspice's adaptive
   save/restore stepping. The fixtures are permanent stress cases, but activation
   and retry counts cannot be proven from the public result today: #64.
2. The diode commutation transient converges but is materially inaccurate at
   matched timestamps: #65.
3. Existing boost-converter convergence remains owned by #43 and was not copied,
   changed, or retuned in this slice.
4. No claim of superiority is supported here. Native ngspice has lower analysis
   time on two of three tiny fixtures and better transient agreement by
   definition as the reference; process startup makes its end-to-end invocation
   slower, but those are different runtime boundaries and are reported separately.

Follow-up issues:

- https://github.com/mfiumara/spice-ts/issues/64
- https://github.com/mfiumara/spice-ts/issues/65
