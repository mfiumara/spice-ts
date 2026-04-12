# @spice-ts/ui — Waveform Viewer Design

## Overview

A framework-agnostic waveform viewer package for displaying spice-ts simulation results. Ships a pure TypeScript Canvas-based rendering core with React bindings as the first framework adapter. Designed for real-time streaming, interactive exploration, and eventual multi-framework support.

**Package:** `@spice-ts/ui` under `packages/ui/`

## Scope

### In scope (v1)

- Transient waveform plot (voltage/current vs. time)
- AC Bode plot (magnitude + phase vs. frequency, dual-pane, collapsible)
- Canvas-based rendering with d3-scale/d3-array for scale math
- Zoom (scroll wheel, centered on cursor), pan (click-drag), single cursor with value readout
- Streaming support — append-only live rendering from `simulateStream()`
- Multi-result overlay — display a family of curves (for parametric sweeps / `.step`)
- Dark and light themes (shadcn-inspired aesthetic)
- Legend with click-to-toggle signal visibility (Plotly-style)
- React bindings via `@spice-ts/ui/react` subpath
- Composable component API with a pre-composed convenience component

### Out of scope (future)

- DC sweep plot, DC operating point table, Fourier analysis view
- Dual cursors for delta measurements
- Headless hooks API (`useWaveform()`)
- Svelte / other framework bindings
- Zero-dependency mode (replace d3-scale/d3-array with hand-rolled implementations)
- WebGL rendering path

## Architecture

### Two-layer design

```
@spice-ts/ui
├── src/
│   ├── core/                  ← Framework-agnostic, pure TS + Canvas
│   │   ├── renderer.ts            Transient waveform Canvas renderer
│   │   ├── bode-renderer.ts       Bode plot renderer (dual-pane magnitude/phase)
│   │   ├── scales.ts              d3-scale wrappers: time, frequency, voltage, dB, phase
│   │   ├── interaction.ts         Zoom (wheel), pan (drag), cursor (hover) handlers
│   │   ├── streaming.ts           Append-only typed array buffer + rAF redraw loop
│   │   ├── theme.ts               Theme config objects (dark + light presets)
│   │   └── types.ts               Shared types (SignalData, CursorState, etc.)
│   ├── react/                 ← React bindings
│   │   ├── WaveformViewer.tsx     Pre-composed default component
│   │   ├── TransientPlot.tsx      Composable: single transient canvas
│   │   ├── BodePlot.tsx           Composable: Bode magnitude + phase (collapsible)
│   │   ├── Legend.tsx             Click-to-toggle signal visibility
│   │   ├── CursorTooltip.tsx      DOM overlay for value readout on hover
│   │   └── index.ts
│   └── index.ts               ← Vanilla core exports
├── package.json
└── tsconfig.json
```

**Core layer** — zero framework dependencies. Takes an `HTMLCanvasElement` and data arrays. Handles all rendering, interaction state, scale computation, and streaming. Emits events (cursor move, zoom change, signal toggle) for framework layers to consume.

**React layer** — thin lifecycle wrapper. Manages canvas refs, `ResizeObserver`, and bridges core events to React state for DOM overlays (tooltip, legend). React + react-dom are peer dependencies of the `/react` subpath only.

### Subpath exports

```jsonc
// package.json
{
  "exports": {
    ".": {
      "types": "./dist/core/index.d.ts",
      "import": "./dist/core/index.js"
    },
    "./react": {
      "types": "./dist/react/index.d.ts",
      "import": "./dist/react/index.js"
    }
  }
}
```

Consumers import `@spice-ts/ui` for the vanilla core or `@spice-ts/ui/react` for React components. Future framework adapters (Svelte, etc.) get their own subpaths.

## Component API (React)

### Simple path — one component

```tsx
import { WaveformViewer } from '@spice-ts/ui/react';
import { simulate } from '@spice-ts/core';

const result = await simulate(netlist);

<WaveformViewer
  transient={result.transient}
  signals={['out', 'in']}
  theme="dark"
/>
```

### Composable path — mix and match

```tsx
import { TransientPlot, BodePlot, Legend, CursorTooltip } from '@spice-ts/ui/react';

<div className="my-layout">
  <TransientPlot data={result.transient} signals={['out']} theme="dark" />
  <BodePlot data={result.ac} signals={['out']} defaultPanes="both" />
  <Legend signals={signals} onToggle={handleToggle} />
  <CursorTooltip />
</div>
```

### Streaming path

```tsx
<WaveformViewer
  stream={simulateStream(netlist)}
  signals={['out', 'in']}
  theme="dark"
/>
```

### Multi-result overlay (family of curves)

For parametric sweeps (manual or via future `.step` support, issue #21):

```tsx
// From .step results
<BodePlot
  data={result.steps.map(s => ({
    ac: s.ac,
    label: `${s.paramName} = ${s.paramValue}`,
  }))}
  signals={['out']}
/>

// Manual overlay of multiple simulation runs
<TransientPlot
  data={[
    { transient: result1.transient, label: 'R1 = 1k' },
    { transient: result2.transient, label: 'R1 = 10k' },
  ]}
  signals={['out']}
/>
```

Each curve gets its own color from the palette. Legend shows per-curve toggles.

## Prop types

```typescript
// --- TransientPlot ---
interface TransientPlotProps {
  data: TransientResult | TransientDataset[];
  signals: string[];                        // Node/branch names to display
  colors?: Record<string, string>;          // Signal name → color override
  theme?: 'dark' | 'light' | ThemeConfig;
  width?: number | string;                  // CSS value, default '100%'
  height?: number | string;                 // CSS value, default 300
  onCursorMove?: (cursor: CursorState | null) => void;
}

interface TransientDataset {
  transient: TransientResult;
  label: string;
}

// --- BodePlot ---
interface BodePlotProps {
  data: ACResult | ACDataset[];
  signals: string[];
  colors?: Record<string, string>;
  theme?: 'dark' | 'light' | ThemeConfig;
  defaultPanes?: 'both' | 'magnitude' | 'phase';  // default: 'both'
  width?: number | string;
  height?: number | string;
  onCursorMove?: (cursor: CursorState | null) => void;
}

interface ACDataset {
  ac: ACResult;
  label: string;
}

// --- WaveformViewer (pre-composed) ---
// When both transient and ac are provided, renders them stacked vertically
// (transient on top, Bode below). When streaming, displays only the
// analysis type being streamed.
interface WaveformViewerProps {
  transient?: TransientResult | TransientDataset[];
  ac?: ACResult | ACDataset[];
  stream?: AsyncIterableIterator<TransientStep | ACPoint>;
  signals: string[];
  colors?: Record<string, string>;
  theme?: 'dark' | 'light' | ThemeConfig;
}

// --- Legend ---
interface LegendProps {
  signals: SignalInfo[];
  onToggle: (signalId: string) => void;
}

interface SignalInfo {
  id: string;           // e.g. "out" or "R1=1k:out"
  label: string;
  color: string;
  visible: boolean;
}

// --- Shared ---
interface CursorState {
  x: number;              // Data-space x value (time in s, or frequency in Hz)
  values: CursorValue[];  // One per visible signal
}

interface CursorValue {
  signalId: string;
  label: string;
  value: number;          // Voltage, current, magnitude, or phase
  unit: string;           // 'V', 'A', 'dB', '°'
  color: string;
}
```

## Interaction model

| Action | Input | Behavior |
|--------|-------|----------|
| Zoom | Scroll wheel | Zoom centered on cursor position. Horizontal by default, Shift+scroll for vertical |
| Pan | Click + drag | Pan the visible window in both axes |
| Cursor | Hover | Vertical crosshair snaps to nearest data point, tooltip shows values for all visible signals |
| Toggle signal | Click legend item | Hide/show signal. Hidden items are dimmed in legend |
| Fit | Double-click (or toolbar button) | Reset zoom to fit all data in view |
| Collapse pane | Click pane header (Bode only) | Toggle magnitude or phase pane visibility |

Zoom and pan operate on the same scale instances, so cursor readout stays accurate at any zoom level.

## Streaming

- The `stream` prop accepts an `AsyncIterableIterator<TransientStep | ACPoint>` from `simulateStream()`
- Core maintains a growable `Float64Array` buffer per signal (doubles capacity on overflow)
- A `requestAnimationFrame` loop redraws at display refresh rate, decoupled from data arrival rate
- X-axis auto-extends as new data arrives; if the analysis stop time is known, the axis is pre-scaled
- The waveform draws progressively left-to-right (append-only, like an oscilloscope trace)
- When the iterator completes, the viewer transitions to static mode with full zoom/pan

## Rendering

### Canvas core

All waveform lines, grid, axes, and cursor crosshair are drawn on an HTML5 Canvas 2D context.

- **High-DPI:** Canvas dimensions scaled by `devicePixelRatio`, CSS size unchanged
- **Grid:** Subtle lines at tick positions, styled per theme
- **Waveform lines:** `ctx.lineTo()` paths, one per signal. Line width scales with DPI.
- **Axis labels:** Canvas `fillText()` at tick positions. SI-prefix formatting (1kHz, 2.5ms, etc.)
- **Cursor:** Dashed vertical line + filled circles at intersection with each visible signal

### DOM overlay (React layer)

- **Cursor tooltip:** Absolutely positioned `<div>` tracking cursor position. Shows time/frequency + values for all visible signals with color swatches. Styled with CSS variables for theming.
- **Legend:** Flex row of signal labels with color indicators. Click toggles visibility.
- **Toolbar:** Fit/reset buttons, Bode pane toggles. Standard DOM elements.

### Bode plot specifics

- Two stacked Canvas elements: magnitude (top) and phase (bottom)
- Shared log-frequency x-axis (labels on the phase pane only)
- Magnitude y-axis in dB, phase y-axis in degrees
- Each pane independently collapsible via a header toggle
- -3dB reference line on magnitude pane (configurable)
- Default: both panes visible

## Theming

Two built-in presets: `dark` and `light`, inspired by shadcn/ui aesthetic.

```typescript
interface ThemeConfig {
  background: string;       // Plot area background
  surface: string;          // Container/toolbar background
  border: string;           // Borders and dividers
  grid: string;             // Grid lines
  text: string;             // Primary text (labels, values)
  textMuted: string;        // Secondary text (axis labels)
  cursor: string;           // Cursor crosshair line
  tooltipBg: string;        // Tooltip background
  tooltipBorder: string;    // Tooltip border
  font: string;             // Font family
  fontSize: number;         // Base font size in px
}
```

- `theme="dark"` or `theme="light"` selects a preset
- Pass a partial `ThemeConfig` object to override specific values
- React layer maps theme colors to CSS custom properties for DOM elements
- Canvas core reads the `ThemeConfig` directly for draw calls

### Signal colors

Default palette of 8 distinguishable colors (colorblind-friendly). Override per-signal via the `colors` prop. For multi-result overlays, colors auto-assign from the palette per curve, with the legend showing both signal name and dataset label.

## Dependencies

| Dependency | Purpose | Approx size |
|-----------|---------|-------------|
| `d3-scale` | Linear/log scale computation, tick generation | ~8KB |
| `d3-array` | Data bisecting (cursor snap), extent computation | ~4KB |

**Peer dependencies:**
- `@spice-ts/core` — result types (`TransientResult`, `ACResult`, etc.)
- `react` ≥ 18, `react-dom` ≥ 18 — only required for `@spice-ts/ui/react` subpath

## Testing strategy

- **Unit tests (Vitest):** Scale computation, data buffering, streaming buffer, theme merging, SI formatting
- **Rendering tests:** Snapshot comparison of Canvas draw calls using a mock Canvas context (verify correct `lineTo`, `fillText` calls for known data)
- **Integration tests:** React component mounting, prop updates, resize handling via `@testing-library/react`
- **Manual verification:** Example app in `examples/` that runs a simulation and displays results in the viewer (dev server for visual testing)

## Future extensibility

- **Additional plot types:** DC sweep (X-Y curve), Fourier spectrum — new renderer in `core/`, new component in `react/`
- **Dual cursors:** Add a second cursor mode to `interaction.ts` for delta measurements
- **Headless API:** Extract scale/state logic from `core/` into a `headless/` module, expose as `@spice-ts/ui/headless`
- **Framework adapters:** Add `@spice-ts/ui/svelte`, `@spice-ts/ui/vue` subpaths wrapping the same core
- **Zero-dep mode:** Replace d3-scale/d3-array with hand-rolled scale + bisect implementations
- **Parametric sweep integration:** When `.step` lands in core (issue #21), the multi-result overlay API handles it natively

## Related issues

- Issue #11 — this spec
- Issue #12 — `@spice-ts/designer` (depends on this package for waveform display)
- Issue #21 — `.step` parametric sweep in core (multi-result overlay designed to consume this)
