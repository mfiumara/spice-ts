# Controlled Sources (E/G/H/F) — Design Spec

**Date:** 2026-04-11
**Status:** Approved

## Overview

Add support for the four SPICE controlled (dependent) source types to spice-ts:

| SPICE element | Type | Symbol |
|---|---|---|
| E | Voltage-Controlled Voltage Source (VCVS) | Gain (V/V) |
| G | Voltage-Controlled Current Source (VCCS) | Transconductance (A/V) |
| H | Current-Controlled Voltage Source (CCVS) | Transimpedance (V/A) |
| F | Current-Controlled Current Source (CCCS) | Current gain (A/A) |

All four sources are linear and support DC, transient, and AC analysis.

## MNA Stamps

All indices use `bi = numNodes + branchIndex` for branch rows/columns.

### VCCS (G) — no branch variable

```
G(n+, nc+) += gm     G(n+, nc-) -= gm
G(n-, nc+) -= gm     G(n-, nc-) += gm
```

### VCVS (E) — 1 new branch (like a voltage source)

```
G(n+, bi)  += 1      G(n-, bi)  -= 1       ← KCL coupling
G(bi, n+)  += 1      G(bi, n-)  -= 1       ← KVL constraint row
G(bi, nc+) -= gain   G(bi, nc-) += gain    ← control voltage coupling
b(bi) = 0
```

### CCCS (F) — no new branch; stamps into controlling V-source's branch column

```
G(n+, bi_ctrl) += gain
G(n-, bi_ctrl) -= gain
```

### CCVS (H) — 1 new branch; stamps into own branch row and controlling branch column

```
G(n+, bi)      += 1      G(n-, bi)      -= 1    ← KCL coupling
G(bi, n+)      += 1      G(bi, n-)      -= 1    ← KVL constraint row
G(bi, bi_ctrl) -= gain                           ← control current coupling
b(bi) = 0
```

All four are linear (`isNonlinear = false`). `stampAC()` uses identical stamps as `stamp()` — no omega dependence.

## File Structure

Four new device files, one per source type, following the existing pattern:

```
src/devices/vcvs.ts     VCVS class
src/devices/vccs.ts     VCCS class
src/devices/ccvs.ts     CCVS class
src/devices/cccs.ts     CCCS class
```

Exported from `src/devices/index.ts`.

## Circuit API

Four new methods on the `Circuit` class:

```typescript
addVCVS(name: string, nPlus: string, nMinus: string, ncPlus: string, ncMinus: string, gain: number): void
addVCCS(name: string, nPlus: string, nMinus: string, ncPlus: string, ncMinus: string, gm: number): void
addCCVS(name: string, nPlus: string, nMinus: string, controlSource: string, gain: number): void
addCCCS(name: string, nPlus: string, nMinus: string, controlSource: string, gain: number): void
```

`controlSource` is the name of a voltage source whose branch current is the controlling quantity.

A new optional `controlSource?: string` field is added to `DeviceDescriptor`. The existing `value` field carries the gain/gm scalar.

## Compilation Strategy

`compile()` in `circuit.ts` is updated with a two-pass approach:

**Pass 1 — branch counting:** Iterate descriptors, count all sources that need a branch variable: V, L (existing), E, H (new). This sets `numBranches` before the MNA matrix is allocated.

**Pass 2 — device instantiation:** Iterate descriptors again, assign branch indices sequentially, maintain a `Map<string, DeviceModel>` populated as each device is built. When an H or F descriptor is reached, look up the controlling source by name in this map to retrieve `branches[0]`. If the controlling source is not found, throw a descriptive error.

The controlling V-source must be declared before the H or F element in the netlist (or in programmatic `addCCVS`/`addCCCS` calls). This is an implementation constraint: the forward pass populates the device map in order, so a forward reference will produce a clear error at compile time. Standard SPICE has no such ordering requirement; this constraint may be lifted in a future two-pass compilation.

## Parser

New cases in `parseDevice()` (`src/parser/index.ts`):

| Element | Syntax | Tokens |
|---|---|---|
| E | `E<name> n+ n- nc+ nc- gain` | 7 |
| G | `G<name> n+ n- nc+ nc- gm` | 7 |
| H | `H<name> n+ n- Vsense gain` | 6 |
| F | `F<name> n+ n- Vsense gain` | 6 |

Gain/gm values are parsed through the existing `parseNumber()` function — SI suffixes and parametric expressions work automatically.

## Testing

### Unit tests — `src/devices/controlled-sources.test.ts`

One `describe` block per source type. Each test:
1. Constructs an `MNAAssembler` with the correct node/branch count
2. Calls `stamp()` on the device
3. Asserts exact G matrix entries and b vector values

### Integration tests

Full DC operating-point circuits with closed-form expected values:

| Circuit | Source used | Expected result |
|---|---|---|
| Transconductance amp (Vin, R_load) | VCCS | Vout = gm × Vin × R_load |
| Voltage amplifier | VCVS | Vout = gain × Vin |
| Transimpedance amp (V-sense resistor) | CCVS | Vout = gain × I_sense |
| Current mirror | CCCS | I_out = gain × I_sense |

One AC integration test: inverting op-amp model using a VCVS (gain = −1×10^5) with feedback resistors. Verify closed-loop gain at mid-band matches −Rf/Rin.

### Parser tests

Netlist strings for all four element types added to the existing parser test suite, verifying device type and parameter values.

## Files Changed

| File | Change |
|---|---|
| `src/devices/vcvs.ts` | New |
| `src/devices/vccs.ts` | New |
| `src/devices/ccvs.ts` | New |
| `src/devices/cccs.ts` | New |
| `src/devices/index.ts` | Export four new classes |
| `src/circuit.ts` | Add four API methods; update `DeviceDescriptor`; extend `compile()` with two-pass branch counting and E/G/H/F cases |
| `src/parser/index.ts` | Add E/G/H/F cases to `parseDevice()` |
| `src/devices/controlled-sources.test.ts` | New unit tests |
| `src/circuit.test.ts` (or new integration file) | New integration tests |
| `src/parser/parser.test.ts` | New parser test cases |
