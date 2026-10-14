# Native MOS3 load-state investigation

Refs #1059. Evidence only. No production edits, no proven fix, no GREEN parity
claim. gm17 is excluded. Starting main is 4f4d957c, including #1078.

## First material divergence

For localization only, material means the first chronological sample on the
union of both accepted grids where any common signal differs by >1% of its
native peak (uniform floors 1e-10 A and 1e-4 V). Interpolate the other engine
linearly. This is NOT the published breakpoint-aware benchmark metric. Edge
interpolation can amplify a grid mismatch; this test identifies a reproducible
observable loss, not an equal-time internal-state comparison or a causal proof.
Signals are sorted lexically only to break ties at the same time. All common
signals are searched. `summarize.py` regenerates `divergences.json`.

| Deck | Time (ns) | Quantity | TS | Native, interpolated unless native accepted | Peak-normalized error |
|---|---:|---|---:|---:|---:|
| pair | 42.010800772761916 | i(vp), A | 0.0005330899254077301 | 0.0005627080129191441 | 0.012979806832604218 |
| gm19 | 29.181658418938905 | i(vin), A | -0.000046235144101118564 | -0.000045471840926377624 | 0.015215223698442483 |
| arom | 27.403135022182344 | v(33), V | 0.20403106770334278 (interpolated TS) | 0.1563437929027398 | 0.010392538849410179 |

These are later material losses, not the 6.15e-17 s first pair grid split from
#1078. The unchanged breakpoint-aware all-signal score is independently
remeasured by `verify.ts`: pair 0.058076131190992926, gm19 0.17164594259599314,
arom 0.1752556113740046. Before = after because this PR only observes. The
larger union-grid worst errors in divergences.json are a different diagnostic;
they must not replace those benchmark scores.

Native is pinned ngspice-47 a80f6e3e95d51534905b1f23410a951802666656.
`provenance.json` records source/config/binary/patch hashes, Node 22.23.1 and
macOS arm64. Inputs are unchanged, identical bytes in both engines, with hashes
in each waveform capture. No source, model, tolerance, floor or timestep tuning.

## What the native traces establish

Trace windows are pair 39..43 ns, gm19 27..30 ns, arom 25..28.5 ns. Every
accepted point, Newton load, predictor input and rejected trial in those windows
is retained; native TRIAL/REJECT records additionally cover the entire run.
`loadstates.py` decodes them into `*-steps.json.gz` and `*-focus.json`.

| Window | Native/TS accepted points | Native MOS loads | Bypasses | Changed raw-to-limited loads | Native truncation rejections* |
|---|---:|---:|---:|---:|---:|
| pair | 24 / 24 | 412 | 0 | 9 | 5 |
| gm19 | 6 / 6 | 6804 | 0 | 3 | 2 |
| arom | 8 / 7 | 5916 | 0 | 2 | 2 |

*Counts within the first-to-last accepted point of the captured window. No
native Newton nonconvergence there. TS attempted (time,dt) tuples not accepted
number 6 / 2 / 2 respectively; their exact values are derivable from *-ts.json.gz.
The extra pair TS attempt lies after the final native captured accepted point.
Raw-to-limited counts use a 1e-12 V observational difference threshold, not a
simulator tolerance. INPUT and LOAD permit direct inspection of each limiter.
Check is the native pn-junction limiting flag, not a general limiting flag.
One pair load has Check=1 at 42.674674703601184 ns; none in gm19/arom windows.
Native bypass is ruled out for these windows, not globally for every circuit.

### 1. Native predictor is active; MOS3's TS caller does not implement it

This build has PREDICTOR undefined. Thus NIpred/CKTpred's global node-vector
predictor is NOT compiled; the active path is MOS3's local MODEINITPRED state
extrapolation. `src/include/ngspice/config.h:529` is recorded in provenance.
The native INPUT mode 8193 means MODETRAN | MODEINITPRED; 257 is
MODETRAN | MODEINITFLOAT. xfact is delta/deltaOld[1]. Each first LOAD retains
state0, state1 and state2, including all three Meyer q/cq/half-C histories.

Source references below are to UNPATCHED pinned ngspice:

- `src/spicelib/devices/mos3/mos3load.c:206-246`: restore state0 voltage history
  from state1, then extrapolate vbs/vgs/vds with xfact.
- `mos3load.c:282-335`: bypass conditions and reuse policy. The logged branch
  is never taken in these windows.
- `mos3load.c:349-373`: sequential DEVfetlim, DEVlimvds and DEVpnjlim.
- `mos3load.c:1056-1108`: retain limited load voltages and Meyer half-C.
- `mos3load.c:1127-1137`: first-iteration q = (1+xfact) q1 - xfact q2.
- `mos3load.c:1140-1146`: subsequent loads use q1 + deltaV * (halfC0+halfC1+overlap).
- `mos3load.c:1175-1187`: NIintegrate on qgs/qgd/qgb, even zero-C branches.
- `src/spicelib/analysis/dctran.c:374,658-686,709-741,879-894`: accept, state
  rotation, prediction, Newton solve/rejection, truncation rejection.

TS `mos3.ts:1027-1047` always uses incrementalCharge at the raw node solution;
there is no MOS3 beginTransientNewton predictor. `charge-state.ts:92-97`
already provides predictedCharge for other callers. A missing MOS3 caller
phase, not a broken generic predictedCharge formula, is demonstrated.

Native first-load qgs examples (native polarity domain, C):

| Deck/device/time | xfact | Actual native qgs / charge-history formula | Incremental Meyer alternative on SAME native inputs |
|---|---:|---:|---:|
| pair mp2, 42.01099182113164 ns | 0.08238322720485514 | 5.064030518365076e-13 | 5.063095445203768e-13 |
| gm19 mp1, 29.22791551882207 ns | 1.7383479755993965 | 4.625358276931861e-13 | 4.623909649291921e-13 |
| arom m$578, 27.403135022182344 ns | 1.5408381392079682 | 3.6367504900769264e-13 | 3.710338385190683e-13 |

The native arithmetic control checks the pair example. The second opt-in RED
observes the actual TS MOS3 first charge stamp on the reduced pair, comparing
it to charge extrapolation with its OWN accepted TS histories. At the rejected
trial immediately preceding the first material accepted point, 42.022715821727246
ns, xfact=0.17130779249153713, actual=-5.150457250837247e-13 C versus
predicted=-4.975179199584889e-13 C, delta=1.7527805125235884e-14 C.
The 1e-25 C assertion is an arithmetic-policy check, NOT a waveform tolerance.
It does not claim that adding only a predictor fixes the default losses.

### 2. Limiter history survives rejected TS attempts

At pair's 42.010800772761916 ns retry, TS mp1 begins from accepted vbs
-0.03707985582438944 V but lastVbs is -0.030814532336538747 V, left by the
rejected larger trial. Native restores its accepted voltage state before
limiting on every MODEINITPRED call. The same retry has TS mn2 lastVbs
-0.010698114627135708 V versus accepted -0.009745840306702114 V.
`beforeStatic` retains these values. `mos3.ts:884-899` reads/writes lastVbs and
lastVbd directly; no MOS3 transient-attempt hook restores them.

This proves a retry-history policy difference. It does NOT prove active
DEVpnjlim at that first material point: raw/limited vbs then agree. The actual
native gate/drain limiters are visibly active earlier in the falling edge:
mn1's 42 ns predicted vds 4.50972334749508 becomes 4 V, with vgs changed
0.003133147222527643 -> 0.23182519889597475 V. gm19 x1.mp1 at
27.267334316671777 ns changes vgs 0.24628050058795992 -> 0.6640443018746038 V.
Arom m$610 at 25.014662628089116 ns changes vgs 2.380735404089435 ->
2.191995934010013 V. All exact inputs and loaded outputs remain in the captures.

### 3. Acceptance is still solved-voltage recomputation in TS

Native advances the final MOS3 LOAD states without a fresh device charge load
at the solved point. TS `mos3.ts:1079-1098` reevaluates charges for both
truncation and acceptance. At the material pair point, mp2 qgd changes by
7.253037179759662e-20 C between final charge stamp and acceptance. In gm19 mp1
qgd the analogous change is 6.979445155003347e-22 C. These local small deltas
alone do not establish the large losses; #1078's partial cache experiment
already regressed gm19/gm1. Do not revive that rejected experiment as a fix.

The native bracket for the material pair point is 42 ns (order 2, dt
1.3342304622627826e-10 s) and 42.01099182113164 ns (order 1, dt
1.0991821131623372e-11 s). TS accepted 42.010800772761916 ns with Euler dt
1.0800772761908402e-11 s. gm19 TS dt 6.689299349665695e-10 s/order 2 is
bracketed by native order-2 points at 28.513448725404365 and 29.22791551882207
ns (later dt 7.144667934177069e-10 s). Do NOT compare nearest-point internal
values as if the grids were identical. `*-focus.json` labels brackets;
`*-steps.json.gz` retains qgs/qgd/qgb, cqgs/cqgd/cqgb and capacitances at every
captured accepted step for both engines.

## Classification and bounded follow-up

Measured classification: load-phase/state-history semantics differ, including
missing voltage/charge MODEINITPRED and un-restored retry limiter history;
bypass does not explain the captured material windows. Truncation arithmetic
was already exonerated at the first split in #1078. Current evidence does not
separate which load-phase differences cause the large default-grid loss.

Arom shares the demonstrable predictor/load policy discrepancy (m$578 example
above) and earlier active gate/drain limiting, with no bypass or Newton failure
in the material window. It is NOT proved to share pair's retry-history causal
mechanism: its material point is not an immediate rejected-step retry, and the
selected TS devices' pre-load vbs equal accepted vbs. Its shared-fix membership
remains unproved. #1078's fine-step control (0.000314305 versus default
0.175255611) still supports adaptive-grid sensitivity, not device-law failure.

No fix is proven here. A supervisor-routed implementation experiment after
gm17 should port the COMPLETE MOS3 load phase as one coherent hypothesis:
restore accepted limited voltage states at each attempt/retry, extrapolate
vgs/vds/vbs and qgs/qgd/qgb with native xfact on the first load, apply native
sequential limiters, and carry the resulting final load-state voltages,
half-capacitances, charges and currents through acceptance/truncation. Keep
bypass at the measured reference setting; do not add a bypass-only workaround.
Gate that experiment on unchanged pair/gm19/arom defaults AND gm1/gm3/todd3
controls. This is a proposed diagnostic scope, not a verified production fix.
No production candidate is included in this PR.

## Receipts and trace format

- `*-waveforms.json.gz`: identical netlist bytes/hash, full actual/reference
  accepted grids and all engine signals. `verify.ts` regenerates unchanged
  benchmark scores and compares traced versus uninstrumented runs exactly.
  All 312/1251/1330 TS and 312/1233/1337 native points/signals are unchanged,
  max absolute difference 0. Observation does not change either engine.
- Native `INPUT t device mode xfact vgs vds vbs` is before voltage limiting.
  `LOAD t device order mode dt xfact bypass Check Cgs Cgd Cgb` is followed by
  13 state values for each of state0/1/2. Order: vbd,vbs,vgs,vds,capgs,qgs,cqgs,
  capgd,qgd,cqgd,capgb,qgb,cqgb. Cap fields in those states are Meyer HALF-C;
  the three C fields in the prefix are effective halfC0+halfC1+overlap.
  Native q/voltage uses model polarity; TS charges/branch voltage use node
  polarity and TS cap is full 2*half+overlap. Convert before comparing.
- Native TRIAL records solved order/dt and NIiter result. ACCEPT order/dt
  fields are NEXT order/NEXT delta after truncation; do not mislabel them as
  the solved order. LOAD is authoritative for the solved integration order.
- TS rows retain before-static limiter state, raw/limited terminal voltages,
  charge stamp and accepted q/current/capacitance histories, plus truncation
  bounds/order/delta. Prototype wrappers observe only and are never imported
  by production; tests restore their wrappers in finally.
- `red-receipt.txt`: intentional exit 1, two RED failures / one arithmetic
  pass. `control-receipt.txt`: targeted MOS3 tests with opt-in REDs skipped.
  Build/lint/scoped diagnostic tsc receipts are included. Required full CI
  is recorded on the exact PR head in the handoff. No local corpus aggregate
  or root full suite is run under this card's targeted-only machine policy.
- Initial unbounded logging timed out at 120 s, then a large TS in-memory
  trace reached Node's 4 GB heap. Failure receipts remain visible. Bounded
  windows and buffered native stderr were exercised successfully instead;
  these limit OBSERVATION only, never simulation stop times/steps. No speed
  claim. Scratch inputs/native tree/binary are not committed.

## Reproduce

From repo root, with scratch below the agent cache and ngspice-47 on PATH:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
python3 benchmarks/results/issue-1059-loadstate/summarize.py
python3 benchmarks/results/issue-1059-loadstate/loadstates.py
pnpm -C packages/core exec vitest run src/devices/mos3-loadstate-1059.test.ts src/devices/mos3-transient-1059.test.ts src/devices/mos3.test.ts
ISSUE1059_LOADSTATE_RED=1 pnpm -C packages/core exec vitest run src/devices/mos3-loadstate-1059.test.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1059-loadstate/verify.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node benchmarks/results/issue-1059-loadstate/*.ts
```

To regenerate native and TS windows, clone https://github.com/ngspice/ngspice
into isolated scratch, checkout a80f6e3e95d51534905b1f23410a951802666656,
and apply ngspice-loadstate.patch. Commands exercised:

```sh
git apply <worktree>/benchmarks/results/issue-1059-loadstate/ngspice-loadstate.patch
./autogen.sh
./configure --disable-debug --without-x --disable-cider --enable-xspice --disable-openmp --with-readline=no YACC='/opt/homebrew/opt/bison/bin/bison -y'
make -j2 YACC='/opt/homebrew/opt/bison/bin/bison -y'
# Back in this worktree; export actual isolated scratch paths.
export TMPDIR=<agent-cache-scratch>
export ISSUE1059_NATIVE=<scratch-source>/src/ngspice
ISSUE1059_TRACE_START=3.9e-8 ISSUE1059_TRACE_END=4.3e-8 spice-heavy pnpm exec tsx benchmarks/results/issue-1059-loadstate/trace.ts pair
ISSUE1059_TRACE_START=2.7e-8 ISSUE1059_TRACE_END=3e-8 spice-heavy pnpm exec tsx benchmarks/results/issue-1059-loadstate/trace.ts gm19
ISSUE1059_TRACE_START=2.5e-8 ISSUE1059_TRACE_END=2.85e-8 spice-heavy pnpm exec tsx benchmarks/results/issue-1059-loadstate/trace.ts arom
python3 benchmarks/results/issue-1059-loadstate/summarize.py
python3 benchmarks/results/issue-1059-loadstate/loadstates.py
```

The runner creates an isolated HOME containing only `set filetype=ascii`.
It neither reads user .spiceinit nor replaces system ngspice. Generated
scratch paths differ per run; numerical captures and input hashes reproduce.
