# MOS1 invert1 transient diagnosis (#1080)

Evidence-only slice. Refs #1080; the original corpus loss is NOT fixed.
No production device, parser, shared transient, MOS2, MOS3, BJT, or homotopy
code changed. No original fixture or corpus tolerance changed.

## Reproduction and scope boundary

Base: origin/main `1556ca0e`. RED commit:
`f97b8fe41d7a27fffd1d684dc398c809be3efb5c`.
The unmarked test at that SHA fails with supply-current error
0.00021085591881515962 A at the exact 19.505 us pulse corner; the limit
was 0.0000179 A. The final test retains this as `it.fails` and independently
checks that the corner exists and reproduces the recorded actual current.
This is GREEN evidence bookkeeping, not GREEN simulator parity.

The unchanged m-18 original deck reproduces the published normalized 0.249
supply-current gap exactly. Its largest voltage and current errors occur at
later switching edges, not at the initial DC point. Supply current at
19.505 us is -0.0013664114551422994 A versus ngspice-47
-0.001577267373957459 A.

The directory's probe changes only TMAX, identically for both engines.
These are explicitly adapted diagnostic decks, not new corpus scores:

| Input | Worst normalized | i(vdddev) max absolute A | RMS absolute A | max relative | RMS relative |
|---|---:|---:|---:|---:|---:|
| original `.tran 20ns 30us` | 0.249 | 4.459265790256867e-4 | 1.929833451751002e-5 | 129.0650784639518 | 3.2327236462193327 |
| same deck, TMAX 1ns | 0.189 | 3.035252881899927e-4 | 5.959006610578309e-6 | 1772.6449109344599 | 33.49224742416805 |
| same deck, TMAX 0.2ns | 0.000794 | 1.5303635587519179e-6 | 8.56322542190412e-9 | 0.7110146486847856 | 0.0053202392717322956 |

Relative errors near zero are not suppressed. Full unchanged comparison
metrics and largest-error matched-time samples are in `probe.json`.
The TMAX result strongly localizes this to coarse adaptive transient
stepping/history sensitivity rather than a gross static model/alias error.
It does NOT prove which shared driver/history policy is responsible, nor
exclude a MOS1 loading/history discrepancy exposed only on coarse steps.
A native per-iteration trace is still needed before a generic fix. In
particular, do not replace the original benchmark with the fine-step run.

## Source audit

The fixture uses canonical MOS1 names (despite its ParamAliases directory).
All channel parameters VTO/KP/GAMMA/PHI/LD are explicitly specified; UO,
NSUB/NSS/TPG do not override those explicit values. Instance L/W are explicit.
TOX defines Cox; overlaps use W for CGDO/CGSO and L-2LD for CGBO.
CBD/CBS override CJ*area; unspecified areas and perimeters are zero, so CJ,
CJSW and JS are inactive here. RD/RS produce intrinsic prime nodes.

Inspected ngspice-47 source from
https://github.com/imr/ngspice/tree/ngspice-47/src/spicelib/devices/mos1:

- mos1load.c SHA-256 `7d411e939a28c5893026ab1ad1805d8a9e1cea7171d39b562136eecd7d0867de`
- mos1temp.c SHA-256 `daed30942e00c0e0a360582e6be46103a957919f9d55da724d3a0f7a7dcfe31b`
- mos1par.c SHA-256 `07313d7e0c28df2c85376b6c9db93b29f8c1c1e92abd13c3ef2761a1bb9842f6`
- mos1set.c SHA-256 `dbbe00808daa5bc2f2d34c7c6f59afe9a4fb9044a1f08d44fa3599e432cabb89`

`mosfet.ts` constructor/applyTemperature/evaluateCharges already implements
these explicit parameter paths. mos1load.c 754-786 maps inverse Meyer caps
and averages current/previous half-capacitances plus overlaps; 809-874
handles predictor charge and integrated companions. These are the remaining
native-state comparison boundaries, not an established parameter-mapping fix.
No ngspice C source is redistributed; its Berkeley notices/COPYING apply.
The original Xyce fixture is GPL-3.0-or-later, pinned and licensed already in
`benchmarks/SOURCES.md` and `benchmarks/corpus/corpus-m/SOURCES.md`:
SHA-256 `a25f498f542c6b3e62d5ca10ee4f6aadc6ad05e05ac5b49123c41e54f928abd2`.
The diagnostic runner and tests are original MIT project work; measurements
are generated output, not copied upstream reference data.

## Public before/after

`corpus-before.json.gz` is the committed base report. The full 24-deck corpus-m
rerun is published in corpus-m/outcomes.json. `corpus-delta.json` lists EVERY
row: zero outcome/score changes. m-18 stays 0.249, with unchanged max/RMS errors.
All 6 mismatches and 3 losses remain. Timing fields are cold process-group
wall receipts, not a speed claim. No 100-deck aggregate refresh was run.

## Commands and receipts

- `pnpm install --frozen-lockfile`
- `spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts`
- `spice-heavy pnpm exec tsx benchmarks/mos1-invert1-1080/probe.ts`
- `pnpm -C packages/core exec vitest run src/devices/mos1-invert1-1080.test.ts`
  at RED: 1 failed, expected numerical assertion (`red.log`).
- `pnpm -C packages/core exec vitest run src/devices/mos1-invert1-1080.test.ts src/devices/mos1-series-resistance-719.test.ts src/analysis/transient-mos1-predictor-878.test.ts`
  final: expected-failure loss and companion guards (`targeted.log`).
- `pnpm -C packages/core build` and `pnpm -C packages/core lint`: exit 0,
  `build.log` / `lint.log`.
- `pnpm exec tsx --test benchmarks/corpus/corpus-m/corpus-m.test.ts`:
  `corpus-guards.log`.
- `pnpm exec tsx --test benchmarks/mos1-invert1-1080/receipt.test.ts`:
  2 passing receipt guards (`receipt-tests.log`).
- `pnpm build` and `pnpm lint`: exit 0 (`monorepo-build.log`,
  `monorepo-lint.log`).

Full monorepo gate is delegated to exact-head GitHub CI. Independent review
must treat this as evidence-only and keep #1080 open. Supervisor follow-up:
trace native and TypeScript loaded/accepted Meyer charge, capacitor current,
Newton/bypass state and timestep/order around the 19.505 us corner before
assigning any shared integration change. This card stops at that ownership
boundary instead of modifying the shared lane.
