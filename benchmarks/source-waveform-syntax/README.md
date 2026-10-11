# Independent-source waveform syntax (#492)

Identical-netlist spice-ts vs ngspice-47 comparison for the parenthesised and
extended independent-source waveform forms found in the corpus-f batch-1 decks
(#484):

- a whole parenthesised spec after the DC value: `0.0v (PWL ...)`, `(PULSE ...)`, `(AC 1v)`;
- PWL with parenthesised time/value pairs: `PWL( (0 0.0) (1 1.0) )`, `PWL (0ns 5v) (1ns 0v) ...`;
- the eighth PULSE field, ngspice-47's NP (number of pulses).

ngspice-47 reads every `(`/`)` on a source card as a separator (`INPgetUTok`),
so spice-ts now drops them before reading the value list. NP follows
`vsrcload.c`/`vsrcacct.c` in ngspice's default compatibility mode (not
`ngbehavior=xs`, where the same field is a phase).

Run:

    pnpm exec tsx benchmarks/source-waveform-syntax/compare.ts

It writes `report.json`. Every source card is copied verbatim from the cited
corpus-f fixture (ngspice tree `3ef069fb`, BSD-3-Clause); only a linear RC
load and the analysis line are added so both engines can run it without
CIDER/XSPICE devices. Both engines read the same netlist text; ngspice also gets
a `.control` block that only runs the deck and writes the probed vectors.

## Metrics

- `sourceWaveformAtNgspiceTimes`: the compiled spice-ts source evaluated exactly
  at ngspice's output times against ngspice's source node. This isolates the
  waveform semantics.
- `signals`: spice-ts output linearly interpolated onto ngspice's output points.
  This includes interpolation error and differences in timestep control.
- `identicalToUnparenthesised`: spice-ts gives bit-identical output for the same
  deck with every parenthesis replaced by a space.

## Result (ngspice-47, Apple M5 Pro, macOS 27, Node 22.23.1)

Before this change, spice-ts rejected 13 of the 14 cases with a parse error.
The exception is the `arbitrary-phase-sin-tran` control, whose SIN syntax was
already supported. After it, all 14 run. Every source waveform matches ngspice
to <= 4.2e-13 V at ngspice's own timepoints. The operating-point and AC cases
match to <= 5.7e-14.

The RC-load nodes show differences of 3.0e-5 to 1.2e-2 relative to the peak.
These are losses, and they are reported as such. Because the parenthesised and
unparenthesised decks give bit-identical spice-ts output, these differences do
not come from the new grammar. They come from the existing transient engine:
spice-ts and ngspice pick different timesteps and output points, and the metric
interpolates between them. For example, on `arbitrary-phase-sin-tran` the
probed node is the ideal source itself. The source matches to 5.3e-15 at
ngspice's timepoints, yet the interpolated signal still shows 1.6e-3. That gap
is interpolation alone.

The largest is `pindiode-paren-pwl-tran` v(2), at 0.37 V absolute (7.4e-3 of
the 50 V peak). That deck uses TSTEP = 1 ns against a -50 V/ns ramp into a
1 ns RC. ngspice takes 0.36 ns steps after the breakpoint, while spice-ts
takes about 15 ps steps.

### NP differences from ngspice

NP is applied only when PER is positive and finite. With PER <= 0, ngspice
substitutes TSTOP for PER, so a fractional NP below 1 would truncate the single
pulse there. spice-ts treats that PULSE as an untruncated single pulse.

PULSE cards with more than eight fields are still rejected with a structured
`ParseError` (`Unsupported PULSE source parameters`). ngspice-47 silently
ignores the extra fields.
