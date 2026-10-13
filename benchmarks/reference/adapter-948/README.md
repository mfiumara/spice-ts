# Canonical reference adapter expansion (#948 criterion 2)

This is an adapter capability receipt, not an EKV implementation, a speed result,
or completion of issue #948. No simulator changes or aggregate ledger regeneration.

## Measured coverage

Before is the immutable PR #953 bootstrap receipt, `../corpus-report.json`.
After is the all-100 rerun using XyceNF 7.10.0 and ngspice-47 on macOS arm64.
Every original fixture remains in manifest order, including failures and unsupported rows.
The stricter after policy requires numeric output for **every** projected analysis,
and no ignored/unsupported semantics warning from either reference. Before selected
one non-OP analysis and did not exclude ignored-statement warnings. These counts
measure coverage under those stated policies, not a like-for-like correctness score.

| Count | Before (bootstrap receipt) | After (canonical rerun) |
| --- | ---: | ---: |
| Attempted fixtures | 100 | 100 |
| Xyce numeric success | 28 | 30 |
| Xyce native failure | 2 | 16 |
| Xyce adapter unsupported | 70 | 54 |
| ngspice numeric success | 52 | 63 |
| ngspice native failure | 48 | 37 |
| ngspice adapter unsupported | 0 | 0 |
| Compared fixtures | 19 | 26 |

After eligibility buckets are 26 comparable, 54 adapter-unsupported, 9
transformed-with-loss, and 11 native-failure fixtures. Xyce native failures contain
21 netlist and 6 export failures across analysis runs. ngspice has 40 execution
and 3 export failures across analysis/diagnostic runs. These are not numeric
error-threshold failures or evidence of convergence failure.

There are 72 supported ordinal analysis runs across 46 fixtures. Unsupported
fixtures get a diagnostic ngspice run on unchanged original bytes, not a
half-transformed control program. An Xyce numeric success on fallback `v(0)`
when ngspice export fails is retained but is **never** compared.

`report.json` contains the complete per-fixture rows, ordered analyses, exclusion
reasons and per-signal max/RMS absolute/relative metrics. No failed or unsupported
row has been removed. Lossy numeric results are separately labelled partial comparisons.

## Shared-input contract

`canonical.ts` constructs one canonical circuit per fixture. Xyce cannot export
DC/AC/TRAN together in one run: live probing returned inconsistent analysis/print
errors. Therefore each canonical circuit is projected to its original ordinal
analysis, and **both references receive that identical projection**. No component,
model, source value, solver setting or analysis argument differs between engines.
Repeated static analyses are retained by ordinal, not deduplicated. Analyses do
not inherit the previous run's solution. Stateful/conditional control semantics,
sequential parameter changes and mixed static/executed analysis programs fail closed.

The sole engine-specific input additions are Xyce CSV `.print` cards and
ngspice raw-output argv/ASCII output configuration. Each projection records exact
output directives, input paths and SHA-256 values. The offline verifier removes
only the added `.print` and checks byte-for-byte equality with ngspice input.

Mechanical rules, with no fixture-name branches:

- Standalone `.op` exports via Xyce `.print DC`. Both parsers return one sample
  on a synthetic zero grid.
- A single static `.control` block's analyses become dot cards. A single `run` uses existing
  static analyses. Output-only display/print/plot/listing/echo and terminal
  cleanup commands are recorded and removed. `alter`, `let`, conditional flow,
  solver `set`, repeated `run`, and mixed static/executed analyses are unsupported.
  Multiple `.control` blocks are always unsupported: circuit-global termination,
  cleanup and `run` state cannot be proven by independent static projections.
  Rejection is atomic, retains original bytes, and disallows every projection.
- `.print`, `.plot`, `.save`, `.probe`, listing/width/status cards and their
  continuations are removed from the shared deck before engine output is added.
- Bookkeeping `.options` flags ACCT/NOACCT/LIST/NODE/POST/TRANS/NOPAGE are removed
  with an explicit change record. TEMP/TNOM/GMIN map to the shared
  `.options DEVICE` spelling. `.temp <single-value>` maps to DEVICE TEMP.
  Live tests demonstrate that ngspice's mapped values match its original options
  exactly and Xyce accepts them without ignored-card warnings. A diode temperature
  probe also demonstrated why emitting `.temp` unchanged is unsafe: Xyce ignores it.
- All other solver options, including RELTOL/ABSTOL/VNTOL/METHOD/ITL settings and
  native TIMEINT/NONLIN settings without a proven shared equivalent, remain in
  their original bytes and are marked unsupported. No tolerance is dropped or
  tuned. Xyce NONLIN ABSTOL is a residual norm, not ngspice's current ABSTOL;
  transient TIMEINT tolerances are not ngspice's global nonlinear tolerances.
  Sharing a name is not proof of equivalent semantics.
  Definitions are in the [Xyce 7.10 Reference Guide](https://xyce.sandia.gov/download/2068/?tmstv=1754510749),
  Table 2-6 (p.104), sections 5.1/5.2 (pp.839-840), and the approximate PSpice
  mapping caveats in section 6.1. Compare ngspice's
  [current ABSTOL and voltage VNTOL definitions](https://nmg.gitlab.io/ngspice-manual/analysesandoutputcontrol_batchmode/simulatorvariables__options/dcsolutionoptions.html).
- ahkab V `type=vdc vdc=<value> [vac=<value>]` and I
  `type=idc idc=<value> [iac=<value>]` map to DC/AC source values verbatim.
  Unrecognized assignments, duplicate TYPE markers and additional waveform
  types fail closed. ahkab model syntax and key/value analysis syntax are not
  silently downgraded. Missing `.end` is appended for both engines on supported decks.
- Device and model parameters are never removed. Actual ignored-parameter warnings
  mark the row transformed-with-loss and retain its diagnostic partial comparison,
  separate from eligible comparisons. All warnings and full native stdout/stderr
  are committed, including failed runs.

Failure classification distinguishes translation, execution, netlist, export and
parse. Export/parse/netlist failures have `convergence: not-run`; other execution
failures have `convergence: unknown`. No failed native export is labelled as a
convergence failure. Strict CSV and native ASCII raw validation reject missing,
truncated and nonfinite data before metric computation.

## Evidence and commands

- `report.json`: all 100 rows, ordered projections, statuses, warnings, max/RMS
  absolute and relative waveform metrics, series hashes, original/canonical hashes.
- `hash-manifest.json`: all 100 original/canonical hashes plus shared/Xyce input hashes.
- `<corpus>/<fixture>/canonical.cir`, ordinal `.cir`/`-xyce.cir`, and native logs:
  the exact inputs and complete stdout/stderr used by the rerun.
- `../adapter-red.log`: failing OP/control tests before the fix.
- `../adapter-green.log`: 8 targeted Vitest transform/export tests pass.
- `../adapter-native-tests.log`: 18 node tests pass, including live OP/DC/AC/TRAN,
  option-setting checks, historical bootstrap verification and all-100 hash/input checks.
- `../adapter-build.log`, `../adapter-lint.log`, `../adapter-full-tests.log`:
  successful build/lint and guarded full monorepo test execution.
- `../adapter-run.log`: per-fixture progress and computed before/after totals.

The receipt's `head` is the base commit at measurement time, before the adapter
was committed. `adapterSourceHashes` pins the exact executed adapter files, checked
by the offline verifier at the eventual PR head. `beforeReportSha256` pins the
unchanged baseline. No historical receipt was regenerated.

```sh
export XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce
pnpm install --frozen-lockfile
pnpm build && pnpm lint
pnpm -C packages/core exec vitest run --config ../../benchmarks/reference/vitest.config.ts
pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts
spice-heavy pnpm test
spice-heavy pnpm exec tsx benchmarks/reference/expanded.ts
# For a fresh audit without overwriting the committed evidence:
spice-heavy pnpm exec tsx benchmarks/reference/expanded.ts --output-dir benchmarks/reference/local-rerun
```

The existing offline CI reference test gate invokes the targeted Vitest cases and
checks every saved input/output hash, so no CI workflow change or Xyce installation
is needed for offline verification. Live checks are enabled only with XYCE_BIN.

Provenance is unchanged. Original fixtures and redistribution licences are recorded
in `benchmarks/SOURCES.md` and the five corpus manifests. These canonical copies
are mechanically derived from those licensed originals. No new source was imported,
so SOURCES.md, Linux/container installation scripts, and sibling lanes are untouched.

## PR #965 cross-block remediation

Review rejected `342d9bd1ddd7bc11f266063d8793a97c78baf6ee` because a later
`.control` reset the terminal flag after `quit`, inventing an unreachable DC
analysis. Rather than special-case that deck, the adapter now rejects all
multi-block control programs. This also excludes apparently simple multiple
blocks until circuit-global execution and plot/circuit cleanup have a proven
static model. Established single-block OP, ordered analyses and `run` lowering
remain covered and supported.

`../remediation-red.log` reproduces the failure before the fix;
`../remediation-green.log` passes all 9 targeted tests. The new regression checks
quit followed by another block, cross-block remcirc/destroy/run, repeated runs,
plain multiple-analysis blocks and an empty first block, including exact CRLF
and trailing-whitespace preservation and rejection of every ordinal projection.
`../remediation-live.log` passes 19 node tests with native tools enabled, including
ngspice's actual OP-only execution after quit (later DC never reached).
`../remediation-offline.log` passes 11 tests, with 8 live tests skipped.

The guarded all-100 rerun refreshed `report.json`, source/output hashes and native
logs. `../remediation-comparison.log` records comparison against the rejected
head's receipt: all 100 fixture outcomes, transformations, losses and eligible
and partial metrics are identical. Counts remain Xyce 30/16/54, ngspice 63/37,
26 comparable, 54 unsupported, 9 transformed-with-loss, 11 native-failure.
No fixture in this subset depended on multi-block lowering. The immutable
bootstrap `../corpus-report.json` was not regenerated; its SHA-256 remains
`1615dbc03728fc3a9cb2aaaec6e06c8dfb7f45e0e8aa1b7fbd67b5a4446f916f`.

`../remediation-build.log` and `../remediation-lint.log` record passing gates.
The initial guarded full suite passed before the additional live regression;
the final rerun (`../remediation-full-tests.log`) exceeded the terminal's
420-second tool limit under shared host load, with no failed assertion reported
before termination. Required GitHub CI on the final exact head is the full gate;
the timeout is not reported as a passing final full suite.

Remaining unsupported settings, control programs, hierarchical output names,
ahkab waveform/model dialects and native model gaps are explicitly retained in
`report.json`. Growing a mutually accepted subset and EKV implementation belong
to the downstream cards, not this PR. No reference disagreement proves model
equivalence or superiority.
