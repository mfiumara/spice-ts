# RCA3040 three-engine AC investigation (#975)

## Finding

The saved ngspice/Xyce disagreement reproduces exactly. It is primarily a
**native reference netlist-parse discrepancy**, not an established current
spice-ts defect: the original model continuation ends in `va 50` (no equals
sign). ngspice 47 and spice-ts resolve VAF=50 V; Xyce 7.10.0 silently leaves
VAF=0 (its sentinel for no Early effect). Xyce's native `{QNL:VAF}` output is
0 in `baseline-xy-op.csv`, and 50 in `explicit-vaf-xy-op.csv`.

Both `va=50` and `vaf=50` diagnostic substitutions collapse the large residual;
`vaf 50` does not. Thus this is missing-assignment syntax, not the VA alias.
No translation adapter, benchmark defaults, tolerance, source attribution,
mutual-948 receipt, or core source has been changed. The original canonical
bytes remain the benchmark, and the losing baseline stays published.

A smaller reference-model difference remains with explicit assignment. At
matched intrinsic OP and VAF, Xyce uses different historical k/q constants
from ngspice/spice-ts. Its gm differs by up to 0.09434%, with the supplied
Gummel-Poon closed form predicting both engines' gm to relative 2.51e-11.
This is reference-model/derived-value disagreement, not evidence of a different
AC stamping topology. The explicit-assignment whole-circuit remaining residual
is documented, not relabelled as perfect parity or used to select a preferred
reference.

Current spice-ts vs ngspice on the saved canonical AC projection has maximum
absolute errors 3.45045e-12 V at v(8) and 4.09778e-12 V at v(9). The historical
~0.0011618 V spice-ts/ngspice result therefore is not present at the inspected
main commit c4858434e58fedeeedab142f2479252e0a59e851. This investigation does not
reconstruct an old core revision or claim which intervening fix removed it.
No core RED test or core-fix follow-up is warranted by this evidence.

## Inputs and provenance

Existing licensed classic fixture: see `benchmarks/SOURCES.md`, and the
unaltered `benchmarks/reference/mutual-948/hash-manifest.json` / `report.json`.
`run.ts` verifies all three saved hashes before executing, and records versions
in `environment.json`:

- Canonical full deck: 5024b28b797b53f35d838e1fefeecae059302c4b0106485ff711c9306eedfad1
- Shared saved AC projection: 52c10c8ef864808b39f2df52898fbdf6bde0eebe78d812a6cbb8f6f4513e107a
- Saved Xyce AC export deck: 292b5cbf679a8462205e83625a19358be318d7b0dbae68a53499180a0dd3b6b1

The baseline three-engine run uses the saved AC projection, with only native
exports changed: ngspice ascii rawfile; Xyce CSV rectangular complex signals;
spice-ts simulate. Xyce's existing translator adds a `.print` card, and does
not normalise the model assignment. That preserves bytes but does not ensure
semantic equality for this syntax. Classification is **parse**, not projection,
export, nonconvergence, or waveform-parse failure. No source has been copied
from the simulator implementations; links below are code provenance only.

## AC evidence and physical materiality

`TABLES.md` includes all three pairwise comparisons for v(8), v(9), and four
signal-path nodes. `summary.json` contains both the existing harness's 100-point
metrics and a direct ordinal 101-point check. All native grids have 101 points;
the existing range/interpolation policy drops one floating-point endpoint.
Independent 101-point rectangular-complex subtraction reproduces the large
maximum errors, so grid alignment is not their origin. No alignment code was
changed.

Existing harness (100 aligned samples):

| Pair | Signal | Max absolute V | RMS absolute V | Excluded zero denominators |
|---|---|---|---|---|
| spice-ts / ngspice | v(8) | 3.45045426e-12 | 4.98218956e-13 | 0 |
| spice-ts / ngspice | v(9) | 4.09778282e-12 | 5.89323869e-13 | 0 |
| ngspice / Xyce | v(8) | 8.00015550e-4 | 7.20279546e-4 | 0 |
| ngspice / Xyce | v(9) | 1.16180574e-3 | 1.05421913e-3 | 0 |
| spice-ts / Xyce | v(8) | 8.00015547e-4 | 7.20279546e-4 | 0 |
| spice-ts / Xyce | v(9) | 1.16180574e-3 | 1.05421913e-3 | 0 |

At 1 Hz, ngspice v(8) is about 0.7906 mV and v(9) about 1.1618 mV;
Xyce responses are only about 2.28 and 2.65 nV in magnitude. These are above
the existing 1e-15 zero-reference cutoff, so huge relative maxima (346933 and
437596) are valid arithmetic but poor physical parity indicators. The nodes
are bias/tail feedback nodes rather than the amplified outputs. They are not
near-zero at every frequency: peak magnitudes reach about 0.214 and 0.250 V.

This is **not only a near-zero-node issue**. For AC input 1 V, ngspice/Xyce
v(14) differs by max 1.77294 V / RMS 1.38640 V, with relative max 2.2507%;
v(10) differs by max 0.0605932 V / RMS 0.0523039 V (relative max 12.8113%).
At 1 Hz v(14) is -112.1408 V vs -110.5550 V. These are small-signal transfer
responses, not a prediction of an unclipped physical 112 V swing.

Diagnostic `vaf=50` has ngspice/Xyce v(8) max/RMS 8.51683e-7 / 1.80509e-7 V,
v(9) 9.78635e-7 / 2.07294e-7 V, and v(14) 0.00262028 / 0.00222168 V.
Explicit TEMP=TNOM=27 leaves the baseline unchanged; removing CCS does not
remove the low-frequency residual. A tight-ngspice diagnostic agrees with
spice-ts even more closely; its solver tolerances are never benchmark defaults.
All diagnostic deck hashes and separate pairwise receipts are in `ac.json`.

## Operating points, parameters and matched-OP AC

`op.ts` runs a standalone `.op` companion of the AC projection. The sole
analysis change is recorded in the saved diagnostic decks. ngspice `.save`
exports Ic, intrinsic Vbe/Vbc, gm/gpi/go and cpi/cmu; its normal batch model
listing is saved too. Xyce exports IC(Qn), N(Qn:VBE), N(Qn:VBC) and the actual
resolved model fields. spice-ts compiles and solves DC, then reads its
implementation-private DC/charge evaluators without changing them. Undefined
rolloff/Early effects are Infinity in spice-ts and serialize as JSON null;
Xyce/ngspice zero sentinels mean inverse zero, not zero-voltage Early effect.

Xyce does not expose gm/gpi/go/Cpi/Cmu as public store variables in this BJT
implementation. We do **not** claim a direct internal dump of those fields.
Instead `admittance.ts` measures native intrinsic terminal admittance using
three ideal-source AC perturbations at 1 MHz, with the recorded intrinsic OP
held fixed, RB=0 and CCS=0 removing extrinsic branches. These are diagnostic
probes, not a replacement benchmark. Ic/Vbe/Vce come from the full fixture's
native OP. `TABLES.md` / `summary.json` have all eleven BJTs and all three
engines, with conductance/capacitance columns explicitly labelled as extraction.
Original native OP JSON/CSV and source decks are retained.

The `matched-*` probes hold all engines at ngspice's intrinsic Vbe/Vce and
explicit VAF=50, with identical probe decks across engines. Collector/base/
emitter current responses retain the entire intrinsic local AC stamp, including
the TF Early-effect cross-charge term. With device currents defined into the
terminals and angular frequency w:

- gm = Re Ic for base stimulus
- gpi = -Re Ib for emitter stimulus
- go = Re(Ic + Ib) for collector stimulus
- Cpi = -Im Ib / w for emitter stimulus
- Cmu = -Im Ic / w for base stimulus

This distinguishes ordinary Cpi/Cmu from the nonzero cross-capacitance. Using
1 MHz avoids loss of tiny imaginary parts when converting spice-ts polar
results at 1 Hz. Maximum matched ts/ng relative differences are below 6e-16
for conductances/Cpi and 3.41e-11 for Cmu (conversion roundoff). Xyce matched
gm/gpi/go/Cpi differences are about 0.09%; matched Cmu differs by only 8.20e-9.

For q1, baseline ngspice/spice-ts go is about 4.60748e-5 S, whereas Xyce's
missing Early effect leaves only ~1e-12 S. Baseline Vbe differs by about
6.69 mV, demonstrating both OP and derivative changes before any AC solve.
The model defaults otherwise agree on IS=1e-16 A, BF=80, BR=1, NF=NR=1,
NE=1.5, NC=2, no knee/leakage effects, AREA=M=1 (no instance overrides),
RB=RBM=100 ohm, IRB=RC=RE=0, CJE=3 pF, CJC=CCS=2 pF, VJE=VJC=VJS=.75 V,
MJE=MJC=.33, MJS=0, FC=.5, XCJC=1, TF=.3 ns, TR=6 ns, XTF=VTF=ITF=PTF=0,
TEMP=TNOM=27 C, EG=1.11, XTI=3, XTB=0. Parameter dumps are the authoritative
receipts; substrate storage is explicitly removed only in intrinsic probes.

The constants difference is grounded in
[ngspice-47 constants](https://github.com/ngspice/ngspice/blob/ngspice-47/src/include/ngspice/const.h)
and the installed Xyce 7.10 header / pinned
[Xyce constants](https://github.com/Xyce/Xyce/blob/a592a42ae7472151d1c8e3bca0ca62d27476f2f3/src/DeviceModelPKG/Core/N_DEV_Const.h).
ngspice k/q uses 1.38064852e-23 / 1.6021766208e-19; Xyce uses
1.3806226e-23 / 1.6021918e-19. At 300.15 K, vt is .0258649170072 versus
.0258641863846 V. For this no-rolloff model:
Ic approximately IS*(exp(Vbe/vt)-1)*(1-Vbc/VAF), and
gm approximately Ic*(1/vt-1/(VAF-Vbc)). The tiny reverse junction contribution
is omitted in this diagnostic closed form; `render.py` checks every matched
q1..q11 and the largest gm discrepancy is only 2.51e-11 relative. Thus the
~0.09% matched-OP difference does not require an AC-stamp defect explanation.
We have not exhaustively attributed every last sub-microvolt full-circuit
explicit-assignment residual or reconstructed extrinsic matrices by substitution.

## Reproduce (repository root, headless)

Set XYCE_BIN to an existing Xyce 7.10.0 binary; no simulator install is performed
by these scripts. The investigation used
`$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce`.

```sh
pnpm install --frozen-lockfile
pnpm -C packages/core build
export XYCE_BIN="$HOME/.hermes/cache/scratch/xyce-948/install/bin/Xyce"
spice-heavy pnpm exec tsx benchmarks/reference/investigations/975/run.ts
spice-heavy pnpm exec tsx benchmarks/reference/investigations/975/op.ts
spice-heavy pnpm exec tsx benchmarks/reference/investigations/975/admittance.ts
python3 benchmarks/reference/investigations/975/render.py
pnpm exec tsx --test benchmarks/reference/investigations/975/receipt.test.ts
pnpm build
pnpm lint
spice-heavy pnpm test
```

Offline receipt tests pass 4/4. Local monorepo build, lint and guarded full test
command passed; see `verification.json`. CI on the published exact head is the
required authoritative gate. No benchmark implementation/performance change:
no before/after speed claim. Baseline and diagnostic accuracy values above
are deliberately separate, not improvement receipts for a shipped fix.

## Remaining scope for supervisor

Consider a separate adapter/canonicalisation policy card for omitted equals
syntax, requiring reference-semantic proof and separate revised receipts.
Do not silently amend mutual-948 or treat this original fixture as matching
reference semantics. Keep #975 open until the supervisor handles merge/closure.
No core-fix card was created because no current core defect was established.
