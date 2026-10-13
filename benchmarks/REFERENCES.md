# Reference simulators

## Xyce 7.10.0 bootstrap (#948)

This is a reference-bootstrap slice, not completed EKV support or a claim of
100 mutually accepted circuits. No spice-ts simulator code changes. Issue #948
and EKV implementation issue #4 remain open.

### Verified macOS arm64 serial installation

Measured executable version: `XyceNF Release 7.10.0`.
Upstream executable package, GPL-3.0-or-later:
https://xyce.sandia.gov/downloads/executables/.
Pinned serial download:
https://xyce.sandia.gov/download/1952/?tmstv=1754510116.
ZIP SHA-256: `06cd438e0a3d4dc86948c1d0f6684fa125db3dfa1776ff1d9339ebb77865754b`.

```sh
python3 benchmarks/reference/install-xyce-macos.py ~/.hermes/cache/scratch/xyce-7.10
export XYCE_BIN=$HOME/.hermes/cache/scratch/xyce-7.10/install/bin/Xyce
"$XYCE_BIN" -v
```

The script verifies the hash, expands the package headlessly with `pkgutil`,
and merges both package-component payloads into the requested prefix. Both
components are required: the executable and `libxyce.dylib` are separate.
`@rpath/../lib` permits relocation. It runs no installer scripts, uses no sudo,
and does not modify `/usr/local`. The identical script was exercised using
`~/.hermes/cache/scratch/xyce-948`; live DC/TRAN/AC tests and EKV decks ran there.
This installs Sandia's serial build, not a locally compiled binary.

### Pinned source recipe for Linux (not yet executed)

`benchmarks/reference/build-xyce-serial.sh` follows upstream Xyce 7.10's CMake
build guide, with MPI and Fortran disabled, and two compilation jobs by default.
Sources are pinned to actual commit SHAs:

| Dependency | Release | Commit |
| --- | --- | --- |
| SuiteSparse | 7.8.3 | `d3c4926d2c47fd6ae558e898bfc072ade210a2a1` |
| Trilinos | 14.4.0 | `975307431d60d0859ebaa27c9169cbb1d4287513` |
| Xyce | 7.10.0 | `a592a42ae7472151d1c8e3bca0ca62d27476f2f3` |

The Xyce release tag is annotated; the recipe uses its peeled commit, not the tag
object. Trilinos configuration comes from that Xyce commit's
`cmake/trilinos/trilinos-base.cmake`. Only AMD/SuiteSparse_config are built.
Upstream build instructions:
https://github.com/Xyce/Xyce/blob/Release-7.10.0/INSTALL.md.

On an Ubuntu runner with `cmake ninja-build g++ bison flex libblas-dev
liblapack-dev git` installed, the proposed command is:

```sh
spice-heavy bash benchmarks/reference/build-xyce-serial.sh "$HOME/xyce-serial"
export XYCE_BIN=$HOME/xyce-serial/install/bin/Xyce
```

Only shell syntax and source pins were checked here. Linux/source-build
execution and toolchain pinning are follow-up acceptance work. This is not a
verified Linux installation or a pinned container image. Linux CI currently
runs offline adapter/evidence tests, not live Xyce.

### Adapter seam and dialect policy

`benchmarks/reference/xyce.ts` returns the comparison harness's `EngineRun` and
`SampleSeries`, plus complete Xyce stdout/stderr on success so ignored-card
warnings remain visible. Execution uses argv, an isolated directory, a timeout,
and cleanup on every exit. CSV rejects missing, nonfinite, duplicate and
truncated fields rather than inventing values.

Supported analyses: one linear one/two-source DC sweep, TRAN, or complex AC.
Nested DC primary-grid restarts are retained. AC prints VR/VI and IR/II and
returns real/imaginary values, not magnitude-only output.

Mechanical, corpus-wide rules:

- Preserve every circuit/model statement and numeric value, including LEVEL=260.
- Replace `.print`/`.plot` and their continuation lines with one CSV `.print` of
  all requested signals at precision 17. DC explicitly prints `{primarySource}`
  because Xyce CSV has no implicit DC grid; TRAN/AC supply TIME/FREQ themselves.
- Preserve native qualified `.options`, for example `.options TIMEINT ...`.
  Reject unqualified ngspice options rather than silently discarding tolerances
  or assuming an equivalent Xyce solver setting.
- Reject `.control`, `.step`, multiple analyses, missing terminators, and OP in
  this slice. Do not reinterpret executed control-language semantics.
- `type=vdc`/`vdc=` is ahkab dialect, not a harmless source annotation. This slice
  rejects TYPE markers. Existing corpus-d SPICE3 companions demonstrate a
  corpus-wide mapping; wiring that mapping to both references is follow-up work.

Original and translated input hashes plus the exact changes are in each report.
The engine input bytes differ at output cards. These results therefore claim
identical circuit/model statements, not byte-identical engine decks. Where Xyce
warns that a dot card is ignored, its complete warning is published; a numeric
comparison is not proof of semantic equivalence.

### EKV 2.6 reference evidence

Three published, unmodified upstream fixtures are in
`benchmarks/reference/ekv/fixtures/`, pinned at Xyce_Regression
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`. Source URLs, hashes and GPL provenance
are recorded in the manifest and `benchmarks/SOURCES.md`; the existing corpus's
upstream notice and GPLv3 text are retained. Redistribution is permitted under
GPL-3.0-or-later. Runtime appends missing `.end` to both upstream DC decks before
either engine runs. The inverter is already terminated.

Xyce's actual device-count output says `M level 260 (EKV MOSFET version 2.6)`.
LEVEL=260 is EKV 2.6, not EKV 3. spice-ts and ngspice-47 currently map this level to
MOS1. These are measured fallback losses, not validation of a spice-ts EKV model.
`ekv-report.json` retains all three engine series, timing receipts, hashes and
per-signal max/RMS absolute and relative error. Every fixture has
`reference: xyce-7.10.0`.

| Published fixture | Signal | Aligned samples | spice-ts fallback max absolute error | RMS absolute error |
| --- | --- | ---: | ---: | ---: |
| test_ekv26_nmos | i(vdmon) | 1806 | 0.00229454302 A | 0.000804740361 A |
| test_ekv26_pmos | i(vdmon) | 1806 | 0.00596812271 A | 0.00251432532 A |
| inverter_transient_ekv26 | v(1) | 508 | 2.10188450 V | 0.631576604 V |

No before/after simulator gain: the core is unchanged. The new reference exposes
losses that MOS1-vs-MOS1 ngspice parity could not reveal. Relative error excludes
reference magnitudes <= 1e-15; exclusions remain in the JSON. Transient metrics
use plain linear interpolation. Nested sweeps match monotonic segment ordinals.
Timings are single-run wall times including output/startup, not speed claims.

### Attempted aggregate cross-check

`corpus-report.json` retains exactly 100 fixtures, 20 from each of the existing
ngspice/classic/xyce/corpus-d/corpus-e manifests, and verifies every deck hash.
The ngspice runner is the existing native rawfile runner; no corpus fixture is
rewritten for ngspice. Xyce uses output-only translation as above.

Measured counts:

| Engine | Success | Failed | Adapter unsupported |
| --- | ---: | ---: | ---: |
| ngspice-47 | 52 | 48 | 0 |
| Xyce 7.10.0 | 28 | 2 | 70 |

19 fixtures produced numeric reference comparisons. This is NOT a 100-fixture
mutually accepted subset. When ngspice produces no native plot, Xyce requests
only v(0) to test deck execution; these 9 additional Xyce successes are not
waveform comparisons. A native-runner failure may be an export/dialect failure,
not convergence. Adapter unsupported is not a claim that Xyce lacks a model.

The 70 adapter limitations are 24 unqualified/unknown options, 18 source TYPE
markers, 12 OP, 6 multiple/mismatched analyses, 5 missing matching analysis/end,
3 control-language decks and 2 stepped decks. The two Xyce execution failures are
`corpus-e/bjt-diffpair-transient` (source AC syntax) and
`corpus-e/mos1-nand-transient` (TRAN start >= stop). Errors are retained.

All 19 numeric comparisons, including disagreement:

| Fixture | Max voltage error (V) | Max current error (A) |
| --- | ---: | ---: |
| ngspice/schmitt-trigger | 0.749572957 | 0.00501756765 |
| classic/bjt-differential-pair | 0.0581689126 | 0.00000190649581 |
| classic/mos-memory-cell | 0.00104329784 | 0.0162478737 |
| classic/rc-transient | 0.000448980252 | 0.000448980252 |
| classic/ecl-schmitt-trigger | 0.749572957 | 0.00501756765 |
| xyce/diode-sidewall-dc | 0 | 0.0000304719232 |
| xyce/inductor-transient | 49.9342709 | 2.6423308e-14 |
| xyce/njfet-2109-dc | 0 | 0.00425349894 |
| xyce/nmos-level1-dc | 0.000681673639 | 0.00000136334728 |
| xyce/npn-dc | 0.000565513741 | 0.000000151580015 |
| xyce/pmos-level1-dc | 0.00200307626 | 0.000000267076835 |
| xyce/pnp-dc | 0.000992978876 | 0.000000318756868 |
| xyce/resistor-dc | 0 | 0 |
| xyce/resistor-level3-zero | 5.32907052e-15 | 0.0001171875 |
| xyce/resistor-negative | 0 | 0 |
| xyce/rlc-transient | 0.142708436 | 0.0475694787 |
| xyce/vccs-dc | 8.8817842e-16 | 1.73472348e-18 |
| xyce/vcvs-dc | 5.32907052e-15 | 1.04083409e-17 |
| corpus-e/diode-bias-sweep | 0.000264809605 | 2.64809605e-09 |

Legacy metric field names `spiceTsPoints`/`ngspicePoints` mean target/reference.
For this table target=ngspice, reference=Xyce. Mixed units are never aggregated
into one maximum. No per-circuit tolerances or tuning. Default-model, transient
integration, and ignored-card differences can all contribute; these numbers are
observed disagreement, not proof of a bug in either reference.

The old aggregate ledger is not refreshed by this report. Adding provenance to
SOURCES.md invalidates its whole-file preflight pin until a coordinated refresh.
No historical aggregate output is relabelled as a new measurement.

### Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
XYCE_BIN="$XYCE_BIN" pnpm exec tsx --test benchmarks/reference/xyce.test.ts benchmarks/reference/compare.test.ts
spice-heavy pnpm exec tsx benchmarks/reference/compare.ts
spice-heavy pnpm exec tsx benchmarks/reference/compare.ts --corpus
spice-heavy pnpm test
```

`--output PATH` writes either report elsewhere. Regeneration measures timings
again; it is not byte-deterministic. Offline CI verifies the committed source
hashes, counts, translation hashes, saved series hashes, and recomputed EKV
metrics. Live adapter tests run when XYCE_BIN is set, otherwise skip explicitly.
