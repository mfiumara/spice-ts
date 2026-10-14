# MOS2 temperature admission (#995)

Production change: admit only MOS2 to Circuit's validated `.options TEMP` guard.
The existing mos2temp.c port required no law correction on these probes.
MOS3/MOS6 remain rejected at non-nominal circuit temperature.

## Raw temperature question

`python3 benchmarks/results/issue-995/probe.py` runs ngspice-47 on temporary
copies of the original gm6 deck, adding only diagnostic control commands.
`gm6-device125.log` and `gm6-plain125.log` report both `@mp2[temp]` and
`@mn3[temp]` as `1.250000000000000e+02`. The plain27 probe reports
`2.700000000000000e+01`. Device125 and plain125 OP node outputs are identical.
Thus ngspice interprets gm6's `.options device temp=125` as 125 C, not 27 C.
Original fixture bytes are untouched.

## Tests

`pnpm exec tsx benchmarks/results/issue-995/reference.ts` records ngspice-47
numbers for 18 original synthetic decks. Both polarities, TEMP=27/50/125,
model TNOM=50, no/direct/sheet resistance, reverse-biased junctions and
Meyer/overlap/bottom/sidewall capacitances are covered. Each records OP and
11 evenly spaced samples over a 100 ns smooth sinusoidal transient.
The generator uses the exact same deck as the test, with control commands
for export. The synthetic decks are original project work under MIT.

RED before the production edit: 12 failed, 24 passed (36 tests). All 18
direct device-law OP tests passed before changing the guard, so the failure
is the allowlist, not an unverified temperature-law discrepancy.
GREEN: 38 new tests including two non-admission checks, 123 targeted tests
across five files. No existing tolerance was edited. New OP assertions use
1e-12 + 1e-7 relative and transient assertions 1e-12 + 1e-4 relative uniformly.
The first RED attempt had incorrect result-property names; red.log records
the corrected behavioral reproduction, not that test-authoring error.

Targeted command:

```
pnpm -C packages/core exec vitest run src/devices/mos2-temperature-995.test.ts src/devices/mos2.test.ts src/devices/mos2-series-resistance-982.test.ts src/options-temp.test.ts src/temperature-ngspice-parity.test.ts
```

## Unchanged gm6 corpus runner

Baseline is origin/main e56f1c55324170b6b2103c7cdc3c9c5834e2e0b4.
Both engines receive SHA256
e0a5f86b6d1daebb364f3a156d2d2f411c9383bd61dbaca33bc2fae2692b3e70.
Source/licence remain corpus-k k-8, pinned Xyce_Regression
7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2, GPL-3.0-or-later;
see ../../SOURCES.md and ../../corpus/corpus-k/manifest.json.

```
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts --engine ngspice k-8 benchmarks/results/issue-995/ng.bin
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts --engine spiceTs k-8 benchmarks/results/issue-995/before.bin
pnpm exec tsx benchmarks/results/issue-995/gm6.ts before
# Build the fixed core, then:
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts --engine spiceTs k-8 benchmarks/results/issue-995/after.bin
pnpm exec tsx benchmarks/results/issue-995/gm6.ts after
```

All final commands exit 0. `before.json` is spice-ts-loss: no comparisons,
mp2 unsupported TEMP=125, worst error/signal null (not zero).
`after.json` is matched under the unchanged corpus rule (1% peak-normalized
absolute error): both engines OP=1, TRAN=223; 2 analyses, 20 signals;
worst normalized error 0.000172, worst signal `tran i(vnen)`.
222 transient points align; one is out of range. Full max/RMS absolute and
pointwise-relative metrics, including linear metrics, are in after.json.

Pointwise relative error is not the match rule and can be large near zero:
TRAN v(13) max relative 1.61157, RMS 0.148235; absolute max 6.18360e-5 V,
RMS 7.36674e-6 V. TRAN v(7) max absolute 3.70369e-4 V, RMS 4.26120e-5 V;
max relative 0.00352795, RMS 0.000630750.
TRAN i(vnen) max absolute 2.67454e-9 A, RMS 3.38499e-10 A;
max relative 0.00775109, RMS 0.000809143.
This is a scoped correctness result, not a speed or universal-parity claim.
No fixture, existing comparison tolerance, corpus outcome or aggregate refresh.

Local `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint` and the
targeted command exit 0. Full tests run only as `spice-heavy pnpm test`;
exact-head required GitHub checks remain the authoritative publication gate.
