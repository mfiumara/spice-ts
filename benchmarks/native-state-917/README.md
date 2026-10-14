# Native diode state and source-factor checkpoints (#917)

Evidence only. Refs #917. No production simulator changes and no vendor parity
fix. This follows accepted evidence PR #1091, whose inert candidate patches
are reused for observation. The issue must remain open.

## First divergent quantity

The first observed diode-local mismatch is the zero-source INITJCT load, not
a missing diode gmin or a source increment. Native ngspice-47 resets both node
guesses and CKTstate0 to zero, then initializes D183 at its critical voltage.
The schedule candidate resets node guesses but the diode does not implement
`initializesOperatingPoint` / `beginOperatingPoint`, and stamps at zero volts.

| Zero-source first load | ngspice-47 | TS schedule candidate |
| --- | ---: | ---: |
| D183 junction voltage | 0.570454328909948 V | 0 V |
| D183 junction conductance | 0.7071067811875481 S | 0.00001584032779287937 S |
| D183 three-row RHS | [0.3656970964156338, -0.3656970964156338, 0] | [0, 0, 0] |

The self-written MIT `island.cir` uses rounded IS=4e-7, RS=.002 and CJO=300p.
It carries explicit junction/series topology in both engines. Native's first
junction conductance is approximately 1/sqrt(2)+gmin. The focused regression
expects that quantity and is RED on production, which stamps
0.00001546496459873531 S instead. Commit `85663099` contains this unmasked RED.
The final expected-failure marker exposes unresolved debt, not a simulator fix:

    EXPECT_NATIVE_DIODE_STATE=1 pnpm -C packages/core exec vitest run src/analysis/dc-native-state-917.test.ts

Expected exit1, one failed conductance assertion and one passed OP check.
The earlier OP-only reproduction at `6955de71` also failed at pivot1. Adding
CJO to preserve explicit series topology made this rounded reduction's OP
finite under TS ordering. This is not a recovery fix or a vendor acceptance
result. The final RED isolates the initialization mismatch, rather than
pretending this small deck reproduces vendor numerical ordering.

## First unshunted source step

At sourceScale=.001, diagonal gmin=0, both vendor decks have EXACTLY the same
observed 3x3 floating-island matrix in native and TS. Ordering in this receipt
is [junction positive prime, junction negative, external series terminal]:

    [ 485.4369090442113, -1.584032779287937e-5, -485.43689320388347 ]
    [ -1.584032779287937e-5, 1.584032779287937e-5, 0 ]
    [ -485.43689320388347, 0, 485.43689320388347 ]

Native retains CKTstate0 junction voltage -2.084701101089635e-19 V from its
zero-source bootstrap. Its three-row RHS is
[-3.302234670673527e-24, 3.302234670673527e-24, 0]. TS carries zero junction
history and zero RHS. Native performs fixed-order factorization successfully
on this load, without a failure-triggered reorder/restamp. Its stored inverse
island pivot is -164996696229703.88, corresponding to
-6.060727413643649e-15 S. TS rejects the same block at pivot10.

`replay.mts` independently replays those exact nine native loaded values into
TS's solver. It rejects the isolated block at column2; all three computed row
sums are zero. This is not a full-system ordering replay. It rules out a
missing local matrix stamp at this boundary, but not native floating-point
elimination order. The mathematical island still has a common-mode nullspace.
Neither a new permanent shunt nor accepting arbitrary tiny singular pivots is
justified by these measurements. Copying only the critical-voltage seed also
would not establish full device checkpoint/rollback or base OP parity.

## OPtran transfer and first failed native Newton pass

Native variant startup uses MODEINITTRAN (4097), dt=1ns. CKTstate1 carries
D183 voltage -2.084481855026512e-19 V; state0 is initially cleared by state-ring
rotation, and MODEINITTRAN loads voltage from state1. The TS driver candidate
instead initializes accepted junction voltage and accepted charge to zero.
Native startup loaded RHS is
[-7.200760364396553e-20, 6.253446933994527e-10, 1.8242598883572046e-16]; TS's
is [0,0,0]. Native/TS transient junction conductance is respectively
0.3454460563930317 / 0.3454460563930318 S, a one-spacing-scale arithmetic
mismatch, not proof that the diode causes the whole-deck Newton failure.

Native's FIRST startup Newton succeeds at optime=1ns. Its second Newton solve
also succeeds, but the timepoint is retried after truncation. The FIRST failed
native Newton pass is attempt3 at optime=1.0040052493342835ns,
dt=4.0052493342833036ps. It reaches iteration101 and returns E_ITERLIM=103.
The retained first-load/state and failure records are in `localization.json`.
TS's rejected candidate never accepts its first timepoint, so there is no
honest matched-time TS state at native attempt3. It retries 17 times from t=0
in the prior candidate telemetry. We compare the divergent startup transfer
and retain the first failed native pass, rather than aligning unrelated
iterations or claiming a full vendor-device hidden-state bisect.

Native OPtran uses a local `optime`, while CKTtime stays zero. Both are now
observed separately. A trace based only on CKTtime would falsely suggest that
native accepted no timepoints. NIiter records before-load, loaded, factor or
reorder, and iteration-limit. Only loaded records represent the raw matrix;
other matrix snapshots can already contain LU data. Transient observation is
capped at 3001 NIiter records; all OPtran attempt outcomes are retained.

## Before / after, including losses

Production dc.ts SHA256 is unchanged:
`b47918b18b62b62e2c65847f5ecdc8925d21b711fcd12f119f35fa1f80a950fe`.

| Deck | Production before / after | Schedule candidate | + driver candidate | Native |
| --- | --- | --- | --- | --- |
| vendor base | singular pivot10, 173 factors / unchanged | singular, 203 | singular, 1903 | exit0, source stepping |
| vendor variant | singular pivot10, 173 factors / unchanged | singular, 203 | singular, 1903 | exit1, transient OP fails |
| rounded MIT reduction | finite OP, 2 factors / unchanged | finite, 2 | finite, 2 | exit0, OPtran |

These counts are work observations, not timing claims. Vendor max/RMS errors
are null before AND after because TS returns no OP. Variant shared failure is
not structured convergence-error parity. No fixture, tolerance, aggregate,
MOS3, MOS2 performance or release artifact is edited.

## Reproduce

Use a clean isolated worktree. Required tools are pnpm, Python3, C compiler,
autoconf/automake/libtool and modern Bison. `build-native.sh` disables OpenMP
and uses Homebrew Bison with yacc compatibility. Set BISON for another host.
No money, foreground applications or production deployment is involved.

    pnpm install --frozen-lockfile
    pnpm -C packages/core build
    mkdir -p benchmarks/native-state-917/.work
    pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 795
    tar -xf benchmarks/corpus/ngspice-bugs/fetched/795/project.7z -C benchmarks/corpus/ngspice-bugs/fetched/795
    spice-heavy pnpm exec tsx benchmarks/ticket795-singular-917/probe.mts benchmarks/native-state-917/.work/prepared.json
    sh benchmarks/native-state-917/build-native.sh
    spice-heavy python3 benchmarks/native-state-917/native.py
    python3 benchmarks/native-state-917/run.py
    pnpm exec tsx benchmarks/native-state-917/replay.mts
    python3 benchmarks/native-state-917/check.py

Create `.work` first if running only the preparation probe. Native binary/tag,
source hashes, include pins, host and configuration are in `source.json`.
`native.py` checks both vendor input pins and seven include pins before and
after execution. It compares tracing enabled/disabled using the same binary:
exit codes match; successful raw Values payloads are identical, and the failed
variant yields no Values in either control. Dates in raw headers are not OP
values. Vendor decks, full raw files and unfiltered logs remain ignored.
Committed traces contain numeric diode state/topology only. New scripts and
reduction are MIT; referenced ngspice sources are modified BSD, not copied.

`run.py` requires the exact production dc.ts hash, applies each previous inert
candidate only in this worktree, records all nine outcomes, and restores the
source in finally. Candidate patches are NOT shipped production code.

Measured receipts: frozen install, core build, fetch/extraction, pinned native
build, guarded native observations, nine TS probes, identical-block replay,
offline check, pnpm build and pnpm lint all exit0. Focused four-file Vitest
exits0 with 50 pass +2 explicit expected failures (52 total). The unmasked
INITJCT RED exits1. Full-suite and exact-head GitHub CI receipts are recorded
in the PR/card; none are inferred from the successful diagnostic runner.

Remaining scope is a complete generic diode OP initialization/checkpoint
implementation, faithful source rollback and a full-system native elimination
and vendor-model transient bisect. No speculative production fix is included.
