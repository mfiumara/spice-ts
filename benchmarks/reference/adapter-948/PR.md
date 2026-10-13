## What and why

Refs #948, criterion 2 only. Do not auto-close the umbrella issue: the mutually accepted subset and EKV implementation remain downstream work.

Add one canonical circuit per fixture, shared ordinal analysis projections for native ngspice/Xyce, standalone OP CSV support, static control lowering, shared DEVICE TEMP/TNOM/GMIN mappings, and ahkab DC source syntax. No fixture-name special cases, solver tolerance tuning, model parameter deletion, simulator changes, or aggregate ledger regeneration.

Unknown or non-equivalent solver settings remain unsupported on original bytes. Ignored-statement warnings become explicit transformed-with-loss rows. Native execution/netlist/export/parse failures are separately classified and never used as convergence evidence. Both references get exactly the same projected circuit; only output directives differ, checked byte-for-byte offline.

## Evidence

All 100 fixtures are retained in `benchmarks/reference/adapter-948/report.json`. Exact original/canonical/projected hashes are in `benchmarks/reference/adapter-948/hash-manifest.json`. Actual inputs and complete native stdout/stderr are committed beside the report.

| Count | Before (immutable PR953 bootstrap) | After (canonical all-100 rerun) |
| --- | ---: | ---: |
| Attempted | 100 | 100 |
| Xyce success / native failure / adapter unsupported | 28 / 2 / 70 | 30 / 16 / 54 |
| ngspice success / native failure | 52 / 48 | 63 / 37 |
| Compared fixtures | 19 | 26 |

After uses a stricter policy: every ordinal analysis must export numeric data, and neither reference may warn about ignored/unsupported semantics. Before selected one non-OP analysis and retained warning-bearing comparisons. These are coverage counts under documented policies, not a like-for-like parity score or a speed claim. After retains 54 unsupported, 9 transformed-with-loss, and 11 native-failure fixtures separately from 26 comparable fixtures.

Measured with XyceNF 7.10.0 and ngspice-47. See `benchmarks/reference/adapter-948/README.md` for exact policies, dialect boundaries and remaining losses. `adapterSourceHashes` pins the executed uncommitted adapter snapshot, so offline CI verifies the receipt against the eventual PR head.

## How to test

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
pnpm -C packages/core exec vitest run --config ../../benchmarks/reference/vitest.config.ts
pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts
spice-heavy pnpm test
export XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce
spice-heavy pnpm exec tsx benchmarks/reference/expanded.ts --output-dir benchmarks/reference/local-rerun
```

Local build/lint/guarded full suite pass. Eight targeted Vitest tests and 18 live/offline node tests pass. RED, GREEN, native/offline verification, build/lint/full-suite and guarded corpus logs are under `benchmarks/reference/adapter-*.log`. Existing offline CI invokes the new Vitest checks and verifies all 100 saved hashes; live Xyce tests skip unless XYCE_BIN is set.

No SOURCES.md or Linux/container script edits. Independent spice-ts-review must accept the exact PR head before a supervisor may merge. No release/NPM/tag action.
