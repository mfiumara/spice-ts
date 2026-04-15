# Schematic Rendering Fixes Design

**Date:** 2026-04-15
**Related:** #34 (Circuit IR)

## Problem

The schematic renderer has three categories of bugs visible in complex circuits (buck-boost converter, inverting amplifier):

1. **Pin mapping mismatches** — MOSFET symbol pins are in wrong order vs IR ports, opamp (E/G) has 3 pins for 4 ports, F/H controlled sources have no symbol
2. **Layout piling** — BFS column assignment puts too many components in one column when they share power/ground nets
3. **Wire overlap** — L-shaped routing creates overlapping segments in dense circuits

## Pin Mapping Fixes

### MOSFET (M) — symbol pin reorder

IR ports: `[drain, gate, source, (bulk)]`
Current symbol pins: `[gate(0,cy), drain(w,gy0), source(w,gy1)]` — **wrong order**

Fix: reorder symbol pins to match IR convention:
```
pin 0: drain  → (w, gy0)    right upper
pin 1: gate   → (0, cy)     left center
pin 2: source → (w, gy1)    right lower
```

### E/G (VCVS/VCCS) — port reorder + keep 3-pin symbol

A VCVS has 4 SPICE terminals (outP, outN, ctrlP, ctrlN) but is rendered as a 3-pin opamp triangle (+in, -in, out). The 4th terminal (outN) is almost always ground.

Current IR port order: `[outP, outN, ctrlP, ctrlN]`
Symbol pins: `[+in, -in, out]` — ports map to wrong pins.

Fix: reorder IR ports to `[ctrlP, ctrlN, outP, outN]` so the first 3 match the symbol:
- Pin 0: +in → ctrlP
- Pin 1: -in → ctrlN
- Pin 2: out → outP
- outN (4th port) renders as a ground stub or extra wire, handled by existing ground symbol logic.

### F/H (current-controlled sources) — add diamond symbol

Currently falls back to resistor symbol (2-pin horizontal). Add a diamond-shaped dependent source symbol with 2 pins (outP top, outN bottom), matching the standard IEEE notation for dependent sources.

## Layout Improvements

### Column assignment — signal-flow priority

Current BFS places any component sharing a net with the frontier into the next column. Power nets (VDD, ground-adjacent) cause unrelated components to pile into one column.

Fix: when evaluating whether a component belongs in the next column, prioritize **input/signal nets** over power nets. A component should be placed based on its most meaningful signal connection to the frontier, not just any shared net. Heuristic: for multi-terminal devices, prefer placement based on input pin nets (gate for M, base for Q, ctrlP/ctrlN for E/G).

### Vertical alignment — align by input pin

Current logic aligns the "first non-ground pin" to a horizontal signal rail. For a MOSFET where drain=VDD (port 0), this aligns the drain — but the gate is the meaningful signal connection.

Fix: for multi-terminal devices, align by the **input pin** rather than port 0:
- MOSFET: align by gate (pin 1)
- BJT: align by base (pin 1)
- E/G opamp: align by +in (pin 0) — already correct after port reorder

For 2-terminal devices (R, C, L, V, I, D), the current "first non-ground" logic is fine.

### Wire routing — offset corridors

Current routing uses the midpoint X between two pins for vertical segments. When multiple nets route through the same area, segments overlap.

Fix: offset the vertical routing corridor per-net so parallel wires don't overlap. Use a small horizontal offset (e.g., half a grid unit) for each additional net routing through the same column gap.

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/ir/builder.ts` | Reorder E/G ports to `[ctrlP, ctrlN, outP, outN]` |
| `packages/ui/src/schematic/symbols.ts` | Fix MOSFET pin order; add F/H diamond symbol |
| `packages/ui/src/schematic/layout.ts` | Input-pin alignment; signal-flow column priority; wire corridor offsets |
| `packages/core/src/ir/ir.test.ts` | Update E/G port order expectations |
| `packages/ui/src/schematic/layout.test.ts` | Update layout tests for new alignment behavior |

## Out of Scope

- Subcircuit (X) symbol — falls back to generic box, acceptable for now
- Zoom/pan interaction
- Manual layout overrides
- Rotation of components
