# Issue #308: benchmark-bounded O/LTRA scope

This note fixes the minimum honest scope for issue
[#308](https://github.com/mfiumara/spice-ts/issues/308). It is an audit only: the
four benchmark inputs remain byte-for-byte unchanged. Their provenance and
licences are already recorded in `benchmarks/SOURCES.md` (ngspice public corpus
A at line 28 and Berkeley SPICE3f5 at lines 63-65).

## Fixtures and cards

All line numbers below are physical fixture line numbers. A range includes a
SPICE `+` continuation line. "Reachable" means that the O element is reached
from the top-level circuit after subcircuit expansion; syntactically active O
cards inside uncalled subcircuits are still listed because the unchanged file
must parse.

### `ngspice/ltra-line-transient`

Path: `benchmarks/corpus/ngspice/fixtures/tests/transmission/ltra1_1_line.cir`

- line 6: `o1  2 0 3 0 lline` (top-level/reachable)
- lines 16-17: `.model lline ltra rel=1 r=12.45 g=0 l=8.972e-9 c=0.468e-12 len=16 steplimit compactrel=1.0e-3 compactabs=1.0e-14`
- Category exercised: RLC (series loss, `R>0`, `L>0`, `C>0`, `G=0`).

### `classic/lossy-line-24-inch`

Path: `benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir`

- line 23: `o2 2 0 3 0 lline` (top-level/reachable)
- line 33: `.model lline ltra rel=1 r=0.2 g=0 l=9.13e-9 c=3.65e-12 len=24 steplimit compactrel=1.0e-3 compactabs=1.0e-14`
- lines 199-200: `.model llfifth ltra nocontrol noprint rel=10 r=0 g=0 l=9.13e-9 c=3.65e-12 len=0.2 steplimit quadinterp`
- line 202: `o1 1 0 3 0 llfifth` (inside the uncalled `xlump` subcircuit)
- Category exercised: RLC. The file also declares an LC (`R=G=0`) helper,
  but its O element is not reachable from the selected top-level circuit.

### `classic/lossy-line-aluminium`

Path: `benchmarks/corpus/classic/fixtures/spice3f5/ltra_2.cir`

- line 48: `.model lline ltra rel=1.8 r=12.45 g=0 l=8.792e-9 c=0.468e-12 len=16 steplimit`
- lines 351-352: `.model lless10 ltra nocontrol rel=10 r=0 g=0 l=8.792e-9 c=0.468e-12 len=0.1 steplimit quadinterp`
- lines 355-356: `.model lless8 ltra nocontrol rel=10 r=0 g=0 l=8.792e-9 c=0.468e-12 len=0.125 steplimit quadinterp`
- lines 359-360: `.model lless4 ltra nocontrol rel=10 r=0 g=0 l=8.792e-9 c=0.468e-12 len=0.25 steplimit quadinterp`
- lines 363-364: `.model lless2 ltra nocontrol rel=10 r=0 g=0 l=8.792e-9 c=0.468e-12 len=0.5 steplimit quadinterp`
- lines 367-368: `.model lless1 ltra nocontrol rel=10 r=0 g=0 l=8.792e-9 c=0.468e-12 len=1 steplimit quadinterp`
- line 372: `o1 1 0 3 0 lless10`
- line 378: `o1 1 0 3 0 lless1`
- line 393: `o1 1 0 3 0 lless2`
- line 403: `o1 1 0 3 0 lless4`
- line 412: `o1 1 0 3 0 lless8`
- Category exercised: other/model-card-only. The selected top-level circuit calls
  `sixteencm`, the discrete RLC-ladder family, so no O element is reachable.
  The eager parser nevertheless encounters one RLC model and five LC models;
  those cards and the O cards in dormant subcircuits must parse unchanged.

### `classic/coupled-lossy-lines`

Path: `benchmarks/corpus/classic/fixtures/spice3f5/ltra_3.cir`

- lines 239-243: five O cards in the uncalled `ltrastub` subcircuit, referring
  to undefined `lline15in`, `lline6in`, `lline4in`, and `lline5in` models
- lines 249-250: `.model llfifth ltra nocontrol rel=10 r=0 g=0 l=9.13e-9 c=3.65e-12 len=0.2 steplimit quadinterp`
- line 253: `o1 1 0 3 0 llfifth` (inside the uncalled `xlump` subcircuit)
- line 368: `.model mod1_conv2wtwentyinch ltra rel=1.2 nocontrol r=0.2 l=4.72933999088e-09 g=0 c=7.25000000373e-12 len=20`
- line 369: `.model mod2_conv2wtwentyinch ltra rel=1.2 nocontrol r=0.2 l=1.35306599818e-08 g=0 c=3.65000000746e-12 len=20`
- lines 388-389: `o1 5 0 7 0 mod1_conv2wtwentyinch` and
  `o2 6 0 8 0 mod2_conv2wtwentyinch` (reachable through
  `conv2wtwentyinch`)
- line 393: `.model convtwoinch ltra r=0.2 l=9.13e-9 c=3.65e-12 len=2.0 rel=1.2 nocontrol`
- lines 395 and 397: `o1 1 0 5 0 convtwoinch` and
  `o2 6 0 3 0 convtwoinch` (reachable through `conv2wetcmodel`)
- Category exercised: RLC, including the two modal RLC lines used to represent
  the coupled section. The file also declares a dormant LC helper. This scope
  does not add a native multiconductor line: the fixture's existing modal
  decomposition remains unchanged.

No fixture exercises RC (`R,C>0`, `L=G=0`) or RG (`R,G>0`, `L=C=0`).

## Model-parameter classification

`REQUIRED` means the spelling is recognised, its value is validated, and its
ngspice meaning is implemented or an explicitly documented idempotent behavior
is tested. Merely accepting and discarding a token is not implementation.
`EXPLICIT-UNSUPPORTED` means recognition followed by a clear parameter-specific
error. Parameters not used by these four fixtures remain out of scope even when
ngspice supports them.

| Parameter | Values in the four fixtures | Classification | Minimum behavior |
|---|---|---|---|
| `R` | `0`, `0.2`, `12.45` | REQUIRED | Non-negative series resistance per unit length; support both RLC and LC (`R=0`). |
| `L` | `4.72933999088e-9`, `8.792e-9`, `8.972e-9`, `9.13e-9`, `1.35306599818e-8` | REQUIRED | Positive series inductance per unit length. |
| `G` | `0` when present; omitted once by `convtwoinch` (ngspice default `0`) | REQUIRED for zero/default only | Implement `G=0` and the omitted default. Reject non-zero `G` explicitly; RG and general shunt loss are not exercised. |
| `C` | `0.468e-12`, `3.65e-12`, `3.65000000746e-12`, `7.25000000373e-12` | REQUIRED | Positive shunt capacitance per unit length. |
| `LEN` | `0.1`, `0.125`, `0.2`, `0.25`, `0.5`, `1`, `2.0`, `16`, `20`, `24` | REQUIRED | Positive line length. |
| `REL` | `1`, `1.2`, `1.8`, `10` | REQUIRED | Breakpoint-control value. Values above 2 intentionally eliminate LTRA breakpoints in ngspice; do not silently treat them as a generic tolerance. |
| `STEPLIMIT` | flag present on the ngspice fixture, `ltra_1`, `ltra_2`, and dormant LC helpers | REQUIRED | Enforce the LTRA delay-derived timestep limit (ngspice describes the explicit flag as `0.8 * delay`). |
| `NOCONTROL` | flag present on all LC helpers and the three reachable `ltra_3` RLC models | REQUIRED | Disable LTRA convolution-error timestep control. If the bounded implementation has no such controller, acceptance must be explicit and tested as equivalent, not silently dropped. |
| `QUADINTERP` | flag present on all dormant LC helpers | REQUIRED | Select quadratic delayed-signal interpolation. The models are dormant at runtime, but their unchanged cards must be recognised and validated. |
| `COMPACTREL` | `1.0e-3` | REQUIRED | History-compaction relative tolerance. It is behaviorally inactive unless history compaction is enabled, but must be parsed, range-checked, retained, and tested as such. |
| `COMPACTABS` | `1.0e-14` | REQUIRED | History-compaction absolute tolerance, with the same explicit inactive-without-compaction treatment as `COMPACTREL`. |
| `NOPRINT` | flag present on `ltra_1`'s dormant `llfifth` model | REQUIRED | Preserve the legacy request not to emit LTRA debug output. spice-ts emits none, so this is an idempotent, testable behavior rather than an ignored token. |
| `ABS` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject; absolute breakpoint control is outside this fixture-bounded slice. |
| `NOSTEPLIMIT` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject; do not alias it to `STEPLIMIT`. |
| `LININTERP` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject. |
| `MIXEDINTERP` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject. |
| `TRUNCNR` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject. |
| `TRUNCDONTCUT` | not present | EXPLICIT-UNSUPPORTED | Recognise and reject. |
| any other LTRA model parameter | not present | EXPLICIT-UNSUPPORTED | Reject with the parameter name; never ignore unknown fields. |

## O-instance classification

Every syntactically active O card has exactly four nodes followed by a model
name:

    Oname p1+ p1- p2+ p2- model

All model-backed O cards used at runtime have a common reference (`p1-` and
`p2-` are both `0`). The dormant `ltrastub` cards also use that form, although
their models are intentionally unresolved because the subcircuit is never
instantiated. Model lookup must therefore occur after reachability/subcircuit
expansion, not while merely parsing a dormant definition.

| Instance option/form | Values in fixtures | Classification |
|---|---|---|
| Four nodes plus model name | every O card listed above | REQUIRED |
| Common reference at both ports | `0` for every listed O card | REQUIRED |
| `IC=v1,i1,v2,i2` vector | not present | EXPLICIT-UNSUPPORTED |
| Scalar initial-condition aliases `V1`, `I1`, `V2`, `I2` | not present | EXPLICIT-UNSUPPORTED |
| Any trailing/unknown instance option | not present | EXPLICIT-UNSUPPORTED |
| Different port reference nodes | not present | EXPLICIT-UNSUPPORTED |

## Existing hooks and owned files

Existing reusable hooks on `main` are:

- `packages/core/src/parser/transmission-line-parser.ts` already owns bounded
  T-card parsing and is the natural home for dedicated O/LTRA parsing.
- `packages/core/src/parser/index.ts` has an explicit `.MODEL`/`LTRA` rejection
  at lines 409-417 and an explicit O-card rejection at lines 739-744. Those are
  narrow dispatch points; no `.TRAN`, `.OPTIONS`, output, or other directive
  grammar needs to change.
- `packages/core/src/circuit.ts` already has `addTransmissionLine`, model
  storage, descriptor formatting, subcircuit expansion, and compile-time device
  expansion hooks. O/LTRA can consume those hooks without modifying the
  existing lossless `TransmissionLine` implementation.
- `packages/core/src/parser/model-parser.ts` supplies generic model-token and
  number parsing, but it silently ignores bare and unknown model tokens. LTRA
  must use a strict dedicated parser rather than weakening that shared parser.

The implementation may own only these paths:

- `packages/core/src/devices/ltra-model.ts` (new dedicated model/math/expansion)
- `packages/core/src/devices/lossy-transmission-line.test.ts` (new dedicated tests)
- `packages/core/src/parser/transmission-line-parser.ts`
- `packages/core/src/parser/transmission-line-parser.test.ts`
- `packages/core/src/parser/index.ts`, limited to the existing LTRA `.MODEL`
  and O-card dispatch branches/imports
- `packages/core/src/circuit.ts`, limited to O descriptor registration,
  subcircuit handling, and compile-time LTRA expansion
- `benchmarks/ltra/compare.ts`, `benchmarks/ltra/receipt.json`, and this
  `benchmarks/ltra/SCOPE.md`

`packages/core/src/devices/transmission-line.ts` and its test remain the
independent lossless T-line implementation and must not be changed. Fixtures,
parser directives other than the narrow existing `.MODEL` dispatch, solver
convergence code, MOS, noise, PZ, BJT, aggregate reports, ROADMAP, WASM,
versions, and web are outside ownership.

## Independence checkpoint

The dedicated T-line paths are independent: the current worktree/branch scan
found no other branch changing `transmission-line.ts`,
`transmission-line-parser.ts`, its test, the proposed `ltra-model.ts`, the
proposed device test, or `benchmarks/ltra/*`.

The complete implementation is **not file-independent**, however. Current
parallel branches also change the shared integration files
`packages/core/src/parser/index.ts` and/or `packages/core/src/circuit.ts`
(`wt/m1-disto-bounded`, `wt/m1-newbpstepping-322`,
`wt/m1-sensitivity-analysis`, `wt/m1-stepped-tf`, and `wt/t_8299d6a0` at the
time of this audit). These are collision hotspots. The implementation must keep
its changes to the narrow hooks above, merge/rebase current `main` before final
verification, and resolve integration through the supervisor/reviewer. It must
not expand scope into those siblings' parser directives or analyses.

There is also no registration mechanism on `main` that enables O/LTRA without
a narrow edit to `parser/index.ts`; the current hooks explicitly reject both
the model and the device. If "do not touch parser directives" is interpreted as
forbidding even the existing `.MODEL` LTRA dispatch branch, that is a hard
blocker and a separate integration owner must provide the hook first.
