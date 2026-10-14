# BSIM4 static reference fixtures (#3)

This is reference data, not a BSIM4 implementation or a parity result. The fresh
spice-ts receipt at main `760833b948280918f6abcfaa0d051a4f4d865ae9` rejects all
four unchanged inputs with `UnsupportedModelLevelError` /
`UNSUPPORTED_MODEL_LEVEL`. No signal comparison exists. Max-absolute and RMS
errors are **null**, not zero. See `__fixtures__/bsim4/baseline.json`.

## Inventory

The three F and one G rows are the exact `model: BSIM4 (LEVEL=14/54)` bucket in
`benchmarks/corpus/corpus-{f,g}/outcomes.json`. Other F decks also contain BSIM4,
including ro_17_4, ro-meas and the two PSS oscillators, but their committed first
failures are options/control syntax. They are not additional rows in this bucket.

| Corpus / fixture path relative to repository root | Model cards | Analyses in original input | Slice 1 boundary |
| --- | --- | --- | --- |
| F `benchmarks/corpus/corpus-f/fixtures/tests/regression/model/binning-1.cir` | Four NMOS cards, LEVEL=54 VERSION=4.8. Unbinned `nmos0v7` VTH0=0.7, `nmos0v9` VTH0=0.9; `nmos_tst.1`/`.2` carry the same thresholds and length/width bins | Control OP plus two bin-match assertions | **Primary unchanged-deck target**. Four diode-connected devices, width-based model selection, defaults, static current and Jacobian |
| F `benchmarks/corpus/corpus-f/fixtures/examples/mos/nmos_pmos_BSIM482.sp` | `n1` NMOS and `p1` PMOS, LEVEL=54 VERSION=4.8.2 | Six control DC analyses. Id/Vgs/Vbs, Id/Vds/Vgs and Id/Vgs/TEMP for each polarity | Nominal-temperature static device/grid target. Full original temperature sweeps are retained as reference but are **not** evidence that a fixed-temperature implementation supports the full deck |
| F `benchmarks/corpus/corpus-f/fixtures/examples/various/gain_stage.cir` | `N1` NMOS LEVEL=14 VERSION=4.3.0 TNOM=27 | AC DEC 10 100 1000Meg, output loop | **Fail closed**. Different native model family (bsim4v5), plus intrinsic/overlap/junction capacitances and AC |
| G `benchmarks/corpus/corpus-g/fixtures/SENS/bsim4_issue694_FD.cir` | `nfet_model` NMOS LEVEL=54, VERSION omitted | TRAN 2ps 1ns. Commented DC is not active; width finite-difference output expression | **Fail closed**. Intrinsic/junction charges and transient. Initial gate/drain/source/body biases are zero; this trivial OP would not validate its transient or sensitivity output |

Each original input has ngspice `success` in the **historical** corpus outcome
receipt. `baseline.ts` remeasures only spice-ts and checks the original byte
hashes. This card freshly executes native binning OP and all six BSIM482 DC
analyses, not original gain-stage AC or G transient. The parent discovery also
reported ngspice's G `.print` expression error despite exit 0. Do not promote
that historical success to an all-output native correctness claim.

## Parameters and required features

No card in these four rows explicitly sets `capmod`, `trnqsmod`, `acnqsmod`,
`rgatemod`, `rbodymod`, `saref`, `sbref`, `sa`, `sb`, or noise parameters. None
requests noise analysis. Omission does **not** make a BSIM4 device a MOS1
transistor, remove default capacitance, or remove static geometry/temperature
preprocessing.

| Fixture | Explicit card/instance features | Defaults / analysis implications |
| --- | --- | --- |
| binning-1 | VTH0, LMIN=1u LMAX=10u; WMIN/WMAX 4.5u/5.5u and 5.5u/6.5u. Devices L=5u and W=5u or 6u | Exact bin selection and VTH0 override, diode-connected OP and default analytic derivatives. No AD/AS/PD/PS specified; no active stress/NQS/gate/body network |
| nmos_pmos_BSIM482 | NMOS W=1u L=0.35u PD/PS=1.5u AD/AS=1.5p; PMOS W=2.5u L=0.35u PD/PS=3u AD/AS=2.5p | Polarity, body bias, junction geometry and signed terminal currents. Both two-source bias sweeps and TEMP -40..160 C. Default capacitance is present but not excited by DC |
| gain_stage | TNOM=27; L=1u W=4u | Native 4.3-family defaults; nonzero small-signal charges required for AC, even without explicit capacitance parameters. Control loop is separate from model support |
| bsim4_issue694_FD | W=0.65u L=0.15u, second instance W+dW, dW=W*1e-8; DEVICE TEMP=25; GEAR / RELTOL=1e-6 | Drain is grounded and source is `vo`, so orientation matters. PWL 0..1.8 V gate drives transient; default charge derivatives and tiny width perturbation cannot be dropped |

At the pinned 47 source, `bsim4/b4set.c:105,119,126,144,150,157,163` defaults
CAPMOD=2, RBODYMOD=0, RGATEMOD=0, FNOIMOD=1, TNOIMOD=0, TRNQSMOD=0,
ACNQSMOD=0. SAREF/SBREF default to 1e-6 m (`:2226-2228`), but omitted instance
SA/SB do not activate stress. Static slice guards must reject requested
AC/TRAN/noise, enabled NQS, active stress, and unsupported gate/body resistance
networks. Merely omitting a parameter cannot justify silently ignoring an
activated unsupported feature. Intrinsic DC defaults and temperature/geometry
terms still need the real equations. Rejection must be structured, never a
BSIM3/MOS1 fallback.

## Model family decision

The supervisor's retarget decision on root card `t_6796f361` is authoritative.
Slice 1 follows **ngspice-47 `bsim4/`, VERSION=4.8/default**, not `bsim4v7/`.
The child specification's bsim4v7 shorthand is stale.

Pinned upstream revision `a80f6e3e95d51534905b1f23410a951802666656` (ngspice-47):

- [inpdomod.c:297-310](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/parser/inpdomod.c#L297-L310)
  selects bsim4v5 for 4.0..4.5, bsim4v6 for 4.6, bsim4v7 for 4.7 and bsim4 for
  4.8/default. VERSION=4.3 and 4.7 remain unsupported in slice 1.
- [b4set.c:204-217](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/bsim4/b4set.c#L204-L217)
  defaults to 4.8.3; the first `strncmp(version,"4.8",3)` also matches literal
  4.8.2 and 4.8.1 before their later exact-match branches. Follow that pinned
  behavior rather than selecting equations by the printed minor version.

The gain-v43 grid is deliberately retained as an unsupported-family oracle.
It is not a 4.8 model with a different label and must not be used to tune 4.8.

## Reference data and conventions

`__fixtures__/bsim4/reference/reference.json` has seven cases, **108 samples
per case / 756 samples total**, all at TEMP=27 C. Each sample includes Vgs,
Vds, Vbs, native `@M[id]`, gm, gds, gmbs and signed drain-terminal current.

Cases preserve the exact model-card body and geometry from F `n1`, `p1`,
`nmos0v7`, `nmos0v9`, and `N1`; model identifiers alone are renamed to DUT.
Two original project minimal cards cover omitted VERSION, NMOS LEVEL=54 and
PMOS LEVEL=14. The minimal NMOS's default card and L=0.15u/W=0.65u equal the
unparameterized model and nominal geometry in G, but are an independent
single-device probe at 27 C, **not a copied G deck or a G transient reference**.

The normalized bias axes are Vgs = [-0.2, 0, 0.4, 0.8, 1.2, 1.8] V and
Vds = [-0.1, 0, 0.05, 0.4, 1.2, 1.8] V at Vbs = [0, -0.5, -1] V.
PMOS uses the sign-reversed physical voltages, recorded explicitly in JSON.
Each case is one circuit with 108 independent ideal-biased devices. This
includes reverse orientation, exact Vds=0, low-field, weak/strong inversion,
and body-effect points. No tolerances or circuit parameters are fitted.

Native `@M[id]` is positive for forward NMOS **and** PMOS conduction. Native
gm/gds/gmbs are model conductances, not derivatives of the signed physical
current after arbitrary polarity/orientation normalization. Signed physical
drain current is `-i(VD)` and includes junction/leakage contributions; it is
negative for forward PMOS. In reverse operation the native mode conventions
must be respected. The two currents need not be identical. Raw files retain
the native names (`i(@m0[id])` and `@m0[gm]`, etc.) without reinterpretation.

`binningOp.vectors` preserves all four node voltages. Native results are
V(1)=V(2)=0.8693589670633045 V and V(3)=V(4)=1.071660594471147 V; the retained
original control assertions report `INFO: 0 of 2 tests failed`. The generating
deck changes only output instrumentation immediately after its original OP.

`pairDc.analyses` preserves **all six** original BSIM482 DC solution vector
sets, including source branch currents and temperature sweeps. Point counts
are 186, 246, 186, 186, 246, 186 in source order. Circuit, model, source and DC
command values are unchanged. Only plotting is omitted and ASCII writes,
precision controls and final quit are added. Plot timestamps can change on
regeneration; the numerical JSON and deck hashes are the comparison surface.

All `.cir`, `.raw`, the full ngspice version banner, and the
strict generating/validation scripts are committed next to this document.
Raw `.log` additions were removed under the owner’s later agent-artifact policy.
Generation recreates logs locally; native-receipt.json retains the original
binning assertion summary and source hash instead of committing a raw log.
The installed binary's version banner advertises KLU capability, while actual
run logs select **SPARSE 1.3**, not KLU. No runtime or superiority claim.

## Reproduction and checks

From the repository root, with ngspice-47 on PATH and Python 3.10+:

```sh
pnpm install --frozen-lockfile
ngspice --version
spice-heavy python3 packages/core/src/devices/__fixtures__/bsim4/generate.py
PYTHONDONTWRITEBYTECODE=1 python3 packages/core/src/devices/__fixtures__/bsim4/test_generate.py
pnpm exec tsx packages/core/src/devices/__fixtures__/bsim4/baseline.ts
pnpm build && pnpm lint
```

`generate.py --output PATH` writes a separate reproduction without overwriting
the committed oracle. Every native batch call is serial inside the guarded
parent, uses `ngspice -n -b`, enforces a 60 s deadline, requires exit zero and
rejects error/fatal diagnostics and malformed/nonfinite raw vectors.
`-n` avoids user spiceinit model compatibility changes. The committed run
banner is `reference/ngspice-version.txt`. The five Python tests verify shape,
source/deck hashes, all serialized quantities against native raw, all six DC
sweeps, bin-match assertions, and malformed/nonfinite input rejection. These
are oracle integrity tests, **not GREEN model parity tests**. The validation
child owns RED/GREEN BSIM4 tests, per-signal errors, PR and exact-head CI.

## Provenance and licences

F source revision `3ef069fb1f04177a153f342a32d941fc20ff047e`, BSD-3-Clause:
[manifest](../../../../benchmarks/corpus/corpus-f/manifest.json) and
[upstream tree](https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/).
Adapted F model cards/decks retain the Modified BSD notice at
`__fixtures__/bsim4/LICENSE.ngspice-examples.txt`. Scripts and independently
project-authored minimal probes use the repository MIT licence.

G source revision `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later:
[upstream original](https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/SENS/bsim4_issue694_FD.cir).
It remains in the separately licensed benchmark tree. No G deck is copied
into the core package. Existing F/G source/licence registration is in
`benchmarks/SOURCES.md`; no new third-party circuit source is introduced.
Reference fixtures are not bundled into `dist`; core's package file list
ships only `dist`.

**Implementation licence is different from example licence.** The pinned
`bsim4/b4set.c`, `b4ld.c` and `b4temp.c` headers are University of California
ECL-2.0, not BSD-3-Clause. This reference-only lane copies none of that code.
The port lane must preserve the actual ECL-2.0 notices/licence and add its
accurate source row in `benchmarks/SOURCES.md`, not repeat the card's BSD
shorthand. No parser, benchmark reference-adapter or aggregate files are edited.
