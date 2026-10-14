# MOS6 invert6 residual diagnosis (#1083)

Diagnosis only, based on main `96b6044bffc3aa7d0dccb94fcc136a41455f6a2e`
(the #1112 squash). No production implementation changes, fixture edits,
threshold changes, or replacement corpus references. #1083 remains open.

## Reproduce

From the repository root, with ngspice-47, Node 22 and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm build
# Set TMPDIR to a private scratch directory before running these probes.
spice-heavy pnpm exec tsx benchmarks/results/issue-1083-residual/diagnose.ts
spice-heavy pnpm exec tsx benchmarks/results/issue-1083-residual/bias.ts
pnpm -C packages/core exec vitest run src/devices/mos6-invert6-residual-1083.test.ts src/devices/mos6-series-resistance-1083.test.ts
pnpm lint
spice-heavy pnpm test
```

The initial reproduction also used the existing single-deck corpus entry point:
`spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts --engine ngspice m-23 "$TMPDIR/1083-ng.bin"`
and the same command with `--engine spiceTs` / `1083-ts.bin` after building.
The first spice-ts attempt before building failed because `core/dist/index.js`
was absent; that infrastructure failure is not a simulator result.

`diagnose.ts` reruns both original m-23 and m-24 through the unchanged corpus
adapters and `reduceRow`, writing `original-parity.json`. Both are still
`mismatch`, worst normalized error **0.172**, v(vout) max absolute error
**0.8110172584553081 V**, corpus RMS **0.04395228726884042 V**. Original bytes
and source/licence provenance are already recorded in the corpus-m manifest
and `benchmarks/SOURCES.md` (Xyce MOSFET_ParamAliases); no new third-party
fixtures are added here. Derived diagnostic decks are written only to scratch.
Every individual experiment gives both engines identical deck bytes; hashes
are in `metrics.json`. Altered-deck results are diagnostics, not parity wins.

## First observable divergence

Diagnostic thresholds are 1 mV and 50 mV (1% of the nominal 5 V rail), applied
to linear ngspice interpolation at spice-ts accepted times. They do not replace
or relax the corpus metric. Times below are in microseconds.

| Signal / observable | First >1 mV | First >50 mV | TS / interpolated ng at first >50 mV (V) |
|---|---:|---:|---|
| original v(vout) | 4.503848458458369 | 7.503635195073706 | 0.3305827693751309 / 0.4821629222309154 |
| original v(in) | 4.501381580069446 | 10.501378772727359 | 4.401706566451713 / 4.339859397716085 |
| explicit NMOS drain prime nd | 4.503848458458370 | 7.503635195073711 | 0.3256172488755613 / 0.4777593191972105 |
| explicit PMOS drain prime pd | 4.503848458458370 | 7.503635195073711 | 0.3830336609112158 / 0.5338664399335754 |
| explicit NMOS source prime ns | 10.505000000000002 | none | max 0.001979083479166215 V |
| explicit PMOS source prime ps | 22.505000000000002 | none | max 0.001494615177887404 V |

Prime-node observations use a scratch copy expanded to explicit resistors and
named intrinsic nodes; no hidden ngspice nodes are assumed to be present in the
original raw export. Expansion reproduces original vout max error to about
18 nV. Thus prime-node topology is not the differentiator.

The grids already separate on the first falling edge: accepted index 86,
TS 1.5027150349698762 us versus ng 1.502714935640039 us (first index with
absolute time difference >1 fs). This is earlier than the material voltage
loss. It is not proof that the grid decision itself is the initiating bug:
a tiny load/history/convergence difference can cause the LTE decision to split.

At the worst original point both engines actually save the pulse corner:
TS t=0.000024010000000000002 s, vout=2.6045200148098373 V;
ng t=0.00002401 s, vout=1.793502756361089 V. This **0.811 V loss is not merely
an artifact of interpolating across different grids**. The regression includes
this literal raw reference in addition to the first-divergence bracket.

## Step-size and series-resistance controls

| Scratch variant | ng / TS points | vout max absolute error (V) | linear-grid RMS (V) |
|---|---:|---:|---:|
| original | 1885 / 1884 | 0.8110172584553081 | 0.04395523071527879 |
| TMAX=2 ns | 15291 / 15287 | 0.6272358525462565 | 0.007708733842251119 |
| remove RD/RS/RSH | 1890 / 1881 | 0.32655091382005375 | 0.017854111902617605 |
| remove RD/RS/RSH, TMAX=2 ns | 15291 / 15279 | 0.6287026549408581 | 0.009277338405452995 |
| remove intrinsic/overlap gate caps | 1802 / 1801 | 0.21654000152989106 | 0.005658163582272220 |
| TMAX=0.2 ns | 150120 / 150120 | 0.003990414884895266 | 0.0000439181735288518 |
| explicit resistor / prime-node expansion | 1885 / 1884 | 0.8110172763488226 | 0.04395523181166777 |

The fine step reduces max error by about 203x and RMS by about 1001x.
The 2 ns experiment alone would have been misleading: it reduces RMS but
retains large outliers; maxima are not monotonic with the altered grid.
Removing series resistance does not remove the loss. Removing gate caps
removes input error (max ~5.08e-12 V), but some output error survives with
junction/external capacitors. No one capacitance branch is established as the
sole cause. TMAX is capped in both engines; these are **not identical accepted
step-list replays**, and the original corpus reference remains unchanged.

## Matched-bias device controls

`bias.ts` copies the original model cards, strips series resistance, and
clamps intrinsic terminal voltages for five biases per polarity, including
cutoff, linear, saturation and inverse mode. ngspice `.op`/`.ac` exports
`@m1[cd]`, gm, gds, cgs and cgd. `bias.json` contains all ten literal reference
sets and TS values. Biases and cd are in the polarity domain. TS channel cd
excludes the bulk diode/GMIN current included by ngspice; full Meyer caps
include overlap, matching the installed ngspice-47 export.

Maximum absolute differences across these controls:

- cd: 4.41e-12 A (bulk diode/GMIN boundary, not a demonstrated channel loss)
- gm: 5.802175688691957e-20 S
- gds: 2.168404344971009e-19 S
- cgs: 3.534096855390133e-28 F
- cgd: 5.048709793414476e-29 F

This excludes a large static channel/Meyer equation mismatch at these biases;
it does not establish correctness at every transient iterate or of charge
history integration. The probe calls the existing private Meyer evaluator
via a diagnostic-only type cast, without modifying the device implementation.

## Hypothesis and next fix boundary

Evidence favors **adaptive transient load/charge-history/convergence/LTE
trajectory divergence**, not RD/RS topology or a large static MOS6 equation
error. It is a hypothesis, not a proven single faulty operation or an ngspice
bug. A generic solver/model-history fix must first trace the earliest split;
this PR deliberately makes no such fix.

Source inspected: upstream `imr/ngspice` tag `ngspice-47`, commit
`a80f6e3e95d51534905b1f23410a951802666656`:

- [mos6load.c L197-L249](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6load.c#L197-L249): predictor terminal states versus general Newton load.
- [mos6load.c L276-L326](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6load.c#L276-L326): bypass/convergence and cached gate caps.
- [mos6load.c L703-L715](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6load.c#L703-L715): junction NIintegrate and current folding.
- [mos6load.c L755-L798](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6load.c#L755-L798): current/accepted Meyer half-capacitance combination.
- [mos6load.c L820-L839](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6load.c#L820-L839): predictor extrapolates gate charge; ordinary load advances charge from voltage increment.
- [mos6trun.c L21-L26](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos6/mos6trun.c#L21-L26): truncation uses qgs/qgd/qgb.

Compare TS `mos6.ts` stampTransientCharge/acceptTransientStep/truncateTransientStep
and `charge-state.ts`, together with transient predictor/Newton acceptance.
Recommended next slice: native/TS per-load trace around 1.5017..1.5028 us,
recording terminal voltages, mode, ids/gm/gds, half caps, q/cq histories,
iteration acceptance and CKTterr result. Replay matched accepted steps if
needed to distinguish history semantics from acceptance/bypass/LTE decisions.
Do not jump straight to changing the static equations or adding a deck-specific
step cap. No changes to #1105/MOS1 evidence are made here.

## RED and verification receipts

The first-divergence test was initially an ordinary `it` and was run before
any implementation edits (there are none):

```text
pnpm -C packages/core exec vitest run src/devices/mos6-invert6-residual-1083.test.ts
FAIL: expected 0.1515801528557844 to be less than 0.05
Test Files 1 failed; Tests 1 failed; exit 1
```

It is retained as `it.fails`, alongside an actual shared-breakpoint expected
failure and a normal execution/reproduction guard. Fixture loading and
simulation happen in `beforeAll`, outside the expected-failure body, so an
unrelated simulation failure cannot satisfy the expected-fail contract.

```text
Targeted: Test Files 2 passed; Tests 26 passed | 2 expected fail (28); exit 0
pnpm build: exit 0 (existing CJS import.meta / browser externalization warnings)
pnpm lint: exit 0
```

Full-suite and exact-head CI receipts are recorded in the PR and Kanban handoff.
No speed claim: probe wall time includes multiple engines/export and is
host-load dependent. The diagnostic changes do not alter simulator output;
before and after original-fixture parity remains the same published loss.
