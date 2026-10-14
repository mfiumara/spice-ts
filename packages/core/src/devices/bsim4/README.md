# BSIM4 standalone junction port. Intermediate work, not transistor support

This is a coherent partial implementation for #3, not completion of the static
BSIM4 device model. `bsim4-junction.ts` is deliberately not registered or exported
through the public simulator API. LEVEL=14/54 therefore still fail with the
existing typed unsupported-level error. No MOS1/BSIM3 fallback was added.

## Ported subset

Pinned ngspice-47 SHA `a80f6e3e95d51534905b1f23410a951802666656`, `bsim4/`
family, VERSION=4.8/default. The module implements only default DIOMOD=1:

- `b4set.c:94-100,614-617,2038-2049,2074-2081`: source and drain junction
  density, emission coefficient, temperature exponent and forward-limit defaults,
  including source-to-drain inheritance and explicit zero overrides.
- `b4temp.c:52-64,200-276,372-378,2107-2129`: silicon junction density
  temperature scaling, negative-density clamp, nonpositive forward-limit reset,
  effective geometry saturation current and forward limiting voltage/current.
- `b4ld.c:700-747,802-848`: junction DC current and its analytic voltage
  derivative, including gmin, reverse exponential clamp and linear forward tail.

Inputs contain effective junction geometry, not raw instance geometry. `area`
means Aseff/Adeff in square metres, `perimeter` Pseff/Pdeff in metres, and
`gateEdge` weffCJ * nf in metres. Both area and perimeter zero disable gate-edge
current as upstream does. The future geometry port owns computation of these
quantities. Output is normalized bulk-to-source/drain current. The future device
wrapper owns polarity, reverse-channel orientation and Newton terminal stamps.
TNOM and temperatureC are degrees Celsius. The resolved Nvtm is in volts.

The API accepts only the documented junction parameter subset. Dynamic analyses,
unknown parameters, DIOMOD=0/2, unsupported VERSION families, stress/NQS/gate/body
networks and trap-assisted leakage parameters throw
`UnsupportedModelParameterError` (`UNSUPPORTED_MODEL_PARAMETER`). Invalid numeric
inputs throw `InvalidCircuitError`. These are guards on this standalone helper,
not a claim that the entire simulator integration exists.

## Executed verification

- RED: targeted vitest initially failed because the new module did not exist.
- GREEN: `pnpm -C packages/core exec vitest run src/devices/bsim4-junction.test.ts`
  passed 43 tests. Defaults, drain inheritance, explicit zero, temperature,
  limiting regimes, finite-difference analytic derivatives and guards are covered.
- `pnpm build` and `pnpm lint` passed across the workspace. Build retained existing
  CJS import.meta/browser externalization/chunk-size warnings.
- `PYTHONDONTWRITEBYTECODE=1 python3 packages/core/src/devices/bsim4/verify-junction.py SOURCE_CHECKOUT`
  passed 216 cases against actual extracted, unmodified pinned C statement slices
  compiled with clang -O0. The script verifies the source SHA and clean checkout,
  preserves upstream notices in temporary generated C, and checks all numbers are
  finite. Fixed shared relative-error limit is 2e-12, not circuit-tuned.
  Maximum relative errors, in saturationCurrent/Nvtm/current/conductance order,
  were 0, 0, 2.2173955418770883e-16 and 1.6575590663275137e-16.

The C comparison is an isolated junction-law check, not execution of the whole
ngspice simulator or full-transistor parity. No corpus outcomes, reference files
or aggregate benchmark tables were changed. Full monorepo tests were not run;
this implementation card specifically requests targeted tests. No CI, speed or
Id/gm/gds/gmbs accuracy claim is made.

## Remaining implementation scope requiring supervisor routing

1. Full channel model defaults and supported-parameter validation from b4set.c
   and b4mpar.c, with given flags, card transforms and size binning fields.
2. Genuine size/temperature preprocessing from b4temp.c, including effective
   length/width, threshold/body terms, mobility/resistance and junction geometry.
3. b4ld.c channel current plus analytic gm/gds/gmbs and any enabled static
   terminal-current contributions. Unsupported selectors must reject rather than
   drop terms. DIOMOD=0/2 and nonzero trap-assisted junction leakage remain unported.
4. Device/MNA registration, internal nodes where required, voltage limiting,
   polarity and reverse orientation, and analysis-level fail-closed guards.
5. Existing downstream validation card t_4b6eacaf must stay gated until these
   implementation pieces are complete; it owns full-oracle/corpus comparisons,
   the PR and exact-head CI. Do not release it with this helper alone.

## Licence and distribution

The port retains the original University of California 2025 ECL-2.0 notices
verbatim, plus a TypeScript modification notice. `LICENSE-ECL-2.0` contains the
full licence from SPDX. One additive `benchmarks/SOURCES.md` row records the
actual ECL-2.0 provenance, not the card's superseded BSD-3 shorthand. Tests and
the verification script are project-authored; generated C remains ECL-2.0.

The helper is not imported into the simulator bundle. Before future integration
or distribution, ensure the full ECL licence is included in the distributed
artifact. Package metadata and publication are owner-gated and untouched here.
