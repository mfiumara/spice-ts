# gm17 startup mechanism, issue #1059

Evidence-only outcome. No production solver, device, fixture, tolerance or
aggregate changes. Stock ngspice-47 parity remains a loss, not a new match.
The native-only control below is not substituted for the corpus oracle.

## Proven mechanism

The first-two-step residual is a numerical-system divergence, followed by a
real Meyer charge response. It is not evidence that spice-ts needs a different
Meyer history rule. On this constrained `.ic` deck, native plain Newton,
dynamic gmin and true gmin fail; source stepping succeeds. At the last
MODETRANOP load `CKTdiagGmin=0`. `gillespie_src` then assigns
`CKTdiagGmin = CKTgmin = gminstart` (1e-12), without another nominal OP solve.
The first transient solve therefore factors a different numerical system from
the one that supplied the seed charges. Runtime tracing confirms 1e-12 at
both first accepted times; device gmin stays 1e-12 and source factor stays 1.

This is the factorization diagonal perturbation, not simply a physical
node-to-ground resistor. Sparse 1.3 `LoadGmin` adds it to the current reordered
matrix diagonal. The upstream comment explicitly warns that these elements
may bear little relation to the outside world's diagonal. Mirroring that
implementation-dependent perturbation in spice-ts would require matching
pivot order as well as the fallback path. It is not a justified charge-model
fix. This card therefore takes its evidence-only acceptance path.

The native patch logs state without changing ordinary runs. Its only control
change, enabled by `GM17_NO_LEAK=1`, restores `CKTdiagGmin=CKTgshunt` immediately
after that assignment. No netlist bytes, integration rule, charge expression,
seed voltage, capacitance, convergence tolerance or source factor change.
The saved baseline source-built waveforms produce the same canonical gm17
score as the Homebrew ngspice-47 oracle. With the control, gm17's all-signal
worst score falls from 0.0736790025443 to 0.000105427110433.

Pinned ngspice-47 source is `a80f6e3e95d51534905b1f23410a951802666656`:

- [cktop.c](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/analysis/cktop.c), `gillespie_src`, lines 585-648. Line 643 retains the diagonal after source stepping. In contrast, `dynamic_gmin` restores `CKTgshunt` at line 252.
- [niiter.c](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/maths/ni/niiter.c), lines 123-173, passes `CKTdiagGmin` to Sparse factor/reorder.
- [spsmp.c](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/maths/sparse/spsmp.c), lines 448-475, `LoadGmin` and its reordered-diagonal warning.
- [cktload.c](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/analysis/cktload.c), lines 146-163, MODETRANOP `.ic` holds; these do not persist into MODETRAN.
- [mos3load.c](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/src/spicelib/devices/mos3/mos3load.c), lines 1065-1193, half caps, incremental gate charges and integration. The diagnostic patch adds logging after this block.

## First two steps and gate KCL

Full device prime nodes, loaded terminal voltages, Meyer half caps,
qgs/qgd/qgb, previous charges and currents are in `native-state.json` and
`ts-state.json.gz`. Native records are the last load for each time/mode/device,
not falsely labelled post-solve values. TS records are accepted points;
truncation-only callbacks are excluded. Exported post-solve nodes/currents
are separately retained in the compressed waveform captures. Native PMOS
charges/currents are type-normalized; TS uses node-domain values, so negate
native PMOS q/cq before comparing.

Both engines use backward Euler for the first TWO steps. Times are 1.6 ps and
3.2 ps, dt=1.6 ps, dI/dQ=6.249999999999999e11. Native coefficients are
[6.249999999999999e11, -6.249999999999999e11, 0]. These are not trapezoidal
steps and their residual is not a trapezoidal-history artifact.

For X11.MP1 at the seed, native prime drain/source are
4.999999993202269 / 4.999999999970498 V; TS gives
4.999999993202795 / 4.999999999970501 V. Native gs/gd half caps are
3.032620435101261e-14 / 3.032620430864780e-14 F, versus TS
3.032620435101097e-14 / 3.032620430864944e-14 F. Native seed qgs/qgd are
3.032620435083368e-13 / 3.032620426741793e-13 C; TS node-domain values are
-3.032620435083205e-13 / -3.032620426742276e-13 C. qgb is zero in both.
Small OP stopping/load differences remain, but clearing only the native
factorization diagonal removes the pA-scale discrepancy without changing
these seed histories.

| Time | Native gate-9 sum dQ/dt | Exported native i(vdi) | Native gate-3 sum dQ/dt | Exported native i(vwr) |
|---|---:|---:|---:|---:|
| 1.6 ps | 7.36793720e-12 A | -7.36795577e-12 A | 5.59780993e-12 A | -5.59787427e-12 A |
| 3.2 ps | 5.69594820e-12 A | -5.69602195e-12 A | 3.50532914e-12 A | -3.50544691e-12 A |

Gate 9 sums X11.MP1/MN1 and X14.MP2/MN2. Gate 3 sums X14.MP1/MN1 and
X15.MP2/MN2. Their KCL differences are sub-fA numerical rounding/load-to-solve
residuals, not missing pA gate currents. TS accepted gate-9 sums are
-3.15544e-17 and 1.26218e-16 A; gate-3 sums are -1.26218e-16 and
3.15544e-17 A. TS source currents likewise remain near zero.

Native node 10 moves from 5 to 4.999999999995 V at the first step, while TS
stays at 5 V. Native node 11 moves by -1.05856e-10 V, versus TS
-8.88178e-16 V. Under the native-only diagonal control node 10 stays at 5 V,
and first-step i(vdi) is +5.38719665e-15 A instead of -7.36795577e-12 A.
This intervention separates a changed numerical system from a primary
charge-history defect. It does not assert that all other fallback or
loaded-versus-accepted differences are fixed.

## Reduced RED and native control

`storage-write.cir` removes the transparent latch, decoder and their clocks
from gm17, retaining the constrained storage/access/write path and original
model cards. It reproduces 7.36878939 pA i(vdi) error at 1.6 ps. It is a
reduction, not a claim of globally minimal topology or parameter set.
Removing the storage coupling entirely (`write-cell.cir`) loses the pA
residual. Isolated NAND and inverter reductions also pass. The reduction's
supply current is another, larger floored loss and is retained honestly.

| Identical-byte experiment | Worst canonical score |
|---|---:|
| Original vs stock ngspice-47 | 0.0736790025443 i(vdi) |
| Reduced storage/write vs stock | 0.712888592221 i(vdd); i(vdi)=0.0736878939462 |
| Write-cell-only vs stock | 0.000147425143 i(vdd) |
| NAND-only vs stock | 0.000013423305 i(vdd) |
| Inverter-only vs stock | 0.000005368482 i(vdd) |
| Original vs native diagonal control | 0.000105427110 i(vad); i(vdi)=0.000063479516 |
| Reduced storage/write vs native diagonal control | 0.000680621245 i(vdd) |

`mos3-gm17-startup-1059.test.ts` pins native first-two-step currents on the
identical reduced deck. `ISSUE1059_GM17_RED=1` produces one real failure
(7.36878939461622e-12 > 1e-12) and one passing control. In normal CI mode the
stock-parity assertion is an executable expected failure (`it.fails`), not a
skip or false GREEN. The native-only control passes. With the existing MOS3
tests the receipt is 16 passing tests and one expected failure. No production
GREEN against stock ngspice is claimed.

## Unchanged-production regression receipts

Two independent paired passes use identical original bytes from corpus-l
commit `66d67caff2f10e4d6a36d2e59898cc52d661b98d`. No TS candidate was retained,
so before/after means repeated unchanged-production runs, not a speed claim.
All common signals are measured before choosing the worst; current/voltage
floors stay 1e-10 A / 1e-4 V, with the existing breakpoint-aware metric.

| Deck | Before | After | Worst signal |
|---|---:|---:|---|
| gm17 | 0.0736790025443 | 0.0736790025443 | i(vdi) |
| gm19 | 0.171645942596 | 0.171645942596 | i(vin) |
| gm2 | 0.128714113430 | 0.128714113430 | i(vdd) |
| mike2 | 0.0204541769101 | 0.0204541769101 | i(vtest1) |
| gm1 | 0.00898903507340 | 0.00898903507340 | i(vrd1) |
| gm3 | 0.000278852723695 | 0.000278852723695 | i(vin) |
| todd3 | 0.00237919445098 | 0.00237919445098 | i(vnd) |
| arom | 0.175255611374 | 0.175255611374 | v(31) |

The four issue losses and arom remain losses. Refs #1059 only; this evidence
does not complete the issue.

## Reproduce and verify

Measured on macOS 27.0.1 arm64, Apple M5 Pro, Node 22.23.1, ngspice-47.
The production baseline initially was `5e6bd263`; the lane was subsequently
rebased onto `48827496`. Production defaults are unchanged. Each waveform
capture stores input SHA-256 and both engine series. Derived decks and model
cards are GPL-3.0-or-later, with the existing upstream grant/notices retained
in `../issue-1059/licenses/xyce/`. The patch's modified ngspice files are
Modified BSD; the pinned upstream licensing document is `ngspice-COPYING`
(CC-BY-SA 4.0 document, includes the Modified BSD grant). Scripts are original
project work. No vendor/fetch-only material is introduced.

From repository root, use a fresh dedicated scratch TMPDIR. Install bison,
autoconf, automake and libtool if absent; on macOS put Homebrew bison first
on PATH. Native builds disable OpenMP to avoid unavailable omp.h. A fresh
source clone is pinned by commit, and only the two files in `native.patch`
are changed. The runner was exercised against a clean shared local clone of
the same source revision; rerunning it is idempotent.

```
pnpm install --frozen-lockfile
pnpm build
spice-heavy pnpm exec tsx benchmarks/results/issue-1059-gm17/probe.ts
spice-heavy bash benchmarks/results/issue-1059-gm17/native.sh
pnpm exec tsx benchmarks/results/issue-1059-gm17/analyze-native.ts
pnpm exec tsx benchmarks/results/issue-1059-gm17/trace.ts
ISSUE1059_GM17_RED=1 pnpm -C packages/core exec vitest run src/devices/mos3-gm17-startup-1059.test.ts
pnpm -C packages/core exec vitest run src/devices/mos3-gm17-startup-1059.test.ts src/devices/mos3.test.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1059-gm17/regressions.ts
spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
pnpm exec tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --types node benchmarks/results/issue-1059-gm17/*.ts
pnpm lint
spice-heavy pnpm test
```

Build, lint, scoped typecheck, targeted tests and guarded full tests pass.
The aggregate check does NOT pass: before this lane edited any registered
source, it failed preflight with stale source-registry AND fixture-tree pins
on baseline `5e6bd263`. `aggregate-receipt.txt` preserves that failure.
No aggregate execution, parity success or new baseline refresh is fabricated.
The final check failure is also retained; refreshing the aggregate is outside
this evidence-only slice. PR URL, exact head and exact-head CI run/check
receipts are in the PR and Kanban handoff.
