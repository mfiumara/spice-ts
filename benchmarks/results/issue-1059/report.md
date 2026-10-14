# MOS3 transient diagnosis for #1059

Evidence only. No simulator, corpus fixture, harness, tolerance or aggregate edits.
Core baseline `a521e9e2` (full SHA in summary.json). Measured 2026-10-14 on
macOS 27.0.1 arm64, Apple M5 Pro, Node 22.23.1, ngspice-47.

## Result

The four headline losses reproduce. One shared cause does **not** explain all
four with the evidence available (95% confidence). gm19, gm2 and mike2 are
adaptive-grid/discretisation-sensitive transient losses (95% confidence).
Their ordinary OPs match and uniform fine steps bring every common signal
below the unchanged 1% rule. This does not identify the exact erroneous
truncation branch, nor prove that either default engine is the accurate one.
Both default engines deviate materially from the same fine ngspice reference.

gm17 is different. Its headline loss is a 7.37 pA startup gate-current
residual, not a 7.37% error in a substantial current. It remains with fine
steps, bypass disabled and moderately tighter tolerances. Classify it as a
startup charge/history or numerical-companion discrepancy (75% confidence),
not an established DC device-law bug. The exact mechanism remains unresolved.
No production fix is justified for gm17 by this receipt alone.

## Inputs and metric

Original decks are extracted from corpus-l PR #1050 at
`66d67caff2f10e4d6a36d2e59898cc52d661b98d`. Upstream is
[Xyce_Regression](https://github.com/Xyce/Xyce_Regression/tree/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/CircuitSim90/MOS3),
GPL-3.0-or-later. Retained licence and README grant are in licenses/xyce.
The reductions reuse gm2 model cards and are GPL-3.0-or-later derivatives.
Scripts are original spice-ts project work. Root benchmarks/SOURCES.md records
this reuse. No vendor model with a different redistribution grant is added.

Both engines receive the identical input string for each paired run. Each
capture contains that string and its SHA-256. Original default decks are
unchanged. Separate diagnostic OP decks replace only .tran with .op. Fine
decks replace only .tran with the same TSTEP/TSTOP and TMAX=TSTEP/20 in BOTH
engines. These diagnostic variants do not change any corpus outcome.

canonical-scores.json uses the existing alignAndMeasure/sharedGridPoints
breakpoint-aware metric and uniform peak floors (1e-10 A, 1e-4 V). RMS and
absolute max are retained. summary.json publishes all common-signal errors,
first >1% points and both default engines against fine ngspice using ordinary
linear interpolation. The first-divergence times below mean the first
sample crossing the uniform threshold, not the first floating-point inequality.
The plain-linear diagnostic differs at discontinuities from the canonical
headline. For example gm1 is 0.01234 plain versus 0.008989 canonical and is
still a corpus match. It is not a new gm1 bug claim.

Full precision is retained. Waveform files retain the eight worst signals,
eight earliest crossing signals and a fixed list of local nodes/currents;
selection never affects the all-signal scoring done before saving. Regeneration
recomputes every common signal. No physical-device current measurement is
claimed from a voltage-source branch current.

## Default, OP and fine-step results

All values are max absolute error / floored ngspice peak. Fine column gives
the worst signal of that variant, which need not be the default worst signal.

| Deck | Ordinary OP worst | Default worst | Fine worst | Default TS/ng points | Fine TS/ng points |
|---|---:|---|---:|---:|---:|
| gm17 | 2.56203e-6 | 0.0736790 i(vdi) | 0.0780712 | 85/85 | 1291/1291 |
| gm19 | 1.02217e-4 | 0.171646 i(vin) | 0.000476497 | 1251/1233 | 6016/6016 |
| gm2 | 1.33227e-5 | 0.128714 i(vdd) | 0.000167426 | 310/307 | 4042/4042 |
| mike2 | 4.77670e-8 | 0.0204542 i(vtest1) | 0.000271367 | 456/457 | 8017/8017 |
| gm1 contrast | 4.93145e-18 | 0.00898904 i(vrd1) | 0.000875063 | 285/285 | 2465/2465 |
| gm3 contrast | 1.97958e-12 | 0.000278853 i(vin) | 0.000631469 | 153/153 | 2017/2017 |
| todd3 contrast | 8.99368e-6 | 0.00237919 i(vnd) | 0.00332581 | 128/128 | 1636/1636 |

Headline absolute max/RMS for the four losses are respectively
7.36790e-12/1.59073e-12 A, 8.61097e-6/2.11400e-6 A,
1.26518e-3/7.72815e-5 A, and 1.87830e-4/1.42621e-5 A.

## First divergence and localisation

| Deck | First >1% crossing | Measured TS / interpolated ng | Local circuit path | Classification |
|---|---|---|---|---|
| gm17 | 1.6 ps, i(vdi) | -5.55112e-17 / -7.36796e-12 A | node 9, gates of X11 inverter and X14 NAND; i(vwr) at node 3 also diverges at this first step | Startup charge/history/numerical companion, not coarse-grid-only |
| gm19 | 29.1816584 ns, i(vin) | -4.62351e-5 / -4.54718e-5 A | Vin node 1, C1=20 pF to node 2; node 2 gates MP1/MN1; R1 feeds node 3 back to node 2 | Adaptive timestep/truncation and interpolation, not persistent device law |
| gm2 | 42.0023860 ns, i(vp) | 0.00131961237 / 0.00146860843 A | Vp node 2 drives X1 NAND MP1/MP2/MN1/MN2; node 4 crosses next at 42.4116365 ns | Adaptive timestep/truncation after falling-edge breakpoint |
| mike2 | 13.0081966 ns, i(vpulse) | 0.000401591523 / 0.000429794487 A | node 2 gates M9/M10, then node 3 drives M2/M8; i(vtest1) at gate node 100 of M11/M12 crosses at 13.6884315 ns | Adaptive timestep/truncation after falling-edge breakpoint |

The original headline signals cross later in gm2 (i(vdd), 42.6597574 ns)
and mike2 (i(vtest1), 13.6884315 ns). Those are not the first divergent
branches. gm19 also shows X3 flip-flop internal node x3.10 and supply branch
i(vix3) crossing at 34.4061721 ns. This localises the propagation path, not a
single defective transistor. No waveform-blind device attribution is made.

Using one fine ngspice reference, plain-linear worst errors for default TS /
default ngspice are gm19 0.206631 / 0.208248, gm2 0.046818 / 0.046650,
and mike2 0.061021 / 0.061020. Coarse ngspice is not an exact physical oracle.
The unchanged headline losses are still published. At uniform fine steps both
engines have identical point counts and agree within 0.000477 across these
three decks. This strongly disfavors a persistent capacitance or channel-law
mismatch, but cannot distinguish truncation-history policy from loaded-versus-
accepted charge evaluation without internal state tracing.

### gm17 exception

The ngspice i(vdi) peak is below the uniform 1e-10 A floor. The 1% gate is
therefore 1 pA. Initial transient source currents at t=0 are zero in both
engines. Ordinary .op is a separate experiment and does not validate the
.ic-constrained transient seed. At the first step, ngspice node 11 changes by
-1.05856e-10 V and x15.4 by -1.64319e-10 V; TS changes by -8.88178e-16 V
and +2.22045e-15 V. Thus the gate current accompanies real, tiny internal-node
relaxation, not just differing current-print precision.

MOS3 Meyer charge uses voltage increments and averaged accepted capacitance
(packages/core/src/devices/mos3.ts:989-1055). The driver accepts an initial
charge state and stamps trapezoidal history (transient-driver.ts:736-758).
The .ic-constrained transient OP path is simulate.ts:644-655. Tiny seed/load
or companion residual differences can yield pA currents at ps time intervals.
That is an inference, not an identified faulty statement.

startup.json records controls on identical variant bytes. BYPASS=0 leaves
0.0736790 unchanged. RELTOL=1e-5, ABSTOL=1e-13, VNTOL=1e-7 leaves 0.0736786.
Extreme RELTOL=1e-6, ABSTOL=1e-15, VNTOL=1e-9 causes ngspice to fail at 5 ns
with timestep too small, both with and without bypass. Failures are retained,
not promoted to matches. Tightening tolerances is not a proposed fix.

## Reduced RED

pair.cir is two CMOS inverters, four MOS3 devices, two capacitors, two sources
and the original gm2 model cards. No NAND, subcircuit, dummy MOS or IC is
needed. Removing the second inverter (inverter.cir) drops canonical default
error to 0.002140, so the pair is the smallest tested topology that stays RED.
This is topology minimisation, not a proof that every model parameter is needed.

The pair has ordinary OP error 3.73035e-15. Default canonical worst is
0.0580761 i(vp); i(vdd) is 0.0360325. Fine worst is 0.000217838.
At TS time 110.95391571190365 ns, the interpolated ngspice-47 i(vdd) reference
is -0.0023994450846768953 A; TS is -0.002571285408694183 A.
The peak used for that branch is 0.004769040657204058 A. Full reference grids
and literal values are stored in reduced-pair.waveforms.json.gz.

repro.test.ts exercises the simulator against that saved ngspice reference.
The default assertion is executable TODO-marked, not skipped. Set
ISSUE1059_RED=1 to make it an ordinary failing test. The fine-step control
passes in both modes. Measured RED command exits 1 with one failure and one
pass; default command exits 0 with one TODO and one pass. This is not a GREEN
production fix and does not claim #1059 is resolved.

## Proposed bounded fix cards for supervisor routing

1. General MOS3 transient charge/truncation parity, after the #1057 MOS3
   temperature lane releases its files. Use pair.cir as the initial RED.
   Candidate files are packages/core/src/devices/mos3.ts (Meyer accepted/load
   capacitance and truncateTransientStep), devices/charge-state.ts and
   analysis/transient-driver.ts (history/order/truncation handoff). First trace
   the first adaptive-grid split on the pair against ngspice MOS3trunc/CKTterr;
   change only the proven mismatched state transition. New regression should
   be packages/core/src/devices/mos3-transient-1059.test.ts. Require pair,
   gm2, gm19 and mike2 at default unchanged bytes below the uniform 1% gate,
   fine-reference agreement retained, and gm1/gm3/todd3 unchanged. No deck-
   specific timestep cap, tolerance or model switch. If a generic step fix
   does not meet those gates, publish the rejected candidate rather than tune.
   Confidence in the category is 95%; confidence in any particular line-level
   fix is not established. This card should start with state tracing, not a
   speculative MOS3 edit.
2. Separate bounded gm17 startup investigation. Trace only the constrained
   seed and first two accepted steps, MOS gates connected to nodes 9 and 3.
   Compare prime-node voltages, Meyer half caps, qgs/qgd/qgb, first integration
   coefficients and gate KCL residuals. Candidate seams are the same charge
   state/initialisation code plus analysis/dc.ts. Deliver a reduced startup
   RED before any production edit. Matching charge currents but differing
   source-current unknowns routes to numerical solve; differing charge
   histories routes to initialisation. Do not bundle this unresolved pA case
   into the adaptive-grid fix or relax the corpus floor.

No follow-up card was created by this worker. Supervisor owns routing.

## Reproduction and verification

From repository root, ngspice-47 on PATH and corpus-l source commit available.
Use a scratch TMPDIR. No whole-corpus or aggregate command is needed.

```
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsx benchmarks/results/issue-1059/sources.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1059/diagnose.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1059/reduce.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1059/startup.ts
pnpm exec tsx benchmarks/results/issue-1059/score.ts
ISSUE1059_RED=1 pnpm exec tsx --test benchmarks/results/issue-1059/repro.test.ts
pnpm exec tsx --test benchmarks/results/issue-1059/repro.test.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node benchmarks/results/issue-1059/*.ts
pnpm lint
```

ngspice command is `ngspice -b -r <scratch.raw> <identical.cir>`, ASCII raw
via isolated HOME/.spiceinit. No saved login, user .spiceinit or secrets read.
run-receipt.txt retains batch console results. score-receipt.txt retains
canonical scores. Local install/build/lint, scoped typecheck and two-test
reproduction ran successfully (the explicit RED is expected exit 1).
Full monorepo tests are delegated to exact-head GitHub CI for this
benchmark-only card, as required by its targeted-tests scope. PR/head/CI
receipts are in the Kanban handoff and PR thread, avoiding a self-referential
commit SHA in this file. No timing/speed improvement claim is made.
