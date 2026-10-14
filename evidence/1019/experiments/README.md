# Controlled MOS2 pump experiments (#1019)

Evidence only. Refs #1019; keep the issue open. No production solver, device,
fixture, tolerance, or scorer changes. No safe general simulator fix is justified
by these experiments. No speed or superiority claim is made.

Frozen production base: `8534aed9538d3b3578b2110038a8e6ebd62be958`, core tree
`e363cfd58b5fc6af7c505751d6c8913d9ed92506`. The new baseline reproduces the
previous investigation's complete pump waveform exactly in both engines.
`provenance.json` records the native object, build fingerprint and host.

## Results

All input bytes are unchanged and identical between the engines. Pump scores use
the unchanged shared scorer (`reduceRow`), with full comparison receipts retained.
The unrounded normalized current error is also recomputed independently from the
retained waveforms. A mismatch is still a loss.

| Variant | Pump normalized error | TS / native points | Conclusion |
| --- | ---: | ---: | --- |
| baseline | 0.0630048710928 | 867 / 868 | unresolved loss |
| E1, native MOS2 bypass explicitly disabled | 0.0630048710928 | 867 / 868 | does not attribute |
| E2a, previous-load local fetlim/limvds in transient | 0.0969954997515 | 870 / 868 | does not attribute; rejected regression |
| E2b, native first-iterate convergence gate | 0.0629972589202 | 869 / 868 | does not attribute; rejected guard regression |
| E3, loaded rather than raw charge voltages | 0.0630048711071 | 867 / 868 | does not attribute |
| E4, one diagnostic breakpoint label coalesced | 0.0630048710928 | 867 / 868 | partially attributes the early score only |

For **every variant**, the first indexed accepted-grid separation exceeding the
1 as diagnostic resolution remains TS `5.027387875826269 ns` versus native
`5.027387877402101 ns`. The first common-time accepted Vgs difference exceeding
1 nV remains `5.0185195890911405 ns`, with TS minus native
`-6.833099325809222e-7 V` and qgb delta `4.517685251731772e-21 C`.
These are diagnostic thresholds, not changed scoring tolerances. Pairing by index
is valid before this first split; it is not asserted to pair later extra points.
The state test uses common exact times only and is not a forced-common-step run.

### E1: bypass is already disabled

`instrument.py` adds a native MOS2-only environment gate to the existing bypass
condition. `prepare.py` runs the same native executable on identical bytes, with
`MOS2_NO_BYPASS` absent for control and set to `1` for E1. `CONFIGTRACE` records
`CKTbypass=0` for control, and the force-off flag changes from 0 to 1. There are
zero pump bypass hits in either full trace. All eight native waveforms, including
times and signals, are exactly unchanged. Thus this is not evidence that bypass
is harmless when enabled; it proves the measured default run was not using it.
Native `cktntask.c` defaults `TSKbypass` to zero.

TS MOS2 has no equivalent load-skip/bypass path to disable. The nonlinear pump
also does not qualify for the transient iteration-invariant linear shortcut.
No unrelated MOS1 cache was altered.

### E2: limiting and convergence, independently

E2a applies `e2-local-limiting.patch` to a **private copied core source tree**.
The one rule changed is enabling the existing DC previous-load fetlim/limvds
vector path during transient loads as well. Predictor, pnjlim, global node
damping, charge inputs, tolerances and convergence formulas remain unchanged.
This is a local-rule sensitivity test, not a complete native limiting port:
retry predictor reference restoration and the solver's existing node damping
are not jointly changed.

Within 5.0–5.03 ns the native gate and bulk limiting deltas are zero; the maximum
drain delta is only `4.85722573273506e-17 V`, from the gate/drain subtraction
path. No junction `Check` is set in this window. The early accepted-state split
survives E2a. Later trajectories move, the headline error worsens to 0.097, and
the unchanged mosamp2 stop guard fails. Shipping this patch is not justified.

Native and TS `cdhat/cbhat` convergence expressions and inequalities agree:
drain `>=` fails, bulk `>` fails, with `RELTOL * max + ABSTOL`. Native NIiter
forces the first iterate nonconverged, while TS can converge on it. E2b tests
**only** that rule, via `e2-first-iteration.patch` in another private copy. It
changes point counts but preserves the first split and fails the 5 uV mosamp2
guard. E2a and E2b are not combined.

`e2-receipt.json` retains the native raw/limited voltage pairs, the native
convergence calls, all native Newton iteration outcomes in the window, and the
TS convergence calls. Native `NIITERTRACE` columns are time, iteration within
NIiter, mode, load-noncon before NIconvTest, final-noncon. The native window has
26 iterations; baseline TS has 25 load/solve observations. First-iterate and
voltage-convergence short circuits explain why device convergence tests are not
called on every iteration. The TS `newton` observations precede node damping;
`convergence` observations record the actually invoked post-damping test.
Do not compare total work counters across rejected/accepted attempts directly.

### E3: raw versus loaded charge voltages

Native `mos2load.c` stores loaded terminal voltages at `next2`; DEVqmeyer and
Meyer charge increments use those voltages. TS normally reads the raw solution
context after the static load, except for its predictor context. E3 changes
only the transient charge context to the static load's limited terminal biases.
Predictor charge extrapolation, capacitance averaging and integration are kept.

The result moves at floating-point scale, not enough to attribute the loss.
The early split and 0.063 headline remain. This does **not** test a separate
hypothesis: retaining the static channel's von/vdsat for capacitance evaluation
rather than reevaluating the channel. Native half caps also must not be compared
directly with TS full caps including overlap. No such unsupported comparison is
used here.

### E4: exact-corner score sensitivity, not a solver fix

`e4.ts` relabels exactly one retained TS grid entry, index 132, from
`1.5200000000000004e-8` to `1.52e-8` seconds. All sample values, reference values,
and other times remain unchanged. It calls the unchanged scorer on that
**diagnostic-only** series. It neither edits a netlist nor claims a simulated
scheduler/PWL behavior correction.

The current maximum error in the immediate 15.2–15.3 ns window drops from
`3.6502048935892987e-6 A` to `1.8088617147363304e-7 A`, below the 1% threshold.
The first 1% violation moves from `15.208922042773343 ns` to
`30.173954417723014 ns`. The worst error at `45.02373230181537 ns` remains
`19.539446179088065 uA`, so the 0.063 overall loss remains. This attributes part
of the early *reconstruction score*, not the accepted-state drift or the later
loss. No scoring change is proposed in this PR.

## Unchanged guards and honest candidate losses

The historical mosamp2 guard checks the final v(5) sample against `9.46397521 V`
with the original **5 uV** bound, not full-waveform parity. Full native/TS
waveforms and shared comparisons are retained as well. Mosrect and ring use the
unchanged historical linear guard measurement from `evidence/1002/run.ts`.

| Variant | mosamp2 stop error, uV | k-10 normalized | k-15 normalized |
| --- | ---: | ---: | ---: |
| baseline / E1 / E4 | 2.705943519 | 0.000148216705908 | 0.000115757248630 |
| E2a | **17.336139120, FAIL** | 0.000148216705908 | 0.000121690793400 |
| E2b | **6.458400376, FAIL** | 0.000148216712908 | 0.000115757248630 |
| E3 | 2.705943617 | 0.000148216708267 | 0.000115757248719 |

All four RC cases match for every variant, with unchanged results:
trap/MAXORD1 and gear/MAXORD1 `1.24e-15`, 97 points; trap/MAXORD2 `2.99e-15`,
67 points; gear/MAXORD2 `2.01e-7`, 67 points. No guard was loosened. The final
production source is unchanged, so baseline guard behavior is retained.

## Recommendation and remaining boundary

Recommend **no general simulator fix** from these experiments. E1 excludes an
active bypass mechanism in this run. E2 candidates regress guards; E3 does not
resolve the residual. E4 identifies a diagnostic corner effect but not a solver
fix. Predicted impact of retaining production unchanged is the measured baseline
loss plus unchanged guards, not an improvement claim.

A later bounded investigation can test native-versus-TS channel/capacitance
metadata reuse and arithmetic near the pump's near-zero Vds, where observed TS
mode flips differ from the native positive roundoff bias. These are hypotheses,
not proof of a defect or permission to clamp tiny Vds or tune this circuit.
Do not combine speculative limiting, predictor, charge and scoring changes.

## Reproduce

From the repository root, with pnpm dependencies, autoconf/automake, a C toolchain
and bison >=3 installed:

    pnpm install --frozen-lockfile
    pnpm build
    sh evidence/1019/experiments/build-native.sh
    spice-heavy python3 evidence/1019/experiments/prepare.py
    spice-heavy sh -c 'for v in baseline e1 e2 e2-first e3; do pnpm exec tsx evidence/1019/experiments/run.ts "$v" || exit; done'
    pnpm exec tsx evidence/1019/experiments/e4.ts
    python3 evidence/1019/experiments/summarize.py
    pnpm exec tsx evidence/1019/experiments/check.ts
    python3 evidence/1019/experiments/check.py
    python3 -m unittest discover -s evidence/1019/experiments -p test_receipts.py

The pinned ngspice-47 object is fetched directly; the GitHub mirror does not
advertise a `ngspice-47` branch/tag, so do not substitute the mirror's HEAD.
Set `BISON_BIN` to a non-Homebrew bison path when needed. The private native HOME
sets only ASCII raw output. Production fixture hashes are checked. Project-MIT
RC cases are the existing #983 definitions. `--copies-only` prepares the private
TS copies without rerunning native measurements. Patches are never applied to
`packages/core`; deleting ignored `work/` discards all TS candidates.

Offline `check.ts` reruns all 48 retained comparisons through the unchanged
shared scorer. Python recomputes localization/guards from waveforms and native
traces, verifies every receipt, and detects numerical, point-count, divergence
and hidden-guard-loss drift. The E4 checker requires exactly one changed grid
label and no changed samples.

Sources and licenses are unchanged from `../README.md` and
`benchmarks/SOURCES.md`: the pinned ngspice source has its existing mixed
BSD-style licenses; pump/mosrect/ring inputs are the licensed corpus-k fixtures;
mosamp2 is the existing classic fixture. Only project-authored MIT scripts,
small patch recipes and generated diagnostic outputs are distributed here.
No upstream native source tree or executable is committed.

Build, lint and four focused files pass; verification logs are retained here.
The full monorepo test run is guarded by `spice-heavy`. Exact-head required CI
is recorded in the Kanban handoff rather than guessed from a prior head.
