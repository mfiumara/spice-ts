# #1059: first adaptive split and rejected load-history experiment

Evidence only. No production simulator change. Refs #1059; the issue must
remain open, including the separately scoped gm17 startup residual.

Baseline is `ce86105c` after #1065 merged. Measurements use ngspice-47,
Node 22.23.1 and macOS arm64. Scores use the existing breakpoint-aware
`alignAndMeasure`/`sharedGridPoints` metric, unchanged 1e-10 A/1e-4 V peak
floors, and every common signal. Each paired execution receives identical
netlist bytes. Digests, max/RMS absolute errors and every signal score are
in baseline-scores.json and candidate-scores.json. There is no speed claim.

## Decision

Do not ship the tested candidate. The first grid split is localized, but
no general discrepancy has been proved to explain the large default losses.
The load-history experiment fails the <1% acceptance gate on all four
headline decks and turns gm1 from a match into a loss. Per the card's
stop-on-unproven-mechanism rule, this is an evidence handoff, not a fix.
No GREEN is claimed. No tolerance, floor, timestep cap or model switch is
changed in production.

## First pair split

`trace.ts` records each MOS3 final charge load, accepted state, pending
integration rule and truncation input/bound without changing behavior.
`ngspice-trace.patch` adds only logging to ngspice-47 CKTterr/MOS3trunc at
revision `a80f6e3e95d51534905b1f23410a951802666656`. Full traces are retained
as trace.json.gz and ngspice-trace.txt.gz. `summarize-trace.ts` recomputes
both bounds with the unmodified TypeScript charge-truncation function.

The accepted grids first differ beyond 1e-18 s at index 20:

- TS time 10.067151215848725 ns.
- Saved ngspice time 10.06715127739681 ns.
- Difference -6.154808574087601e-17 s, initially tiny, not a material
  waveform error by itself. Earlier sub-attosecond representation differences
  are ignored only for identifying this split, not for scoring.

Both engines first try 10.094080480255495 ns with a 53.7602744317108 ps
order-2 step. Both reject it. The limiting MOS3 branch is mn1 qgb:

| Quantity | TS | ngspice-47 |
|---|---:|---:|
| CKTterr next-step bound (s) | 2.683101002494171e-11 | 2.6831071573030077e-11 |
| qgb at trial and preceding accepted point (C) | 4.428865368901515e-15 | 4.4288958285460897e-15 |

The gate-bulk capacitance is zero at this trial. Its charge stays fixed,
but trapezoidal current changes sign from the preceding accepted current.
The earlier nonzero-capacitance charge and its history therefore still
constrain the step. This is not evidence that a zero present capacitance
should disable truncation.

Recomputing CKTterr with native q/current/delta history yields EXACTLY the
native bound, 2.6831071573030077e-11 s. Recomputing with TS history yields
EXACTLY the TS bound. The test also checks native-state arithmetic to
1e-25 s. This rules out a coefficient/divided-difference discrepancy at
this first split; it does not rule out later history-policy discrepancies.

Source references:

- ngspice `src/spicelib/devices/mos3/mos3trun.c:21-23` truncates qgs/qgd/qgb.
- `src/spicelib/analysis/cktterr.c:37-77` computes current/charge tolerance,
  divided differences and the order-2 square-root bound.
- `src/spicelib/devices/mos3/mos3load.c:1056-1108,1140-1187` stores loaded
  voltages/capacitances and integrates the incremental Meyer charges before
  the next Newton solve. CKTterr reads those load states.
- TS `packages/core/src/devices/mos3.ts:1079-1098` instead recomputes
  accepted/trial charges at the final solved voltages.

That load-versus-solve difference is observable. It is NOT a proved root
cause of the headline losses. We tested it rather than guessing a fix.
The experiment caches the final charge stamp's raw terminal voltages and
uses them for acceptance and truncation evaluation. It does not port native
bypass, limited-voltage, predictor or complete load-state semantics. It is
an isolated hypothesis test, not a faithful replacement for MOS3load.
`candidate.ts` is applied only when ISSUE1059_CANDIDATE=1 in a diagnostic
process; it is not imported by simulator production code or normal tests.

## Arom classification and scores

Arom default error is 0.175255611 on v(31). Uniform TSTEP/20 in BOTH engines
reduces the all-signal worst error to 0.000314305 and gives 10783 points in
both engines (default 1330 TS / 1337 ng). Thus arom belongs in the
adaptive-grid-sensitive category, not a persistent device-law category.
The shared line-level mechanism is still unproved, so this receipt does
not assert that the same future fix will resolve arom. Retained arom
waveforms contain the two worst signals plus v(31)/v(33), selected AFTER
all-signal scoring. Input hashes remain in every capture.

All values below are worst-signal max error divided by the uniformly
floored native peak; smaller is better. The candidate is rejected.

| Deck | Baseline default | Candidate default | Baseline fine | Candidate fine |
|---|---:|---:|---:|---:|
| pair | 0.058076131 | 0.058007995 | 0.000217838 | 0.000353350 |
| gm19 | 0.171645943 | 0.236298186 | 0.000476497 | 0.001184139 |
| gm2 | 0.128714113 | 0.071414228 | 0.000167426 | 0.000169191 |
| mike2 | 0.020454177 | 0.020395178 | 0.000271367 | 0.000237133 |
| arom | 0.175255611 | 0.152101634 | 0.000314305 | 0.000322241 |
| gm1 | 0.008989035 | 0.058035608 | 0.000875063 | 0.000875479 |
| gm3 | 0.000278853 | 0.000598687 | 0.000631469 | 0.000631469 |
| todd3 | 0.002379194 | 0.002379194 | 0.003325805 | 0.003325805 |

Fine agreement alone is insufficient. gm19 and gm1 regress substantially
at default steps. No production change is retained, so production scores
remain the baseline column, not the candidate column. gm17 is not changed
or rescored here.

## RED and verification

New `packages/core/src/devices/mos3-transient-1059.test.ts` reproduces the
reduced pair supply-current loss. ISSUE1059_RED=1 exits 1 with one failure
and two passes: measured supply error 0.03603247201461949 > 0.01. Default
mode explicitly skips that unfixed assertion, runs the fine control and
native-state arithmetic check. It is not a passing default parity test.
Scoped MOS3 run: 17 pass, one explicitly skipped. Receipts retain actual
output. Build, lint and diagnostic TypeScript check pass.

`spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check` exits 1
BEFORE simulation on unchanged baseline ce86105c because aggregate source
and fixture-tree pins are stale. See aggregate-receipt.txt for pinned and
actual hashes. This is not a host-load timeout. No aggregate refresh or
pin adjustment is attempted by this card, and no aggregate pass/no-regression
claim is made. Other corpus-l decks outside this bounded set are not rerun.
Full guarded suite and exact-head CI receipts are recorded in the PR/Kanban
handoff; these do not turn the skipped RED into a resolved loss.

## Reproduction

From repository root, ngspice-47 on PATH; use a scratch TMPDIR.

```
pnpm install --frozen-lockfile
pnpm build
spice-heavy pnpm exec tsx benchmarks/results/issue-1059-fix/probe.ts arom pair gm19 gm2 mike2 gm1 gm3 todd3
ISSUE1059_CANDIDATE=1 spice-heavy pnpm exec tsx benchmarks/results/issue-1059-fix/probe.ts arom pair gm19 gm2 mike2 gm1 gm3 todd3
pnpm exec tsx benchmarks/results/issue-1059-fix/trace.ts
pnpm exec tsx benchmarks/results/issue-1059-fix/summarize-trace.ts
ISSUE1059_RED=1 pnpm -C packages/core exec vitest run src/devices/mos3-transient-1059.test.ts
pnpm -C packages/core exec vitest run src/devices/mos3-transient-1059.test.ts src/devices/mos3.test.ts
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node benchmarks/results/issue-1059-fix/*.ts
pnpm lint
spice-heavy pnpm test
spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
```

To regenerate the native trace, check out the pinned ngspice-47 source in
scratch, apply ngspice-trace.patch, run autogen/configure/make headlessly:

```
git apply --unidiff-zero <worktree>/benchmarks/results/issue-1059-fix/ngspice-trace.patch
./autogen.sh
./configure --disable-debug --without-x --disable-cider --enable-xspice --disable-openmp --with-readline=no YACC='/opt/homebrew/opt/bison/bin/bison -y'
make -j2 YACC='/opt/homebrew/opt/bison/bin/bison -y'
ISSUE1059_TRACE=1 HOME=<empty-scratch-home> <scratch-source>/src/ngspice -b -r <scratch-pair.raw> benchmarks/results/issue-1059/pair.cir 2> <scratch-trace.txt>
```

Compress scratch-trace.txt to ngspice-trace.txt.gz; summarize-trace.ts uses
that capture. The patch is diagnostic only, never installed over system
ngspice. No user .spiceinit or secrets are read. The initially selected
system bison/readline combination failed to build; Homebrew bison and
--with-readline=no produced the exercised binary.

## Remaining scope for supervisor

Continue with a separately bounded full native load-state trace (limited
voltage, bypass, predictor, accepted half-capacitance/current states) at the
first materially divergent pair edge, not a generic timestep/tolerance
adjustment. The first tiny split does not by itself explain the later
headline error. Arom can stay in that investigation's diagnostic set,
but its same-mechanism membership must be established by the eventual fix.
Do not merge this evidence PR as fulfillment of the original fix gates.
