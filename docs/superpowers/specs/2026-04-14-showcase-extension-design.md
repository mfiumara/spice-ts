# Showcase Extension Design

**Date:** 2026-04-14  
**Status:** Approved

---

## Overview

Extend the spice-ts showcase with three things:

1. Implement netlists for all 9 "Coming soon" placeholder circuits
2. Add a new **Power Electronics** group (Buck, Boost, Buck-Boost converters)
3. Add a **DC sweep** analysis type — new `DCSweepPlot` component in `@spice-ts/ui/react` + DC panel in the showcase
4. Add a **collapsible circuit diagram panel** in the sidebar showing a syntax-highlighted netlist for the active circuit

---

## 1. DCSweepPlot Component

**Location:** `packages/ui/src/react/DCSweepPlot.tsx`

**New type** added to `packages/ui/src/core/types.ts`:

```ts
export interface DCSweepDataset {
  sweepValues: number[];
  signals: Map<string, number[]>;
  label?: string;
}
```

**Component props:**

```ts
interface DCSweepPlotProps {
  data: DCSweepDataset[];
  signals: string[];
  theme?: 'dark' | 'light' | ThemeConfig;
  colors?: Record<string, string>;
  height?: number;
  xDomain?: [number, number];
  xLabel?: string;           // default "Sweep (V)"
  onCursorMove?: (cursor: CursorState | null) => void;
  signalVisibility?: Record<string, boolean>;
}
```

Canvas-based, uses existing `renderer.ts` / `scales.ts` / `interaction.ts` machinery — same pattern as `TransientPlot`. X-axis is sweep source value, Y-axis is node voltage/current.

Exported from `packages/ui/src/react/index.ts`.

**Simulation path:** DC sweeps are synchronous — call `simulate()` (not `simulateStepStream`), extract `result.dcSweep`, build `DCSweepDataset[]`. No streaming needed.

---

## 2. Circuit Netlists

### CircuitDef interface changes

```ts
interface CircuitDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  group: string;
  tag?: string;
  tranNetlist?: string;
  acNetlist?: string;
  dcNetlist?: string;      // NEW — for .dc sweep circuits
  xLabel?: string;         // NEW — x-axis label for DC sweep plot
  signals: string[];
}
```

### Filters group

**RLC Bandpass**
- `.tran`: Series RLC, impulse in, voltage across C (`n1`). `V1 PULSE(0 5 0 1n 1n 1u 100u)`, R1=100Ω, L1=10mH, C1=1µF. Stop=2ms.
- `.ac`: same topology, `V1 AC 1`, `.ac dec 100 10 100k`
- signals: `['n1']`

**Sallen-Key Low-Pass**
- `.ac` only: Unity-gain 2nd-order via VCVS (`E1 out 0 n2 0 1e6`). R1=R2=10k, C1=C2=10n. `.ac dec 100 10 1Meg`
- signals: `['out']`

### Non-Linear group

**CMOS Inverter**
- `.dc` only: BSIM3v3 (Level 49) NMOS + PMOS, VDD=1.8V. `.dc VIN 0 1.8 0.01`
- `xLabel: 'Vin (V)'`
- signals: `['out']`

**Half-Wave Rectifier**
- `.tran`: `V1 SIN(0 5 1k)`, Rs=10Ω, D1 (IS=1e-14 N=1), Rl=10k, Cl=10µF. Stop=4ms.
- signals: `['in', 'out']` (show both input and rectified output)

**Common-Source Amp**
- `.ac`: Level-1 NMOS (VTO=1 KP=1e-4), VDD=5V, VGS=1.5V DC + AC 1, RD=10k. `.ac dec 100 1 10Meg`
- signals: `['out']`

### Opamp Circuits group

**Inverting Amplifier**
- `.tran` + `.step param Rf list 1k 10k 100k`: VCVS opamp (gain 1e6), Rin=1k, `V1 PULSE(0 0.1 0 1u 1u 5m 10m)`. Stop=20ms.
- signals: `['out']`

**Integrator**
- `.tran`: VCVS opamp, `V1 PULSE(-1 1 0 1n 1n 5m 10m)`, Rin=10k, Cf=100n. Stop=20ms.
- signals: `['in', 'out']`

### Impulse Response group

**RLC Step Response**
- `.tran` + `.step param R1 list 10 200 1k`: `V1 PULSE(0 5 0 1n 1n 50m 100m)`, L1=10mH, C1=100µF. Stop=10ms. Three damping regimes.
- signals: `['n1']`

**LC Tank**
- `.tran`: Rs=10Ω, L1=10mH, C1=10nF. `V1 PULSE(0 5 0 1n 1n 5u 200u)`. Stop=200µs. f₀ ≈ 15.9 kHz.
- signals: `['out']`

### Power Electronics group (new)

**Buck Converter**
- `.tran`: Vin=12V DC, Vg PULSE(0 15 0 1n 1n 5u 10u), Level-1 NMOS (VTO=2 KP=10) W=1m L=1u, freewheeling diode, L1=100µH, C1=100µF, Rload=10Ω. Stop=200µs.
- signals: `['out']`

**Boost Converter**
- `.tran`: Vin=5V DC, Vg PULSE(0 15 0 1n 1n 5u 10u), same MOSFET model, L1=100µH, D1, C1=100µF, Rload=10Ω. Stop=300µs.
- signals: `['out']`

**Buck-Boost Converter**
- `.tran`: Vin=12V DC, Vg PULSE(0 15 0 1n 1n 5u 10u), inverting topology. L1=100µH, D1, C1=100µF, Rload=10Ω. signals: `['neg']` (negative output). Stop=200µs.
- signals: `['neg']`

---

## 3. Showcase UI Changes

### activeView state

Gains a `'dc'` variant: `'tran' | 'ac' | 'dc'`

### Toolbar

"DC Sweep" button appears when `circuit.dcNetlist` exists. Active state styling matches existing Transient/AC buttons.

### DC panel

Uses `DCSweepPlot` (new component). X-axis label from `circuit.xLabel ?? 'Sweep (V)'`. Since `simulate()` is synchronous-ish (no streaming), the run handler calls it directly, sets `dcData` state in one shot. `running` state still wraps it (blocks the Run button, shows "Simulating…" status bar text).

### Accumulators

New `buildDCSweepDatasets(result: DCSweepResult, signals: string[]): DCSweepDataset[]` helper in `main.tsx`.

### Sidebar — circuit diagram panel

Below the circuit list, a collapsible section labelled "Circuit". Expanded by default. Shows the active circuit's netlist (whichever of `tranNetlist`, `acNetlist`, `dcNetlist` matches `activeView`) with inline syntax highlighting:

- Device refs (V, R, C, L, M, D, E prefixes) → blue (`#7ec8e3`)
- Numeric values → amber (`#f0b97a`)
- `.step`, `.model` directives → purple (`#c8a3e3`)
- Comments (`*` lines) → grey (`#666`)
- Everything else → muted white (`#ccc`)

Implemented as a pure React component in `main.tsx` (no external dep). Font: monospace, 11px, line-height 1.7. Panel has a fixed max-height with `overflow-y: auto`.

This panel is a placeholder — will be replaced with an actual schematic renderer in a future iteration.

---

## 4. Files Changed

| File | Change |
|------|--------|
| `packages/ui/src/core/types.ts` | Add `DCSweepDataset` type |
| `packages/ui/src/core/index.ts` | Export `DCSweepDataset` |
| `packages/ui/src/react/DCSweepPlot.tsx` | New component |
| `packages/ui/src/react/index.ts` | Export `DCSweepPlot` |
| `examples/showcase/main.tsx` | All circuit netlists, DC panel, diagram sidebar, `activeView` dc variant |
| `examples/showcase/showcase.css` | Styles for diagram panel, DC panel |

---

## Out of Scope

- Actual schematic renderer (SVG/Canvas circuit drawing) — future work
- Streaming DC sweep — not needed, DC sweeps are fast
- New unit tests for `DCSweepPlot` — follow-up
