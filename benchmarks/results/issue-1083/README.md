# MOS6 series resistance (#1083)

## Result

RD/RS and explicit RSH*NRD/NRS now expand into linear resistors in front of the MOS6 intrinsic drain/source. This is shared by OP, AC and transient analyses. RD/RS take precedence over sheet resistance, including explicit zero (an open prime terminal when the sheet topology creates one). Conductance scales with M. The bulk remains connected to the external source when omitted.

Both original corpus-m fixtures m-23 (`invert6.cir`) and m-24 (`invert6_alt.cir`) execute. Neither matches ngspice-47. Issue #1083 stays open for the remaining transient mismatch. No fixture bytes, uniform thresholds, integration options or model equations were tuned.

## Source boundary

ngspice-47 tag a80f6e3e95d51534905b1f23410a951802666656:

- [mos6set.c lines 118–173](https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos6/mos6set.c#L118-L173) creates the prime nodes. Unlike MOS1/MOS2, it does not default omitted drain/source squares before topology setup. Omitted or zero squares therefore suppress a sheet-only prime node.
- [mos6temp.c lines 288–326](https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos6/mos6temp.c#L288-L326) gives explicit RD/RS precedence, including zero conductance for explicit zero. Its later reset of omitted/zero squares to one cannot create a missing prime node.
- [mos6load.c lines 925–949](https://github.com/imr/ngspice/blob/ngspice-47/src/spicelib/devices/mos6/mos6load.c#L925-L949) stamps linear series conductances multiplied by instance M, while channel/junction/charge terms use the prime nodes.

OP references were measured with `SPICE_ASCIIRAWFILE=1 ngspice -b -r <raw> <deck>` using the regression test decks with only `.AC` removed. AC verification compares the model resistance deck against an explicit-resistor deck, not against ngspice: the combined OP/AC synthetic direct-resistance deck encountered an ngspice singular AC matrix. No AC parity claim is made here.

Original corpus deck provenance remains in `benchmarks/SOURCES.md` and `benchmarks/corpus/corpus-m/SOURCES.md` (Xyce regression revision 7bb7e98f0ed3, GPL-3.0-or-later).

## RED and GREEN

RED commit `984c2c2b` is based on main `0c63eac16234058fa1119fc6bb9361293fc130d4`.

```
pnpm install --frozen-lockfile
pnpm -C packages/core exec vitest run src/devices/mos6-series-resistance-1083.test.ts
```

RED: 15 tests, 13 failures. All 13 failures are unsupported RD/RS/RSH rejection errors. The two all-zero controls pass.

After the fix:

```
pnpm -C packages/core exec vitest run src/devices/mos6-series-resistance-1083.test.ts src/devices/mos6.test.ts src/devices/mos6-trap-ringing-461.test.ts src/devices/mos2-series-resistance-982.test.ts src/devices/mos1-series-resistance-719.test.ts
pnpm build
pnpm lint
pnpm exec tsx --test benchmarks/corpus/corpus-m/corpus-m.test.ts
```

GREEN: 59 tests across 5 files pass, including 25 new MOS6 tests. OP literal references cover direct/sheet resistance, multiplicity, omitted/zero squares, and explicit zero open terminals. Other tests cover OP/AC explicit-resistor equivalence, transient charge equivalence, PMOS, inverse NMOS and omitted-bulk topology. Build and lint pass; both corpus offline checks pass.

## Before/after corpus-m

Both runs use the identical original corpus-m manifest and uniform comparison rules:

```
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts
```

The valid baseline restored the three production files (`circuit.ts`, `mos6.ts`, `mos6.test.ts`) from RED commit `984c2c2b`, rebuilt core with `pnpm -C packages/core build`, then ran the harness. The after run restored HEAD `f0022cb2`, ran `pnpm build && pnpm lint`, and reran the harness. The baseline harness reads HEAD for its coreTree field, so the compact before/after receipt records the actual restored source commit instead. An earlier baseline attempt lacked built dist artifacts and was discarded; it is not used as evidence.

| Metric | Before | After |
|---|---:|---:|
| Fixtures | 24 | 24 |
| ngspice success | 24 | 24 |
| spice-ts success | 21 | 23 |
| spice-ts failed | 2 | 0 |
| spice-ts unsupported | 1 | 1 |
| matched | 15 | 15 |
| mismatch | 6 | 8 |
| spice-ts loss | 3 | 1 |

Only m-23 and m-24 change outcome, from rejected to mismatch. Both have identical waveform metrics:

| Metric | m-23 | m-24 |
|---|---:|---:|
| Worst normalized error, tran v(vout) | 0.172 | 0.172 |
| v(vout) max absolute error (V) | 0.8110172584553081 | 0.8110172584553081 |
| v(vout) RMS absolute error (V) | 0.04395228726884042 | 0.04395228726884042 |
| v(vout) max relative error | 18.13790808703647 | 18.13790808703647 |
| v(vout) RMS relative error | 2.6605549224218454 | 2.6605549224218454 |
| Aligned points | 1884 | 1884 |
| ngspice cold engine-group wall (ms) | 1772.1948330000014 | 1824.3738339999982 |
| spice-ts cold engine-group wall (ms) | 4896.7384170000005 | 4522.590333999979 |

Full signal metrics and runtimes are in corpus-m/outcomes.json. Relative errors near zero reference values are not the normalized verdict metric. Runtime includes startup/adapter/export on a shared host, not solver-only time. No speed-superiority claim is made. Remaining mismatch investigation is outside this series-resistance slice.
