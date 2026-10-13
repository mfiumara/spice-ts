# Current XSPICE residuals after PR #931

Diagnosis only for #943. Refs #553, not Fixes #553. No production code changed.

## Baseline and method

Fresh origin/main pinned at `8e32f51f555a2941a30ccfa9281a75f8ef2dbe30`, after merged
bounded s_xfer PR #931 (`ac898b613d9a61ff1532bb139d0e7747fdb16b27`). This is a
current measurement, not reuse of the historical #553 model-count table.

The five BSD-3-Clause originals remain in the shared corpus, untouched. The runner
checks their manifest SHA-256 against an independent git export from ngspice
`3ef069fb1f04177a153f342a32d941fc20ff047e`, then before ngspice, at the native
byte read, and after execution. All five have an empty include/library closure.
The native API receives the UTF-8 decoding of exactly those bytes, including the
original CRLF x_fer deck. No model, analysis, tolerance, parameter, or fixture
adaptation occurs. Native uses the default spice-ts backend and source tree.

`receipt.json` records OS, node/pnpm/ngspice versions, the resolved ngspice-47
binary path and SHA-256, commands, exits, elapsed process wall times, warnings,
measurement outputs, input hashes, upstream source hashes, and every loss.
The executable is Homebrew ngspice 47. The source/deck revision and the installed
binary hash are separate pins; this does not assert that Homebrew built that git
revision. Both engines use their normal defaults, including ngspice's automatic
XSPICE trtol reduction. `-n` disables personal ngspice startup files.

## Fresh original results

| Original | ngspice batch | Native execution | First blocker | Error metrics |
|---|---|---|---|---|
| analog_models2_ac.deck | success, exit 0 | unsupported | core, line 36 | null |
| analog_models2_dc.deck | success, exit 0 | unsupported | core, line 34 | null |
| analog_models2_swept_dc.deck | success, exit 0 | unsupported | core, line 34 | null |
| analog_models2_transient.deck | success, exit 0 | unsupported | core, line 37 | null |
| various/x_fer.cir | success, exit 0 | success | no execution blocker | AC and partially matched transient below |

Counts are 5 reference successes; native 1 success, 4 unsupported, 0 other
failures, 0 timeouts, 0 not-run. A native unsupported exception is returned as
structured JSON by the worker even though the worker process exits 0. A successful
worker process is not a successful simulation. No fixture was fixed by this PR.
Before/after simulator code is identical, so there is no claimed execution-count
improvement or speedup. Parse-failure runtime is not comparable to simulation time.

### x_fer is not full parity

Unlike PR #931's null control comparison, this receipt exports both original
control plots. A batch-mode readout driver sources the unchanged file and runs
only `setplot`/`write` afterward. The original `ac`, `let`, `plot`, `cph`, vector
indexing, five `meas` commands (including two repeated fil1max measurements), and
`tran` execute. Native returns both control runs and five successful measurements.
ngspice ignores graphical `plot` commands in batch mode. No GUI is opened.
Measurements are retained, but ngspice's rounded console values are not promoted
to high-precision measurement parity claims. Full derived-vector/plot rendering
semantics are outside the waveform comparison.

The first pipe-mode readout (`ngspice -n -p`) failed before loading a circuit with
`Can't open display`. No app was foregrounded. It is retained in `first-attempt.json`
and the ledger. The successful correction uses `ngspice -n -b` with a stdin
control-only readout driver. This is an export-driver change, not a circuit change.
Original direct batch runs and export-source reruns are distinguished in receipts.

Only matching coordinates are compared. Relative coordinate tolerance is 1e-10;
transient absolute coordinate tolerance is 1e-15 seconds. No interpolation or
per-circuit tuning. Relative error divides by max(abs(reference), 1e-12).

AC matches all 351/351 reference frequency points and all 351 native points.
Transient matches only 27/15,119 reference points out of 15,440 native points.
These 27 matches are not a representative/full-waveform parity claim. The
unmatched 15,092 reference points have no claimed error bound. Both complete
sample artifacts are retained for independent reanalysis.

| Analysis / vector | max absolute | RMS absolute | max relative | RMS relative |
|---|---:|---:|---:|---:|
| AC node1 | 9.09495e-16 | 1.55720e-16 | 9.09495e-16 | 1.55720e-16 |
| AC node2 | 6.20634e-16 | 1.81359e-16 | 1.03451e-15 | 3.20067e-16 |
| AC node3 | 6.62801e-16 | 1.46364e-16 | 6.29047e-14 | 7.73387e-15 |
| AC node4 | 1.40433e-15 | 1.02150e-16 | 9.05438e-15 | 1.09353e-15 |
| AC node5 | 3.72380e-16 | 1.13153e-16 | 3.58278e-11 | 3.79611e-12 |
| TRAN node1 | 2.47850e-11 | 4.90882e-12 | 4.92213e-11 | 1.00170e-11 |
| TRAN node2 | 5.68787e-5 | 2.50541e-5 | 0.157951 | 0.0303976 |
| TRAN node3 | 1.74933e-4 | 4.94100e-5 | 0.158382 | 0.0449609 |
| TRAN node4 | 5.78536e-8 | 2.09331e-8 | 2.21913e-6 | 8.35533e-7 |
| TRAN node5 | 4.45019e-4 | 1.44230e-4 | 0.0566922 | 0.0129043 |

Full precision values and independent offline recomputation are in the receipt
and `test_evidence.py`. The s_xfer outputs retain significant early transient
relative losses. No superiority or all-XSPICE-support claim follows from these data.

## Dependency closure and source trace

The four analog_models2 decks contain int, d_dt, second-order strictly proper
s_xfer, core(mode=1), and lcouple(num_turns=10). They request respectively AC,
OP, DC sweep, and transient; none contains a control block or include. Their
s_xfer coefficient/IC families lie inside the implemented order-1/2 contract.
Original magnetic branches must not be replaced with ordinary inductors: the
shunt resistors and the extra v40 zero-volt probe on the AC/swept-DC decks are
part of the unchanged circuit.

The parser rejects core first at
`packages/core/src/parser/xspice-parser.ts:156-163`. Registering core alone only
exposes the later lcouple rejection. `spec.ts:358-366` lacks both models, while
`spec.ts:388` recognizes their names as known ngspice models. No solver or
analysis has yet run on those four decks. Any later convergence or waveform
failure is unmeasured, not presumed solved.

Pinned upstream sources are included unmodified in `source/`:

- core/ifspec.ifs:29-39 specifies one g/gd inout port (default gd).
  core/cfunc.mod:251-364 defines mode 1 as H=mmf/length, flux=area*B(H),
  Jacobian=area/length*dB/dH. It extrapolates the end segments and applies
  cm_smooth_corner around internal breakpoints, using the smaller neighboring
  H interval when fraction is true. AC is the real operating-point slope.
  Mode 2 (:366-503) is separate accepted-state hysteresis, not required by any
  of these four originals. The presence of hyst parameters does not activate it.
- lcouple/ifspec.ifs:29-39 specifies TWO inout hybrid ports, l h/hd (default hd)
  and mmf_out hd only. It is not a voltage-input/current-output gain block.
  lcouple/cfunc.mod:180-230 drives mmf=N*electrical-current and senses flux as
  negative magnetic-branch current. At time zero winding voltage is zero;
  otherwise it uses N*(flux-flux_old)/(TIME-T(1)), with the negative current
  cross-partial -N/delta. AC publishes cross gains j*omega*N and N.
  The fake integration/truncation call is commented out (:217-219).
- s_xfer's upstream order/coefficient/state and AC semantics are already
  implemented in the bounded family. x_fer uses two order-2 lowpasses and an
  order-2 bandpass; adding higher order or core mode 2 cannot unlock it.

`connections.ts:25-26,58-78` lacks h/hd. `compile.ts:125-145` reads g/gd as
voltage inputs and stamps current outputs, already suitable for core's gd
constitutive relation. It allocates ordinary zero-volt sensing branches for
current inputs and ideal voltage branches for voltage outputs, but lacks
lcouple's current-sensing AND voltage-driving shared hybrid branches.
`xspice-device.ts:6-25,87-90` describes the existing separate port/branch layout.
Blindly treating hd as gd would read the wrong physical variable and silently
corrupt results. This is a device/port-layer gap, not evidence for a digital event
kernel redesign, general solver rewrite, or global analysis workaround.

No new minimal witness deck is added. Original mode-1 parameters and the pinned
port/function sources establish the required mechanisms without adapting an
original or counting a reduction as an original success.

## Ranked general slices and minimal reservation proposal

Observed unlock count for every unimplemented proposal is ZERO. The counts below
are original reference-success decks whose dependency closure the stated slice
can cover, not measured implementation/parity promises. Review and same-byte
reruns must establish actual execution/parity counts after implementation.

1. General core mode-1 PWL geometry/smoothing plus lcouple h/hd ports, cross
   stamping and accepted-flux difference in OP/DC/AC/TRAN covers all FOUR
   blocked originals. Exclude core mode 2 with a typed unsupported-mode guard.
   Implement general arrays/geometry/turns and both supported port types, not
   a linear H=B special case or a deck-specific equivalent inductor.
2. A smaller first delivery of that pair restricted to OP/DC/AC covers THREE
   originals (OP, swept DC, AC); transient remains explicitly unsupported.
   This is the recommended initial bounded device slice. Extending its accepted
   flux history/time-zero behavior to transient then covers ONE additional
   original. Existing int/d_dt/s_xfer may still have later parity losses.
3. core alone, lcouple alone, or core mode 2 alone each covers ZERO complete
   original dependency closures. Higher-order s_xfer also covers ZERO here.
   x_fer already executes, so improving its transient waveform unlocks ZERO
   execution failures, though it could address the ONE already-executing
   original's measured waveform losses.

For the recommended three-deck slice reserve only:

- `packages/core/src/devices/xspice/spec.ts` for core/lcouple interfaces.
- `packages/core/src/devices/xspice/connections.ts` for h/hd node parsing.
- `packages/core/src/devices/xspice/compile.ts` for hybrid branch allocation and
  magnetic-device dispatch plus typed unsupported transient/mode-2 guards.
- New `packages/core/src/devices/xspice/magnetic.ts` and `magnetic.test.ts` for
  core mode-1 behavior and a dedicated hybrid device. Prefer an XspiceDevice
  subclass or narrow compile return-type adjustment over changing the generic
  XspiceDevice stamp path. Tests must determine the precise current sign mapping
  against ngspice; the AC gain signs above are source facts, not a guessed stamp.
- A separately reserved benchmark directory for same-byte before/after evidence.

Do not reserve circuit.ts, parser dispatch, solver, analysis, control interpreter,
event network, shared harness/corpora, aggregate, CI, package or changeset files.
These shared XSPICE files need an explicit supervisor reservation before the next
worker starts; this PR only reads them. No follow-up implementation is attempted.

## Reproduce and audit

Install with `pnpm install --frozen-lockfile`. Prepare the pinned read-only source
object inside this directory (the git fetch is not a simulation child):

```
git init benchmarks/xspice-residual-after-931/.run/upstream
git -C benchmarks/xspice-residual-after-931/.run/upstream fetch --depth=1 https://git.code.sf.net/p/ngspice/ngspice 3ef069fb1f04177a153f342a32d941fc20ff047e
spice-heavy python3 benchmarks/xspice-residual-after-931/run.py
python3 benchmarks/xspice-residual-after-931/test_evidence.py -v
pnpm -C packages/core exec vitest run src/devices/xspice
pnpm build && pnpm lint && spice-heavy pnpm test
```

The runner requires the baseline packages/core git tree and dependency-lock blob
unchanged. It serializes owned child process groups, limits each communicate to
15 seconds, charges actual process wall time including failed attempts to a
persistent .run/ledger.json, and stops admitting work at 300 seconds. It never
kills another lane. Complete measurement attempts took 7.712823753 cumulative
child seconds across 28 children, including the rejected readout. Raw plots and
native samples are gzip artifacts. `budget-ledger.json.gz` preserves both attempts.
Offline checks never invoke ngspice; they verify all hashes, complete five-deck
counts, every bucket/null, raw parsing, full numerical recomparison, partial
matching, persistent accounting, and owned timeout/exhaustion behavior.

Local check logs and exact-head required CI are supplied with the PR handoff.
Independent spice-ts-review must accept that same head. Supervisor alone merges.
