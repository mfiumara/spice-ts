# EKV 2.6 static DC slice (#4)

`NMOS` and `PMOS` at exactly `LEVEL=260` now dispatch to a real EKV2.6 device,
not MOS1. Xyce 7.10 registers no level aliases for this model. All other model
levels retain the existing ngspice-compatible rounding/fallback policy; #747
fallback tests now exercise the still-unmapped LEVEL=100. Historical reference
files and aggregate/corpus-g reports are unchanged, not retroactively rewritten.

## Measured improvement, not full-model parity

Reference per fixture: `xyce-7.10`. Baseline core:
`ead0642d579adff1891533ddf5acccc7d60f3d72`. Before/after runs use identical
output-adapted deck bytes for spice-ts and Xyce, with hashes asserted by the
runner and offline evidence tests. Both use the same circuit/model statements
and numeric values. Missing `.end` is appended uniformly to the two DC sources;
CSV output probes are then installed uniformly for both engines. ngspice uses
the terminated source and is explicitly labelled
`ngspice-lacks-model (MOS1 fallback)`.

| Published fixture / signal | Before max abs | Before RMS abs | After max abs | After RMS abs | After max rel | After RMS rel |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NMOS i(vdmon), A | 0.00229454302 | 0.000804740361 | 3.41455894e-10 | 2.92876957e-10 | 1 | 0.052631579 |
| PMOS i(vdmon), A | 0.00596812271 | 0.00251432532 | 2.59071537e-10 | 1.42621710e-10 | 1.5324688e-5 | 6.08636393e-6 |
| Inverter v(1), V | 2.10188451 | 0.631576564 | 0.00943929264 | 0.00135369550 | 0.0147115051 | 0.00177085594 |

See [metrics.md](metrics.md) and [metrics.json](metrics.json) for every signal,
all six NMOS ascending and PMOS descending sweeps, and both inverter paths.
The corpus-g inverter is the same source bytes as the reference inverter,
reported separately to retain its expected ngspice divergence, not counted as
a fourth novel circuit.

Residual losses remain visible:

- NMOS max relative error remains 100% at five zero-VDS points with exactly zero
  spice-ts channel current and Xyce currents around 1.016 to 1.562 fA. They are
  above the existing harness's 1e-15 relative exclusion threshold. No floor was
  raised or circuit-specific tolerance introduced to hide them.
- The inverter is static-only, not a validated transient charge model. Output
  max error is 9.44 mV; supply-current max relative error is 30.6%, and input
  interpolation has 5.45 mV maximum absolute error. Its 2.90 maximum relative
  input error near zero is retained too.
- The corpus-g output now differs from ngspice-47 MOS1 fallback by max
  2.10228131 V / RMS 0.632253918 V, while improving against the real Xyce EKV
  reference. This intentional loss is not hidden by refreshing old ledgers.
- Wall times are retained, but include startup/output and are single samples.
  No speed claim or evidence of general EKV parity is made.

## Equations, implementation and limitations

The MIT implementation is written independently from the EPFL report cited in
`benchmarks/SOURCES.md`. No GPL source is included. Bulk-referenced voltages,
RSCE, charge sharing/body effect, forward/reverse normalized currents,
velocity saturation, CLM and effective mobility all enter the DC current.
Analytic derivatives use local three-variable forward-mode chain rules, with
the bulk derivative determined by common-mode invariance. There are no
production finite differences.

The defining interpolation equations 41-42 are inverted by Newton on log(y),
with exact derivative dF/dv=y, rather than reproducing Xyce's explicit
approximation. A 1e-60 normalized-current floor prevents log/sqrt underflow in
deep-off operation. Revision-III gate/PHI smoothing and narrow-channel sign,
and the deterministic 1um matching-parameter sentinel, follow Xyce behavior.
Xyce's generated C++ is GPL-3.0-or-later. Its original Verilog-A carries ECL-2.0
and a legacy restrictive notice; neither source nor the EPFL PDF is committed.
The published circuit fixtures retain their existing GPL notices.

Parameter policy:

- Supported static parameters: COX, XJ, VTO, GAMMA, PHI, KP, E0, THETA, UCRIT,
  LAMBDA, DL, DW, WETA, LETA, Q0, LK, AVTO, AKP, AGAMMA, W, L, M and nominal
  TNOM. Geometry follows L+DL, W+DW, unlike MOS1's L-2*LD.
- E0=0 selects THETA mobility. With E0 nonzero, THETA is unused exactly as in
  Xyce's executable model and nonzero THETA produces a named warning.
- Nominal diffusion currents use AS/AD/PS/PD/HDIF and XD_JS/XD_JSW/XD_JSWG/XD_N.
  Intrinsic/junction charges, AC/NQS and noise are not implemented and every
  instance emits an explicit static-only warning, even with no explicit charge
  parameters. Transient therefore uses only static current.
- IBA/IBB/IBN impact ionization is explicitly listed as ignored in every
  instance warning. Named temperature, noise and junction charge/breakdown/
  tunneling parameters are listed as ignored with values when supplied.
- Unknown/unsupported parameters, nonzero RSH or XD_GMIN, optional process
  initialization (TOX/NSUB/VFB/UO/VMAX), and NS != 1 produce structured
  `UNSUPPORTED_MODEL_PARAMETER` errors naming the device/model/parameter.
  VERSION overrides are rejected. TEMP != TNOM produces
  `UNSUPPORTED_TEMPERATURE`, including changes after compilation.
- M implements the published parallel-device equation. Reference coverage is
  M=NS=1 only; do not infer Xyce multiplicity parity from these receipts.

Follow-ups, both filed under M4:

- [#962](https://github.com/mfiumara/spice-ts/issues/962): charges/AC/NQS,
  noise/temperature, optional initialization and external resistance.
- [#963](https://github.com/mfiumara/spice-ts/issues/963): DC near-zero and
  interpolation residuals, transient/grid losses, substrate/junction/multiplicity
  characterization and expected corpus-g divergence.

## Reproduce

From an isolated checkout/worktree, with ngspice-47 available:

```sh
pnpm install --frozen-lockfile
python3 benchmarks/reference/install-xyce-macos.py "$PWD/.xyce-local"
export XYCE_BIN="$PWD/.xyce-local/install/bin/Xyce"
export TMPDIR="$HOME/.hermes/profiles/spice-ts-engineer/cache/scratch"
pnpm build && pnpm lint
pnpm -C packages/core exec vitest run src/devices/ekv.test.ts src/parser/model-level-limit-747.test.ts src/devices/mosfet-body-effect.test.ts
spice-heavy pnpm exec tsx benchmarks/reference/ekv-static/compare.ts --output benchmarks/reference/ekv-static/after-identical.json
gzip -9f benchmarks/reference/ekv-static/after-identical.json
pnpm exec tsx --test benchmarks/reference/ekv-static/evidence.test.ts
python3 benchmarks/reference/ekv-static/summarize.py
spice-heavy pnpm test
```

The Linux source-build recipe is separately tracked; live receipts here are
macOS arm64 / Xyce 7.10.0, not claims of a Linux live-reference installation.
CI runs the offline evidence checks without installing Xyce.

For the same-byte MOS1 baseline in this worktree, the executed setup was:

```sh
mkdir -p .xyce-local/baseline
git archive ead0642d packages/core tsconfig.base.json package.json | tar -x -C .xyce-local/baseline
ln -s "$PWD/node_modules" .xyce-local/baseline/node_modules
ln -s "$PWD/packages/core/node_modules" .xyce-local/baseline/packages/core/node_modules
pnpm -C .xyce-local/baseline/packages/core build
spice-heavy pnpm exec tsx benchmarks/reference/ekv-static/compare.ts --core .xyce-local/baseline/packages/core/dist/index.js --baseline --output benchmarks/reference/ekv-static/before-identical.json
gzip -9f benchmarks/reference/ekv-static/before-identical.json
```

The compressed receipts retain all waveforms, output, warning and timing data.
The new receipt records the unchanged base commit plus dirty-worktree status
and production-file hashes, rather than pretending an uncommitted experiment
ran at the future PR head. The final PR identifies its exact head separately.
`red.log`, `green.log`, offline and final build/lint/full-suite logs retain real
execution. The initial guarded full-suite attempt found three stale
supportedLevels assertions; they were updated to include 260 before rerunning.

Final local gates exited 0: `pnpm build`, `pnpm lint`, guarded root
`spice-heavy pnpm test`, 39 targeted tests across three files, and all offline
reference/evidence checks. The full core run passed 279 files / 3603 tests
(2 skipped). `full-tests-final.log` retains the remaining package and benchmark
test results too. The new live receipts' three production-file hashes match
the files committed in this slice. Required GitHub CI on the exact PR head and
independent spice-ts-review remain separate publication gates.
