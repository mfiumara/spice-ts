# Subcircuit-local model expressions (#882)

The fix evaluates body `.param` definitions in dependency order **before** registering that instance's `.model` cards. It substitutes the complete model card in the resulting scope before tokenization and compatibility translation. Nested definitions use their enclosing instance's scope; different X-line overrides produce different local models. Undefined expressions report a `ParseError` at the model card; cyclic dependencies report the defining `.param` card.

## Self-written reductions (MIT)

`784.cir` uses FLWF; `738.cir` uses FLW. They reduce the syntax of the vendor-library blockers, not the vendor circuits themselves. Both engines receive identical netlists without tolerance overrides.

```
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsx benchmarks/subckt-model-expressions-882/compare.ts
pnpm -C packages/core exec vitest run src/parser/subckt-model-expressions-882.test.ts src/parser/subckt-param-order-857.test.ts src/subcircuit-model-scope-854.test.ts
```

Baseline: ac0d03dffe7a38927cbc43a7d42a4acd618e1c02 (merged #884). `before.json` uses that baseline's source entry and the same comparison harness. `after.json` is the fixed implementation. These are single-run receipts, not speed benchmarks.

| Reduction | Baseline spice-ts | Fixed spice-ts | ngspice-47 | Absolute max / RMS v(a) error after | Relative max / RMS after |
|---|---|---|---|---|---|
| #784 FLWF | Cannot parse number `{pwr(flwf,0.5)/1e11}` | converged | converged | 3.7850113823179043e-6 V | 4.551783325649582e-6 |
| #738 FLW | Cannot parse number `{pwr(flw,0.5)/1e11}` | converged | converged | 3.7850113823179043e-6 V | 4.551783325649582e-6 |

Fixed spice-ts v(a)=0.8315409330750719; ngspice-47 v(a)=0.8315447180864542. Both reduced models have IS=1e-16 and KF=sqrt(1e-3)/1e11; `ngspice -b 784.cir` prints KF=3.16228e-13. **This is not exact diode OP parity.** The regression asserts expression-vs-literal model equivalence and model values, not a widened voltage tolerance. No device physics, solver tolerances or fixtures were changed to remove the residual. Baseline voltage max/RMS metrics are null because the parser could not run.

TDD: the initial 9 tests all failed on baseline; all 10 final tests pass (added resistor model validation coverage). Combined #857/#854 focused regression: 27/27 pass. Complete parser subtree plus #854: 50 files, 1234 tests pass (`--maxWorkers=2`).

## Original vendor circuits: losses retained

The fetched vendor files are not redistributed. See `benchmarks/corpus/ngspice-bugs/tickets/{784,738}/README.md` and `benchmarks/SOURCES.md` for source/licence decisions. Hash-verified downloads:

```
pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 784 738
mkdir -p benchmarks/corpus/ngspice-bugs/fetched/784/extracted
/usr/bin/tar -xf benchmarks/corpus/ngspice-bugs/fetched/784/question.7z -C benchmarks/corpus/ngspice-bugs/fetched/784/extracted
python3 -c "import zipfile; zipfile.ZipFile('benchmarks/corpus/ngspice-bugs/fetched/738/Test.zip').extractall('benchmarks/corpus/ngspice-bugs/fetched/738/extracted')"
pnpm exec tsx benchmarks/subckt-model-expressions-882/vendor.mts
# Optional baseline source entry argument, from an isolated checkout of ac0d03df:
pnpm exec tsx benchmarks/subckt-model-expressions-882/vendor.mts /path/to/baseline/packages/core/src/index.ts
```

The runner preserves original bytes except Windows include-path relocation, writes `.receipt-882/ngspice/<ticket>/<deck>` for the ngspice run, and records original/local SHA-256. It passes the exact local deck to spice-ts with a filesystem include resolver. `vendor-before.json` and `vendor-after.json` contain measured outcomes on identical local hashes:

| Original fixture | Before | After | Waveform max/RMS |
|---|---|---|---|
| #784 base_159.cir | Cannot parse number `{PWR(FLWF,0.5)/1E11}` | ParseError line 545: Expected `)` in behavioral expression, single `|` in `IF((V(OLN,COM)>10E-3 \| V(OLP,COM)>10E-3),1,0)` | null, unsupported |
| #784 variant_159.cir | same KF parser blocker | same single-`\|` behavioral blocker | null, unsupported |
| #738 OP1177ARM_OPA818.cir | Cannot parse number `{PWR(FLW,0.5)/1E11}` | Undefined variable `TEMP` downstream | null, unsupported |

`vendor-ngspice.json` records an actual `spice-heavy`-gated LTPS ngspice-47 rerun of those identical local decks: #784 base and variant each succeed (exit 0, 141 AC rows); #738 fails (exit 1, 814 transient rows, `Timestep too small` at t=1.30176e-5 s, `d.xu12.d1`). Set `ngbehavior=ltps` and `filetype=ascii` in each run directory's `.spiceinit`, then run `spice-heavy ngspice -b -r out.raw <deck>` from that directory. Both #738 engines still fail for different reasons.

These circuits are **not** counted as parity wins. Downstream behavioral/temperature gaps are handed to the supervisor rather than expanded into this model-expression fix. No corpus manifest/aggregate outcome or vendor bytes are changed.

Local `pnpm build` and `pnpm lint` pass. `spice-heavy pnpm test` returned 1 under shared host load: 12 test timeouts and 8 worker-start timeouts, 3275 passing tests. The bounded parser run above passes all 1234 tests, including the 1M-value tokenizer test that timed out in the unrestricted full run. Exact-head GitHub CI is the authoritative full-suite gate.
