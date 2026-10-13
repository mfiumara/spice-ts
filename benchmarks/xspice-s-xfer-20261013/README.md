# Bounded XSPICE s_xfer, issue #553

This implements strictly proper order-1/2 analog transfer functions only. It does
not close #553. There is no corpus-wide parity or performance claim.

## Contract

- `.op`, `.dc`, `.ac`, `.tran`; `%v`, `%vd`, `%i`, `%id` inputs/outputs.
- Required `num_coeff`, `den_coeff` vectors in descending powers. Numerator degree
  must be less than denominator degree; denominator order must be 1 or 2.
- `in_offset=0`, `gain=1`, `denormalized_freq=1` in radians/second. Coefficients are
  divided by the appropriate power of this frequency and the denominator is made
  monic, with the gain divided by its original leading normalized coefficient.
- Omitted `int_ic` means zero in every stage. A given vector must have exactly
  denominator-order entries; ngspice reverses the array into ascending state order.
- DC returns the IC-weighted numerator output, NOT the equilibrium Laplace gain.
  Transient uses accepted-state denominator feedback, then cascaded integration.
  TRAP follows ngspice cm_static_integrate's backward-Euler-like update even at
  order 2; Gear uses variable-step BDF2. Rejected trials do not commit state.
- The unusual ngspice PARTIAL(out,in) = second integrator value is preserved.
  AC uses a separate canonical state realization in hidden MNA branches, avoiding
  that transient/DC partial in small-signal results. No solver/analysis edits.
- Explicit InvalidCircuitError for unsupported order, improper/equal-degree
  numerator, zero leading denominator, nonpositive frequency, mismatched ICs,
  nonfinite normalized values, and analyses outside the subset (including noise,
  tf, pz, sens). Normal MIF unknown-parameter warnings remain ngspice-compatible.
  No claim for unstable filters, higher orders, improper filters or UIC parity.

## Fresh identical-byte measurements

Baseline is main after #925, `541cb5f34dd1dd89074df9f9f737e4eb6aff110c`.
All eight reductions and all five unchanged originals are rejected at s_xfer on
that baseline. ngspice-47 freshly exits 0 on all thirteen, with no compatibility
mode and ASCII raw output. Native after succeeds on the eight reductions.

| Reduction | Compared points | Max absolute | RMS absolute | Max relative | RMS relative |
|---|---:|---:|---:|---:|---:|
| op-ic | 1 | 0 | 0 | 0 | 0 |
| dc-zero | 5 | 0 | 0 | 0 | 0 |
| ac-lowpass | 21 | 3.7238e-16 | 1.81129e-16 | 9.80979e-16 | 3.59854e-16 |
| ac-bandpass | 31 | 2.83052e-16 | 9.86079e-17 | 1.09436e-14 | 3.1683e-15 |
| tran-first | 108 | 3.34073e-5 | 2.15411e-5 | 0.000869282 | 0.000197042 |
| tran-second | 215 | 0.000278035 | 0.000244056 | 0.159133 | 0.0241004 |
| tran-gear | 215 | 0.000259653 | 0.000190805 | 0.123878 | 0.0150043 |
| tran-ic | 208 | 0.000199033 | 0.000177463 | 0.0218325 | 0.00638235 |

AC/DC coordinates match, allowing only numerical coordinate rounding. Transient
compares linear interpolation of native samples at EVERY reference time. Relative
error uses the same 1e-12 denominator floor for every reduction. Different adaptive
grids produce visible early-point relative losses: second-order TRAP 15.91%, Gear
12.39%, IC 2.18%. These are not full transient parity successes. No per-circuit
solver tuning or tolerance adjustment is applied, and no points are discarded.

Native simulation-only wall times after are 9.07/11.08/14.32/17.93/20.65/30.88/
21.94/21.59 ms respectively, versus baseline parse failures in 3.44/4.19/3.81/
3.95/7.00/3.67/4.88/5.21 ms. These are different workloads, not speedups.
ngspice subprocess wall times include startup/output; native subprocess times,
including TS loading, are separately retained. All exact numbers and machine/
version/command/hash records are in receipt.json.

## All five unchanged originals

Historical reference successes and fresh reference exit statuses are separate
fields. Fresh ngspice succeeds on all five. Original files retain manifest hashes.

- analog_models2 ac/dc/swept_dc/transient: native now stops on unsupported `core`
  instead of `s_xfer`. `lcouple` also remains outside this slice. All four are
  still losses; comparison metrics are null.
- various/x_fer.cir: native now completes its control transient with 15,440 points
  and final node2=4.969965727140789. ngspice reports 15,119 transient rows, ignores
  graphical plot commands in batch, and exports no -r vectors for this control
  deck. No full control/measurement parity is claimed; all error metrics are null.

## Receipts and reproducibility

    pnpm -C packages/core exec vitest run src/devices/xspice
    node --test benchmarks/xspice-s-xfer-20261013/receipt.test.mjs
    spice-heavy python3 benchmarks/xspice-s-xfer-20261013/compare.py

The matrix creates an isolated baseline source snapshot under ignored .run and
runs each child in its own process group with a 30-second ceiling. Total budget
is 900 seconds, including a conservative 300-second charge for an initial aborted
comparator attempt. That attempt stopped on an AC bisect rounding assertion after
two completed reductions; matrix-aborted.log is retained. The completed matrix
used 16.30 seconds; a single original extraction repair used under one second.
Original extraction initially requested reduction node `out` rather than `node2`;
its failed receipt is retained alongside the corrected one. No reference rerun
was used for that repair. Offline --recompare corrected rounded AC endpoints, and
--archive stored compressed raw reference evidence without running simulators.

RED was 8 failed / 4 passed; the initial unsupported-analysis assertions already
passed because every s_xfer was unsupported. GREEN is 16/16 bounded tests. The
existing unsupported-model assertion was narrowed to triangle/square. Local
build, lint, guarded full suite and accuracy control exited 0. Full-suite log
predates the final added port/validation/rollback tests, which pass in green.log;
GitHub required test(20), test(22), build, accuracy on the exact PR head are the
final authority. Receipt tests pass 4/4. The accuracy control's ngspice columns
are unavailable, not evidence of a fresh reference match.

SOURCES.md contains scoped source/licence pins. Shared source registries,
manifest/outcomes/aggregate, parser dispatch, control, solver and CI are untouched.
The supervisor owns central source registration, remaining gaps and merge after
independent exact-head review.
