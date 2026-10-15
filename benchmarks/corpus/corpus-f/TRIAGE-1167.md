# VBIC transient and ngspice-47 reference triage (#1167)

The corpus-f decks remain byte-for-byte unchanged. Their provenance/licence is
recorded in `benchmarks/SOURCES.md`. No fixture options or tolerances were edited.

## diffamp.cir

Commands (from the repository root, ngspice-47 Homebrew build with KLU enabled;
this batch run reports SPARSE 1.3):

    spice-heavy ngspice -b benchmarks/corpus/corpus-f/fixtures/tests/vbic/diffamp.cir

The deck requests `.OP`, `.TRAN 1n 1u 0 10n`, `.AC DEC 25 100k 1G`, and
`.OPTIONS NOACCT`. NOACCT changes accounting output, not convergence. Its two
LEVEL=4 models include junction/diffusion charges and TD=20 ps, and it contains
both NPN and PNP devices.

Before this change spice-ts rejected compilation:
`Unsupported bounded VBIC analysis: 'tran'` (zero transient points).
With generic charge integration, a local built-core run completed in 1879.15 ms:
112 transient points, final time 1 us, final v(e1_p)=0.09456740498375349 V.
The committed regression also runs the unchanged deck, including its AC analysis.
This is a completion result, not a speed or parity claim.

ngspice-47 did not produce a reference. Verbatim diagnostics:

    Warning: Dynamic gmin stepping failed
    Warning: True gmin stepping failed
    Warning: source stepping failed
    Error: Transient op failed, timestep too small
    Error: The operating point could not be simulated successfully.
    Error: no data saved for Transient analysis; analysis not run
    doAnalyses: OP:  Timestep too small; trouble with n1-instance q10
    Error: .print: no ac analysis found.
    Error: .print: no tran analysis found.

The failure's node table contains NaNs. Therefore per-signal normalized transient
errors are unavailable; no diffamp parity claim is made.

## FG.cir

The verbatim deck requests `.DC V1 0.2 1.2 10m`, has a PNP LEVEL=4 device with
TD=20 ps, and sets `.OPTIONS GMIN=1e-13 NOACCT`. Its default V1=5 V is overridden
by the DC sweep; this is not a transient request. The supervisor's preceding
600000 ms run stalled near 0.83 V; that observation is not a completed reference.

A bounded rerun used the identical deck with binary raw output for inspection:

    spice-heavy ngspice -b -r <scratch>/1167-fg.raw benchmarks/corpus/corpus-f/fixtures/tests/vbic/FG.cir

Terminated after 30.04 s without completion. Output again reported dynamic gmin,
true gmin and source stepping failures, then `Note: Transient op started` (the
fallback OP solver, not a `.TRAN` card). The interrupted raw header still said
`No. Points: 0`; 46 complete buffered records were readable through 0.65 V.
Buffering prevents identifying the actual stalled sweep point from this rerun.
No option changes were applied to manufacture a reference or improve parity.

## Small-deck validation and remaining reference discrepancy

`packages/core/src/devices/vbic-transient.test.ts` contains an original small
PWL-driven common-emitter deck and five ngspice-47 NPN sample times. Reproduction:
export that deck, append `.print tran v(c) v(b)` before `.end`, then run
`spice-heavy ngspice -b <deck>`. The reference completes (514 points).
The test checks base and collector voltages within 0.2 mV, including the TD
overshoot. PNP is checked against the analytic sign-mirrored NPN equations, not
claimed to match a PNP ngspice trace. Separate tests check electrical charge
conservation and both TD state currents for both polarities with Euler, TRAP and
Gear-2, including accepted-current history and reset.

A real ngspice-47 sign-mirrored PNP run also completes but is NOT symmetric to
its NPN run with TD=100 ps: at 5 ns v(c)=-1.63722 V, v(b)=-0.648566 V, versus
NPN +1.992116 V and +0.6499615 V. A PNP OP-only diagnostic reports
v(c)=-1.94611 V, v(b)=-0.599999 V, xf1=xf2=-5.38874e-5 after dynamic gmin
stepping. Default model saturation current is still 1e-16 A. This is an unresolved
reference/convergence discrepancy, not evidence that spice-ts matches ngspice
PNP transient behavior. The simulator retains polarity-symmetric physical
charge equations rather than adding a reference-specific workaround.
