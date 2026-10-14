# Junction GMIN semantics (#1068)

`.options gmin` now selects junction `deviceGmin` (ngspice `CKTgmin`), not a
node-to-ground shunt. The programmatic `SimulationOptions.gmin` remains the
separate diagonal-shunt option, default zero. Junction gmin defaults to 1e-12 S.
No `.options gshunt` support is added. `toNetlist()` emits `deviceGmin` as
`.options gmin`; it no longer mislabels the diagonal API option as junction gmin.

## Identical-input measurements

The baseline is `d39157cd467ddd63ce501334b330609e7ee0a644`. `delta.json` records
all twelve requested inputs, SHA-256 hashes, native failures, first/last values,
point counts and per-signal absolute/relative max and RMS error. `compare.ts`
uses the existing native engine runners and linear-alignment harness. Both
engines receive the same input Buffer; no fixture or tolerance is adapted.

Measured on darwin 27.0.0 / arm64 / Apple M5 Pro, Node v22.23.1,
pnpm 10.28.1, `/opt/homebrew/bin/ngspice` version 47. Timings are not a speed claim.

| Probe / signal | ngspice-47 | Before | After |
| --- | ---: | ---: | ---: |
| weak diode v(weak), V | 2.398805967228419 | 0.0007274381457876711 | 2.3988059672284185 |
| weak diode i(vbias), A | -2.606204032758363e-9 | -5.01000927255999e-9 | -2.606204032758363e-9 |
| default diode v(weak), V | 0.0008525792171649069 | 0.0008525792171666926 | 0.0008525792171666926 |
| default diode i(vbias), A | -1.000914741891857e-11 | -1.0009147418918563e-11 | -1.0009147418918563e-11 |
| BJT i(vb), A | 5.000000099999981e-9 | 5.000099999981392e-12 | 5.000000099999981e-9 |
| BJT i(vc), A | -1.000000019999996e-8 | -5.0100001999999635e-9 | -1.0000000199999964e-8 |
| MOS1 i(vb), A | 5.0000001e-9 | 5.0001e-12 | 5.0000001e-9 |
| JFET i(vg), A | 1.500000019999998e-8 | 5.0150002e-9 | 1.50000002e-8 |
| diode AC Im(i(v1)), A at 1 kHz | -6.283185307179586e-6 | -6.283185306676179e-12 | -6.283185307179586e-6 |

The printed `ngspice-*.txt` receipts were also independently collected with
`/opt/homebrew/bin/ngspice -b <committed probe.cir>`, exit 0 for each of the six
self-authored probes. The AC probe's large TT makes the configured-gmin
contribution to diffusion capacitance visible, without changing tolerances.

### Existing deck deltas and residual losses

These are unchanged public inputs, not specially tuned replacements.

| Deck | Explicit gmin? | Before max relative error | After max relative error |
| --- | --- | ---: | ---: |
| convergence/gmin-reverse-diode, OP | yes, 0 | 3.0442638614e-4 | 2.8839204072e-4 |
| convergence/source-step-bjt, OP | yes, 0 | 3.0595246499e-6 | 7.5720278192e-13 |
| convergence/timestep-diode-rectifier, TRAN | yes, 0 | 2007 | 7 |
| corpus-g/BJT_ANALYTIC/ramp_test1, TRAN | yes, 0 | 1.3382891133e-5 | 1.8355009707e-7 |
| corpus-g/GMIN_STEPPING/gstep_cont3a | no | unsupported PTF | unsupported PTF |
| xyce/DIODE/diode | no | ngspice fails TSTEP=0 | ngspice fails TSTEP=0 |

`gstep_cont3a.cir` uses continuation options, not an explicit `gmin`. Its
unimplemented BJT excess phase (`PTF`) prevents a spice-ts numeric comparison.
The unchanged Xyce DIODE deck only mentions gmin in a comment. ngspice rejects
its zero TSTEP; spice-ts completes it with the same 129 points before/after.
Neither failure is hidden or relabelled as parity.

For gmin-reverse-diode, ngspice v(sense) is -99.08321567956804 V; spice-ts moves
from -99.11337922484498 to -99.11179049033849 V. The remaining voltage loss is
0.028574810770450654 V. The rectifier's pulse-current absolute max error remains
0.010815951802786827 A and its max relative error remains 7 near tiny reference
currents. Its v(out) absolute max error gets slightly worse, from
2.651722592617034e-7 to 2.6519297868787817e-7 V; absolute RMS also gets worse,
from 1.0148503866601567e-7 to 1.0150433208275566e-7 V. The v(in) absolute RMS
moves from 3.4756118916587433e-12 to 3.4756207259976607e-12 V. All per-signal
values, zero-reference exclusions and grid counts remain in `delta.json`.

No benchmark score, tolerance, manifest, outcome or aggregate pin changes.
Six BSIM4 core tests formerly asserted the known extra-diagonal-current loss;
they now assert zero delta at the same 1e-24 A absolute bound, against the
unchanged native reference. Resistive-divider parser/protocol/MCP expectations
now distinguish the junction option from the still-compatible diagonal API.

## Aggregate caveat

`spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check` exits 1 both
before and after. It stops at provenance preflight, before any simulation.
The base branch already has stale SOURCES and fixture-tree hashes:

- Pinned SOURCES: `d6bb12d27b99cff81ac14244e2871e9d45b6144aedd39ff5340ba6cce55e27d7`.
- Base actual SOURCES: `35d4c85ed3f4d8b485e9c20fbb422f8f4a2f8fda0da657d9a2cd79e275a96a62`.
- Pinned fixture tree: `23aaa91cfde358550eec443e8b5aaec134d7a7f930b1810f6e7f7db2532d6307`.
- Actual fixture tree before and after: `4d8eff5cf369bd4220611beb91d1396591f271c0c8dec8311167307a6c036504`.

Adding this probe's licence entry also changes SOURCES. `aggregate-before.txt`
and `aggregate-after.txt` retain both failures. A full aggregate numeric delta
is unavailable, not zero. Refreshing benchmark pins is outside this card and
explicitly prohibited here. The twelve-input scoped delta is a separate receipt,
not a replacement aggregate score.

## Source audit

The official ngspice-47 source archive was downloaded and inspected, not
redistributed. URL:
https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz
SHA-256: `894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f`.

- `cktop.c:191,376-443`: separate diagonal/device stepping and junction baseline.
- `dioload.c:512-519,584-585`: junction current/conductance includes CKTgmin
  before TT diffusion charge/capacitance.
- `bjtload.c:455-502`: B-E/B-C leakage and substrate CKTgmin.
- `jfetload.c:230-247`: gate-source and gate-drain CKTgmin.
- `vbicload.c:756-771`: unscaled branch CKTgmin, including the Irci terms.
- `ifeval.c:86`: PTfudge_factor = gmin * 1e-20.

Models already reading `ctx.gmin` get the configured assembler value. BJT,
JFET, VBIC and diode charge/noise paths no longer use fixed junction constants.
MES/MESA loads read the context value as well as their constructor fallback.
Switch default ROFF resolution reads the compile-time junction option.
The two MOS1 fixed channel-Jacobian regularizers are not ngspice CKTgmin and
are intentionally unchanged. BJT/VBIC/JFET charge laws that do not use CKTgmin
remain unchanged. `mos3.ts` is untouched.

## Reproduce

From an isolated checkout, with installed pnpm dependencies:

```sh
mkdir -p .issue-1068-baseline
git archive d39157cd467ddd63ce501334b330609e7ee0a644 packages/core tsconfig.base.json package.json pnpm-workspace.yaml | tar -x -C .issue-1068-baseline
ln -s "$PWD/node_modules" .issue-1068-baseline/node_modules
ln -s "$PWD/packages/core/node_modules" .issue-1068-baseline/packages/core/node_modules
pnpm -C .issue-1068-baseline/packages/core build
pnpm build
spice-heavy pnpm exec tsx benchmarks/results/issue-1068/compare.ts .issue-1068-baseline
```

The archive is disposable and must not be committed. The current checkout's
`packages/core/dist` and the baseline's separately built `dist` are loaded by
distinct absolute URLs. This is correctness evidence, not a runtime comparison.

## Verification receipts

- Initial RED: 2 failing / 1 passing tests, exit 1 (`red.txt`). The default case
  passed before any code change; explicit-gmin voltage relative error was 0.999697.
- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm build`: exit 0 (`build.txt`).
- `pnpm lint`: exit 0 (`lint.txt`).
- Targeted core/device/parser/convergence/homotopy run: 362 pass, 2 slow tests
  skipped, exit 0 (`targeted-final.txt`).
- `spice-heavy pnpm test`: exit 0 (`full-test-final.txt`).
- Scoped identical-input runner: exit 0 (`compare.txt`, `delta.json`).
- Aggregate check: exit 1 before and after for the pre-existing stale provenance.

The homotopy unit test forces the fallback path and checks configured
1e-9/1e-15/zero baselines at initial, target and final loads. It does not claim
mocked Newton output as circuit parity. The real 6000-stage true-gmin convergence
and 20000-stage chain tests also pass. The eleven public simulation regressions
cover diode DC/AC/transient, BJT/MOS1/JFET currents, API compatibility and parsing.
