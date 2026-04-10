# BSIM3v3 Model + Benchmarks Design

## Overview

Add a BSIM3v3 MOSFET compact model (core DC + capacitance, ~50-60 parameters) and expand benchmarks with BSIM3 validation circuits and analog building blocks. Validate via analytical checks and ngspice reference data.

## BSIM3v3 Model Architecture

### File structure

```
packages/core/src/devices/
  bsim3v3.ts          -- DeviceModel implementation (4-terminal)
  bsim3v3-params.ts   -- Parameter definitions, defaults, derived param computation
  bsim3v3-dc.ts       -- DC current/conductance evaluation (pure function)
  bsim3v3-cap.ts      -- Charge-based capacitance evaluation (pure function)
```

### Parameters (`bsim3v3-params.ts`)

Model parameters (user-specified via `.model` cards):

| Category | Parameters | Purpose |
|----------|-----------|---------|
| Threshold | VTH0, K1, K2, K3, K3B, W0, DVT0, DVT1, DVT2, NLX, VOFF, NFACTOR | Vth as f(Vbs, Leff, Weff) |
| Mobility | U0, UA, UB, UC, VSAT | Vertical/lateral field degradation |
| Drain current | A0, AGS, A1, A2, KETA, RDSW, PRWB, PRWG, WR | Ids core computation |
| Output conductance | PCLM, PDIBLC1, PDIBLC2, PDIBLCB, DROUT, PVAG | CLM, DIBL effects |
| Subthreshold | VOFF, NFACTOR, CDSC, CDSCB, CDSCD, ETA0, ETAB, DSUB | Weak inversion |
| Geometry | WINT, LINT, TOX, XJ, NCH, NSUB | Process geometry |
| Capacitance | CGSO, CGDO, CGBO, CJ, CJSW, CJSWG, MJ, MJSW, PB, PBSW | Overlap + junction caps |

Derived parameters (computed once at construction):

- `Leff = L - 2*LINT`, `Weff = W - 2*WINT`
- `Cox = EPSOX / TOX`
- `Vth0_adjusted` (with short/narrow channel effects)
- Junction areas/perimeters from W, L defaults

Exported as `computeDerived(model, instance)` returning a frozen object.

### DC Evaluation (`bsim3v3-dc.ts`)

Pure function: `evaluateDC(params, derived, Vgs, Vds, Vbs)` returns `{ Ids, gm, gds, gmbs }`.

Evaluation flow:

1. **Vth** -- threshold including body effect (K1, K2), short-channel (DVT0/1/2), narrow-width (K3, W0)
2. **Mobility** -- ueff from U0 with vertical field degradation (UA, UB, UC)
3. **Vdsat** -- saturation voltage from velocity saturation (VSAT) and mobility
4. **Ids** -- unified current expression covering linear to saturation smoothly
5. **Output conductance corrections** -- CLM (PCLM), DIBL (PDIBLC1/2), early voltage (PVAG)
6. **Subthreshold** -- smooth transition using VOFF, NFACTOR for Vgs < Vth
7. **Derivatives** -- gm, gds, gmbs computed analytically alongside Ids

### Capacitance Evaluation (`bsim3v3-cap.ts`)

Pure function: `evaluateCap(params, derived, Vgs, Vds, Vbs)` returns capacitance matrix entries `{ Cgg, Cgd, Cgs, Cgb, Cdd, Css, Cbb, ... }`.

- Intrinsic caps: charge-based model with Ward-Dutton charge partitioning
- Overlap caps: CGSO, CGDO, CGBO scaled by Weff
- Junction caps: CJ, CJSW with bias-dependent depletion (MJ, PB)

### Main Device Class (`bsim3v3.ts`)

```typescript
class BSIM3v3 implements DeviceModel {
  nodes: [drain, gate, source, bulk]  // 4-terminal
  stamp(ctx): void       // calls evaluateDC, stamps NR companion
  stampDynamic(ctx): void // calls evaluateCap, stamps charge companions
  stampAC(ctx, omega): void // linearized small-signal + jwC
}
```

Key difference from Level 1: 4 terminals (bulk/body is explicit, not tied to source).

Polarity: NMOS polarity=1, PMOS polarity=-1. Same pattern as existing Level 1 MOSFET.

## Benchmark Circuits

### BSIM3 Validation Circuits (`benchmarks/circuits/bsim3-validation.ts`)

Each generator accepts a BSIM3 model card string for process corner flexibility.

| Circuit | What it validates | Validation method |
|---------|------------------|-------------------|
| Id-Vgs sweep (NMOS) | Vds=50mV (linear) and Vds=1V (sat), Vgs 0-1.8V. Threshold, subthreshold slope, mobility degradation | Analytical + ngspice |
| Id-Vds family (NMOS) | Vgs = 0.6/0.9/1.2/1.5/1.8V, Vds 0-1.8V. Linear/sat regions, output conductance | ngspice reference |
| Id-Vgs sweep (PMOS) | Mirror of NMOS sweep. Polarity handling | Analytical + ngspice |
| Body effect | Vbs swept 0 to -2V at fixed Vgs/Vds. K1, K2 coefficients | Analytical (Vth shift ~ K1*(sqrt(phi-Vbs) - sqrt(phi))) |
| Subthreshold swing | Id-Vgs log scale, extract mV/decade. VOFF, NFACTOR, CDSC | Analytical (SS ~ n*Vt*ln(10)) |
| Cgg vs Vgs | Vds=0, Vgs -1 to 2V. Accumulation/depletion/inversion transition | ngspice reference |

### Analog Building Blocks (`benchmarks/circuits/analog-blocks.ts`)

| Circuit | Devices | Analysis | Purpose |
|---------|---------|----------|---------|
| NMOS current mirror (1:1) | 2-4 MOSFETs | DC | Matching, output resistance |
| Cascode amplifier | 4 MOSFETs + bias | DC + AC | High-gain single stage |
| Two-stage Miller op-amp | ~8 MOSFETs + Cc, Rz | DC + AC | GBW, phase margin |
| Folded-cascode op-amp | ~10 MOSFETs + bias | DC + AC | Realistic analog, convergence stress |
| Bandgap reference | 2 BJTs + ~6 MOSFETs + R | DC | Cross-device (BJT + BSIM3) |
| 6T SRAM cell | 6 MOSFETs | DC + transient | Bistable convergence, read/write |

All generators produce SPICE netlists compatible with spice-ts and ngspice.

### Reference Data

- Stored in `benchmarks/accuracy-results.json` (extending existing pattern)
- Structure: `{ "bsim3/id-vgs-nmos": { "ngspice_version": "42", "data": [...] }, ... }`
- ngspice reference generated via `benchmarks/scripts/generate-reference.sh`

## Test Strategy

### Unit Tests

| File | Covers | Method |
|------|--------|--------|
| `bsim3v3-params.test.ts` | Derived params (Leff, Weff, Cox), defaults, edge cases | Analytical |
| `bsim3v3-dc.test.ts` | evaluateDC in isolation: cutoff/linear/sat, subthreshold, region boundary continuity | Analytical + numerical continuity |
| `bsim3v3-cap.test.ts` | evaluateCap: accumulation/depletion/inversion, overlap, junction caps | Analytical (Cgg -> Cox*W*L in strong inversion) |
| `bsim3v3.test.ts` | Full stamp: 4-terminal, NR convergence, NMOS/PMOS polarity | Single-device OP vs analytical + ngspice |

### Integration Tests (via `simulate()`)

| Test | Circuit | Assertion |
|------|---------|-----------|
| Id-Vgs DC sweep | Single NMOS `.dc` | Within 2% of ngspice above threshold, 10% subthreshold |
| Id-Vds family | Single NMOS `.dc` | Within 2% of ngspice |
| Current mirror | 2T mirror | Iout/Iref within 1% of ngspice |
| Two-stage op-amp | Miller op-amp | DC gain within 5%, GBW within 10% |
| SRAM cell | 6T cell | Finds both stable states, read/write transient completes |

### Benchmark Tests (performance)

New `bsim3.bench.ts`:
- Single MOSFET DC sweep speed baseline
- Inverter chain with BSIM3 models
- Two-stage op-amp transient

Track BSIM3 within ~5-10x of Level 1 speed.

### Tolerance Rationale

- **2% strong-inversion DC**: deterministic equations, differences from smoothing/limiting details
- **10% subthreshold**: exponential region amplifies small Vth differences
- **5-10% AC/complex circuits**: accumulated errors across multiple devices

## Parser Integration

The existing `.model` parser needs to:
- Recognize `NMOS`/`PMOS` with `LEVEL=49` (BSIM3v3 convention) or `LEVEL=8` (alternate)
- Default (no LEVEL or LEVEL=1) continues to use Level 1 `MOSFET`
- Route LEVEL=49/8 to `BSIM3v3` class
- Pass all parameters through (BSIM3v3 constructor handles defaults)

MOSFET instance lines (`M1 d g s b MODEL W=... L=...`) already parse 4 terminals; Level 1 currently ignores the bulk node. BSIM3v3 uses it.

## Out of Scope

- Temperature dependence (TNOM, KT1, KT2, etc.)
- Noise model (NOIA, NOIB, NOIC)
- Parameter binning
- BSIM4 (future, builds on this)
- Sparse solver (issue #8, independent)
