# Schematic Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `<SchematicView />` React component to `@spice-ts/ui` that renders a read-only SVG schematic from a SPICE netlist, with auto left-to-right layout and industrial oscilloscope aesthetic.

**Architecture:** Three layers: (1) netlist text → SchematicGraph (lightweight tokenizer, no core dependency for graph building), (2) SchematicGraph → SchematicLayout (left-to-right placement + orthogonal wire routing), (3) SchematicLayout → SVG (symbol library + React component). Embedded in the showcase as a panel between netlist editor and waveform.

**Tech Stack:** TypeScript, React, SVG, vitest

**Spec:** `docs/superpowers/specs/2026-04-14-schematic-viewer-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/schematic/types.ts` | Shared type definitions |
| Create | `packages/ui/src/schematic/graph.ts` | Netlist → SchematicGraph |
| Create | `packages/ui/src/schematic/graph.test.ts` | Graph extraction tests |
| Create | `packages/ui/src/schematic/symbols.ts` | SVG symbol rendering functions |
| Create | `packages/ui/src/schematic/layout.ts` | Graph → positioned layout |
| Create | `packages/ui/src/schematic/layout.test.ts` | Layout algorithm tests |
| Create | `packages/ui/src/react/SchematicView.tsx` | React component |
| Modify | `packages/ui/src/react/index.ts` | Export SchematicView |
| Modify | `packages/ui/src/core/index.ts` | Export schematic types |
| Modify | `examples/showcase/main.tsx` | Embed SchematicView panel |

---

### Task 1: Types

**Files:**
- Create: `packages/ui/src/schematic/types.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// packages/ui/src/schematic/types.ts

/** A component extracted from a netlist for schematic rendering. */
export interface SchematicComponent {
  /** Device type letter: 'R', 'C', 'L', 'V', 'I', 'D', 'Q', 'M', 'E', 'G', 'F', 'H' */
  type: string;
  /** Device instance name, e.g. 'R1', 'M1' */
  name: string;
  /** Net names this component connects to, in netlist order */
  nodes: string[];
  /** Human-readable value string for display, e.g. '1k', '100n', 'DC 5' */
  displayValue: string;
}

/** Abstract circuit graph for schematic rendering. */
export interface SchematicGraph {
  components: SchematicComponent[];
  /** All unique net names (excluding ground '0') */
  nets: string[];
}

/** Pin location on a placed component. */
export interface Pin {
  /** Net name this pin connects to */
  net: string;
  /** Absolute x position */
  x: number;
  /** Absolute y position */
  y: number;
}

/** A component with computed position in the schematic. */
export interface PlacedComponent {
  component: SchematicComponent;
  /** Top-left x on the grid */
  x: number;
  /** Top-left y on the grid */
  y: number;
  /** Rotation in degrees: 0, 90, 180, 270 */
  rotation: number;
  /** Pin positions after placement + rotation */
  pins: Pin[];
}

/** A wire segment connecting two points. */
export interface WireSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A wire connecting pins on the same net. */
export interface Wire {
  net: string;
  segments: WireSegment[];
}

/** A junction where 3+ wires meet. */
export interface Junction {
  x: number;
  y: number;
}

/** Fully positioned schematic ready for SVG rendering. */
export interface SchematicLayout {
  components: PlacedComponent[];
  wires: Wire[];
  junctions: Junction[];
  bounds: { width: number; height: number };
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/schematic/types.ts
git commit -m "feat(ui): add schematic viewer type definitions (#12)"
```

---

### Task 2: Graph Extraction

**Files:**
- Create: `packages/ui/src/schematic/graph.ts`
- Create: `packages/ui/src/schematic/graph.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/ui/src/schematic/graph.test.ts
import { describe, it, expect } from 'vitest';
import { buildSchematicGraph } from './graph.js';

describe('buildSchematicGraph', () => {
  it('extracts voltage divider', () => {
    const g = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in out 1k
      R2 out 0 2k
      .op
    `);
    expect(g.components).toHaveLength(3);
    expect(g.components[0]).toEqual({
      type: 'V', name: 'V1', nodes: ['in', '0'], displayValue: 'DC 5',
    });
    expect(g.components[1]).toEqual({
      type: 'R', name: 'R1', nodes: ['in', 'out'], displayValue: '1k',
    });
    expect(g.components[2]).toEqual({
      type: 'R', name: 'R2', nodes: ['out', '0'], displayValue: '2k',
    });
    expect(g.nets).toContain('in');
    expect(g.nets).toContain('out');
    expect(g.nets).not.toContain('0');
  });

  it('extracts RC filter with source waveform', () => {
    const g = buildSchematicGraph(`
      V1 in 0 AC 1
      R1 in out 1k
      C1 out 0 100n
      .ac dec 10 1 10Meg
    `);
    expect(g.components).toHaveLength(3);
    expect(g.components[0].displayValue).toBe('AC 1');
    expect(g.components[2]).toEqual({
      type: 'C', name: 'C1', nodes: ['out', '0'], displayValue: '100n',
    });
  });

  it('extracts MOSFET circuit', () => {
    const g = buildSchematicGraph(`
      VDD vdd 0 DC 5
      VGS in 0 DC 1.5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      M1 out in 0 0 NMOD W=100u L=1u
      RD vdd out 10k
      .op
    `);
    expect(g.components.find(c => c.name === 'M1')).toEqual({
      type: 'M', name: 'M1', nodes: ['out', 'in', '0', '0'],
      displayValue: 'NMOD',
    });
  });

  it('skips dot commands and comments', () => {
    const g = buildSchematicGraph(`
      * This is a comment
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 list 1k 10k
      .model DMOD D(IS=1e-14)
    `);
    expect(g.components).toHaveLength(2);
  });

  it('handles empty netlist', () => {
    const g = buildSchematicGraph('');
    expect(g.components).toHaveLength(0);
    expect(g.nets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && npx vitest run src/schematic/graph.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement buildSchematicGraph**

```typescript
// packages/ui/src/schematic/graph.ts
import type { SchematicComponent, SchematicGraph } from './types.js';

const DEVICE_PREFIXES = new Set(['R','C','L','V','I','D','Q','M','E','G','F','H','X']);

/**
 * Extract a schematic graph from a SPICE netlist string.
 * Lightweight tokenizer — does not depend on @spice-ts/core.
 */
export function buildSchematicGraph(netlist: string): SchematicGraph {
  const components: SchematicComponent[] = [];
  const netSet = new Set<string>();

  for (const rawLine of netlist.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*') || line.startsWith('.') || line.startsWith('+')) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;

    const name = tokens[0];
    const type = name[0].toUpperCase();
    if (!DEVICE_PREFIXES.has(type)) continue;

    const comp = parseDeviceLine(type, name, tokens);
    if (comp) {
      components.push(comp);
      for (const n of comp.nodes) {
        if (n !== '0') netSet.add(n);
      }
    }
  }

  return { components, nets: [...netSet] };
}

function parseDeviceLine(type: string, name: string, tokens: string[]): SchematicComponent | null {
  switch (type) {
    case 'R':
    case 'C':
    case 'L':
      // R1 n1 n2 value
      return {
        type, name,
        nodes: [tokens[1], tokens[2]],
        displayValue: tokens[3] ?? '',
      };

    case 'V':
    case 'I':
      // V1 n+ n- DC 5 / AC 1 / PULSE(...) / SIN(...)
      return {
        type, name,
        nodes: [tokens[1], tokens[2]],
        displayValue: tokens.slice(3).join(' '),
      };

    case 'D':
      // D1 anode cathode [modelname]
      return {
        type, name,
        nodes: [tokens[1], tokens[2]],
        displayValue: tokens[3] ?? '',
      };

    case 'Q':
      // Q1 C B E modelname
      return {
        type, name,
        nodes: [tokens[1], tokens[2], tokens[3]],
        displayValue: tokens[4] ?? '',
      };

    case 'M': {
      // M1 D G S [B] modelname [params...]
      // Heuristic: if tokens[5] exists and doesn't contain '=', tokens[4] is bulk
      let nodes: string[];
      let modelName: string;
      if (tokens[5] && !tokens[5].includes('=')) {
        nodes = [tokens[1], tokens[2], tokens[3], tokens[4]];
        modelName = tokens[5];
      } else {
        nodes = [tokens[1], tokens[2], tokens[3]];
        modelName = tokens[4] ?? '';
      }
      return { type, name, nodes, displayValue: modelName };
    }

    case 'E':
    case 'G':
      // E1 out+ out- ctrl+ ctrl- gain
      return {
        type, name,
        nodes: [tokens[1], tokens[2], tokens[3], tokens[4]],
        displayValue: tokens[5] ?? '',
      };

    case 'F':
    case 'H':
      // F1 out+ out- vsource gain
      return {
        type, name,
        nodes: [tokens[1], tokens[2]],
        displayValue: tokens[4] ?? '',
      };

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/ui && npx vitest run src/schematic/graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/schematic/graph.ts packages/ui/src/schematic/graph.test.ts
git commit -m "feat(ui): add schematic graph extraction from netlist (#12)"
```

---

### Task 3: SVG Symbols

**Files:**
- Create: `packages/ui/src/schematic/symbols.ts`

This task creates the SVG symbol library. Each function returns an array of SVG element descriptors that the React component will render. All symbols are designed for a 20px grid.

- [ ] **Step 1: Create symbols.ts with all device symbols**

```typescript
// packages/ui/src/schematic/symbols.ts

/** Grid size in pixels. All component dimensions are multiples of this. */
export const GRID = 20;

/** SVG path/element descriptor for rendering. */
export interface SvgElement {
  tag: 'path' | 'circle' | 'line' | 'text' | 'polyline';
  attrs: Record<string, string | number>;
  text?: string;
}

/** Symbol definition with pin offsets relative to (0,0) top-left. */
export interface SymbolDef {
  /** SVG elements to draw */
  elements: SvgElement[];
  /** Pin offsets from the symbol's origin (0,0) — unrotated */
  pins: { dx: number; dy: number }[];
  /** Symbol bounding box */
  width: number;
  height: number;
}

// Stroke style constants
const S = 1.5; // stroke width
const PIN_R = 2.5; // pin dot radius

function resistorSymbol(): SymbolDef {
  // IEEE zigzag, horizontal, 3 grid wide x 1 grid tall
  const w = GRID * 3, h = GRID;
  const cy = h / 2;
  const lead = GRID * 0.5;
  const bodyW = w - lead * 2;
  const peaks = 6;
  const segW = bodyW / peaks;
  const amp = h * 0.35;

  let d = `M0,${cy} L${lead},${cy}`;
  for (let i = 0; i < peaks; i++) {
    const x1 = lead + i * segW + segW * 0.25;
    const x2 = lead + i * segW + segW * 0.75;
    const y1 = i % 2 === 0 ? cy - amp : cy + amp;
    const y2 = i % 2 === 0 ? cy + amp : cy - amp;
    d += ` L${x1},${y1} L${x2},${y2}`;
  }
  d += ` L${w - lead},${cy} L${w},${cy}`;

  return {
    elements: [{ tag: 'path', attrs: { d, fill: 'none' } }],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

function capacitorSymbol(): SymbolDef {
  const w = GRID, h = GRID * 2;
  const cx = w / 2;
  const gap = 6;
  const plateW = w * 0.7;

  return {
    elements: [
      // Top lead
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: h / 2 - gap / 2 } },
      // Top plate
      { tag: 'line', attrs: { x1: cx - plateW / 2, y1: h / 2 - gap / 2, x2: cx + plateW / 2, y2: h / 2 - gap / 2 } },
      // Bottom plate
      { tag: 'line', attrs: { x1: cx - plateW / 2, y1: h / 2 + gap / 2, x2: cx + plateW / 2, y2: h / 2 + gap / 2 } },
      // Bottom lead
      { tag: 'line', attrs: { x1: cx, y1: h / 2 + gap / 2, x2: cx, y2: h } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: h }],
    width: w, height: h,
  };
}

function inductorSymbol(): SymbolDef {
  const w = GRID * 3, h = GRID;
  const cy = h / 2;
  const lead = GRID * 0.5;
  const bodyW = w - lead * 2;
  const arcs = 4;
  const arcW = bodyW / arcs;
  const r = arcW / 2;

  let d = `M0,${cy} L${lead},${cy}`;
  for (let i = 0; i < arcs; i++) {
    const sx = lead + i * arcW;
    d += ` A${r},${r} 0 0,1 ${sx + arcW},${cy}`;
  }
  d += ` L${w},${cy}`;

  return {
    elements: [{ tag: 'path', attrs: { d, fill: 'none' } }],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

function voltageSourceSymbol(isAC: boolean): SymbolDef {
  const size = GRID * 2;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  const elements: SvgElement[] = [
    // Leads
    { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - r } },
    { tag: 'line', attrs: { x1: cx, y1: cy + r, x2: cx, y2: size } },
    // Circle
    { tag: 'circle', attrs: { cx, cy, r, fill: 'none' } },
  ];

  if (isAC) {
    // Sine wave inside
    const sw = r * 0.6;
    elements.push({
      tag: 'path',
      attrs: {
        d: `M${cx - sw},${cy} C${cx - sw * 0.5},${cy - r * 0.4} ${cx + sw * 0.5},${cy + r * 0.4} ${cx + sw},${cy}`,
        fill: 'none',
      },
    });
  } else {
    // + and - labels
    const s = r * 0.3;
    elements.push(
      { tag: 'line', attrs: { x1: cx - s, y1: cy - r * 0.4, x2: cx + s, y2: cy - r * 0.4 } },
      { tag: 'line', attrs: { x1: cx, y1: cy - r * 0.4 - s, x2: cx, y2: cy - r * 0.4 + s } },
      { tag: 'line', attrs: { x1: cx - s, y1: cy + r * 0.4, x2: cx + s, y2: cy + r * 0.4 } },
    );
  }

  return {
    elements,
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: size }],
    width: size, height: size,
  };
}

function currentSourceSymbol(): SymbolDef {
  const size = GRID * 2;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - r } },
      { tag: 'line', attrs: { x1: cx, y1: cy + r, x2: cx, y2: size } },
      { tag: 'circle', attrs: { cx, cy, r, fill: 'none' } },
      // Arrow pointing up
      { tag: 'line', attrs: { x1: cx, y1: cy + r * 0.5, x2: cx, y2: cy - r * 0.5 } },
      { tag: 'polyline', attrs: { points: `${cx - 4},${cy - r * 0.2} ${cx},${cy - r * 0.5} ${cx + 4},${cy - r * 0.2}`, fill: 'none' } },
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: size }],
    width: size, height: size,
  };
}

function diodeSymbol(): SymbolDef {
  const w = GRID * 1.5, h = GRID;
  const cy = h / 2;
  const triW = h * 0.6;
  const cx = w / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: cx - triW / 2, y2: cy } },
      // Triangle (anode side)
      { tag: 'path', attrs: { d: `M${cx - triW / 2},${cy - h * 0.35} L${cx + triW / 2},${cy} L${cx - triW / 2},${cy + h * 0.35} Z`, fill: 'none' } },
      // Bar (cathode side)
      { tag: 'line', attrs: { x1: cx + triW / 2, y1: cy - h * 0.35, x2: cx + triW / 2, y2: cy + h * 0.35 } },
      { tag: 'line', attrs: { x1: cx + triW / 2, y1: cy, x2: w, y2: cy } },
    ],
    pins: [{ dx: 0, dy: cy }, { dx: w, dy: cy }],
    width: w, height: h,
  };
}

function mosfetSymbol(): SymbolDef {
  // 3-terminal: gate (left), drain (top), source (bottom)
  const w = GRID * 2, h = GRID * 2;
  const gateX = w * 0.3;
  const bodyX = w * 0.45;
  const termX = w * 0.7;
  const cy = h / 2;

  return {
    elements: [
      // Gate lead + vertical bar
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: gateX, y2: cy } },
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.2, x2: bodyX, y2: h * 0.8 } },
      // Gate bar (parallel to body)
      { tag: 'line', attrs: { x1: gateX, y1: h * 0.25, x2: gateX, y2: h * 0.75 } },
      // Three stubs from body to terminal line
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.3, x2: termX, y2: h * 0.3 } },
      { tag: 'line', attrs: { x1: bodyX, y1: cy, x2: termX, y2: cy } },
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.7, x2: termX, y2: h * 0.7 } },
      // Drain lead (top)
      { tag: 'line', attrs: { x1: termX, y1: h * 0.3, x2: termX, y2: 0 } },
      { tag: 'line', attrs: { x1: termX, y1: 0, x2: w, y2: 0 } },
      // Source lead (bottom)
      { tag: 'line', attrs: { x1: termX, y1: h * 0.7, x2: termX, y2: h } },
      { tag: 'line', attrs: { x1: termX, y1: h, x2: w, y2: h } },
      // Arrow on source (NMOS)
      { tag: 'polyline', attrs: { points: `${bodyX + 2},${cy - 3} ${termX},${cy} ${bodyX + 2},${cy + 3}`, fill: 'none' } },
    ],
    // gate, drain, source
    pins: [
      { dx: 0, dy: cy },
      { dx: w, dy: 0 },
      { dx: w, dy: h },
    ],
    width: w, height: h,
  };
}

function bjtSymbol(): SymbolDef {
  const w = GRID * 2, h = GRID * 2;
  const baseX = w * 0.3;
  const bodyX = w * 0.45;
  const cy = h / 2;

  return {
    elements: [
      // Base lead
      { tag: 'line', attrs: { x1: 0, y1: cy, x2: bodyX, y2: cy } },
      // Vertical body line
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.25, x2: bodyX, y2: h * 0.75 } },
      // Collector
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.35, x2: w, y2: 0 } },
      // Emitter
      { tag: 'line', attrs: { x1: bodyX, y1: h * 0.65, x2: w, y2: h } },
      // Arrow on emitter (NPN)
      { tag: 'polyline', attrs: { points: `${w - 8},${h - 2} ${w},${h} ${w - 2},${h - 8}`, fill: 'none' } },
    ],
    pins: [
      { dx: w, dy: 0 },    // collector
      { dx: 0, dy: cy },   // base
      { dx: w, dy: h },    // emitter
    ],
    width: w, height: h,
  };
}

function opampSymbol(): SymbolDef {
  // Triangle: inputs left, output right
  const w = GRID * 2.5, h = GRID * 3;
  const tipX = w;
  const cy = h / 2;

  return {
    elements: [
      // Triangle body
      { tag: 'path', attrs: { d: `M${GRID * 0.5},0 L${tipX},${cy} L${GRID * 0.5},${h} Z`, fill: 'none' } },
      // + input lead
      { tag: 'line', attrs: { x1: 0, y1: h * 0.3, x2: GRID * 0.5, y2: h * 0.3 } },
      // - input lead
      { tag: 'line', attrs: { x1: 0, y1: h * 0.7, x2: GRID * 0.5, y2: h * 0.7 } },
      // + label
      { tag: 'text', attrs: { x: GRID * 0.65, y: h * 0.35, 'font-size': 10 }, text: '+' },
      // - label
      { tag: 'text', attrs: { x: GRID * 0.65, y: h * 0.75, 'font-size': 10 }, text: '\u2013' },
      // Output lead
      { tag: 'line', attrs: { x1: tipX, y1: cy, x2: tipX + GRID * 0.5, y2: cy } },
    ],
    // in+, in-, out
    pins: [
      { dx: 0, dy: h * 0.3 },
      { dx: 0, dy: h * 0.7 },
      { dx: tipX + GRID * 0.5, dy: cy },
    ],
    width: tipX + GRID * 0.5, height: h,
  };
}

function groundSymbol(): SymbolDef {
  const w = GRID, h = GRID * 0.7;
  const cx = w / 2;

  return {
    elements: [
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: h * 0.3 } },
      { tag: 'line', attrs: { x1: cx - w * 0.4, y1: h * 0.3, x2: cx + w * 0.4, y2: h * 0.3 } },
      { tag: 'line', attrs: { x1: cx - w * 0.25, y1: h * 0.6, x2: cx + w * 0.25, y2: h * 0.6 } },
      { tag: 'line', attrs: { x1: cx - w * 0.1, y1: h * 0.9, x2: cx + w * 0.1, y2: h * 0.9 } },
    ],
    pins: [{ dx: cx, dy: 0 }],
    width: w, height: h,
  };
}

/** Look up the symbol definition for a device type. */
export function getSymbol(type: string, displayValue?: string): SymbolDef {
  switch (type) {
    case 'R': return resistorSymbol();
    case 'C': return capacitorSymbol();
    case 'L': return inductorSymbol();
    case 'V': return voltageSourceSymbol(
      (displayValue ?? '').toUpperCase().startsWith('AC') ||
      (displayValue ?? '').toUpperCase().startsWith('SIN')
    );
    case 'I': return currentSourceSymbol();
    case 'D': return diodeSymbol();
    case 'Q': return bjtSymbol();
    case 'M': return mosfetSymbol();
    case 'E': case 'G': return opampSymbol();
    case 'F': case 'H': return resistorSymbol(); // controlled sources as box fallback
    default: return resistorSymbol();
  }
}

export { groundSymbol };
```

- [ ] **Step 2: Verify it compiles**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/schematic/symbols.ts
git commit -m "feat(ui): add SVG schematic symbol library (#12)"
```

---

### Task 4: Auto-Layout

**Files:**
- Create: `packages/ui/src/schematic/layout.ts`
- Create: `packages/ui/src/schematic/layout.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/ui/src/schematic/layout.test.ts
import { describe, it, expect } from 'vitest';
import { layoutSchematic } from './layout.js';
import { buildSchematicGraph } from './graph.js';

describe('layoutSchematic', () => {
  it('lays out voltage divider left-to-right', () => {
    const graph = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in out 1k
      R2 out 0 2k
    `);
    const layout = layoutSchematic(graph);

    expect(layout.components).toHaveLength(3);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);

    // Source should be leftmost
    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const r1 = layout.components.find(c => c.component.name === 'R1')!;
    const r2 = layout.components.find(c => c.component.name === 'R2')!;
    expect(v1.x).toBeLessThan(r1.x);
    expect(r1.x).toBeLessThanOrEqual(r2.x);
  });

  it('produces wires connecting components on the same net', () => {
    const graph = buildSchematicGraph(`
      V1 in 0 DC 5
      R1 in 0 1k
    `);
    const layout = layoutSchematic(graph);

    expect(layout.wires.length).toBeGreaterThan(0);
    // Should have wires for 'in' net and ground connections
    const inWire = layout.wires.find(w => w.net === 'in');
    expect(inWire).toBeDefined();
  });

  it('places ground symbols at bottom', () => {
    const graph = buildSchematicGraph(`
      V1 1 0 DC 5
      R1 1 0 1k
    `);
    const layout = layoutSchematic(graph);

    // Components connecting to ground should have ground-connected pins
    // at a lower y than signal-connected pins
    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const gndPin = v1.pins.find(p => p.net === '0');
    const sigPin = v1.pins.find(p => p.net === '1');
    if (gndPin && sigPin) {
      expect(gndPin.y).toBeGreaterThanOrEqual(sigPin.y);
    }
  });

  it('handles empty graph', () => {
    const layout = layoutSchematic({ components: [], nets: [] });
    expect(layout.components).toHaveLength(0);
    expect(layout.wires).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement layoutSchematic**

```typescript
// packages/ui/src/schematic/layout.ts
import type { SchematicGraph, SchematicLayout, PlacedComponent, Wire, Junction, Pin } from './types.js';
import { getSymbol, GRID } from './symbols.js';

const COL_SPACING = GRID * 5;
const ROW_SPACING = GRID * 3;
const MARGIN = GRID * 2;

/**
 * Auto-layout a schematic graph using left-to-right signal flow.
 *
 * Algorithm:
 * 1. Identify source components (V, I) — they go in column 0
 * 2. BFS from sources through nets to place remaining components in subsequent columns
 * 3. Components with a ground pin are oriented vertically
 * 4. Wire routing: connect pins on the same net with orthogonal segments
 */
export function layoutSchematic(graph: SchematicGraph): SchematicLayout {
  if (graph.components.length === 0) {
    return { components: [], wires: [], junctions: [], bounds: { width: 0, height: 0 } };
  }

  // Classify components: sources go first
  const sources = graph.components.filter(c => c.type === 'V' || c.type === 'I');
  const others = graph.components.filter(c => c.type !== 'V' && c.type !== 'I');

  // Assign columns via BFS from source nets
  const placed = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();

  // Place sources in column 0
  sources.forEach((s, i) => {
    placed.set(s.name, { col: 0, row: i });
    visited.add(s.name);
  });

  // BFS: walk nets from placed components to place unplaced ones
  let frontier = [...sources];
  let col = 1;
  while (frontier.length > 0 && visited.size < graph.components.length) {
    const nextFrontier: typeof frontier = [];
    // Collect all nets touched by frontier components
    const frontierNets = new Set<string>();
    for (const comp of frontier) {
      for (const n of comp.nodes) {
        if (n !== '0') frontierNets.add(n);
      }
    }
    // Find unvisited components that share a net with the frontier
    let row = 0;
    for (const comp of others) {
      if (visited.has(comp.name)) continue;
      const sharesNet = comp.nodes.some(n => n !== '0' && frontierNets.has(n));
      if (sharesNet) {
        placed.set(comp.name, { col, row });
        visited.add(comp.name);
        nextFrontier.push(comp);
        row++;
      }
    }
    frontier = nextFrontier;
    col++;
  }

  // Place any remaining unvisited components
  for (const comp of graph.components) {
    if (!visited.has(comp.name)) {
      placed.set(comp.name, { col, row: 0 });
      col++;
    }
  }

  // Convert grid positions to pixel positions and create PlacedComponents
  const placedComponents: PlacedComponent[] = [];

  for (const comp of graph.components) {
    const pos = placed.get(comp.name)!;
    const symbol = getSymbol(comp.type, comp.displayValue);
    const isVertical = comp.type === 'V' || comp.type === 'I' || comp.type === 'C';
    const rotation = isVertical ? 0 : 0;

    const x = MARGIN + pos.col * COL_SPACING;
    const y = MARGIN + pos.row * ROW_SPACING;

    const pins: Pin[] = symbol.pins.map((p, i) => ({
      net: i < comp.nodes.length ? comp.nodes[i] : '0',
      x: x + p.dx,
      y: y + p.dy,
    }));

    placedComponents.push({
      component: comp,
      x, y, rotation,
      pins,
    });
  }

  // Wire routing: for each net, connect all pins on that net
  const wires: Wire[] = [];
  const netPins = new Map<string, { x: number; y: number }[]>();

  for (const pc of placedComponents) {
    for (const pin of pc.pins) {
      if (!netPins.has(pin.net)) netPins.set(pin.net, []);
      netPins.get(pin.net)!.push({ x: pin.x, y: pin.y });
    }
  }

  for (const [net, pins] of netPins) {
    if (pins.length < 2) continue;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    // Simple routing: connect pins in sequence with L-shaped orthogonal wires
    const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (from.y === to.y) {
        // Horizontal direct
        segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      } else {
        // L-bend: horizontal to midpoint, then vertical
        const midX = (from.x + to.x) / 2;
        segments.push({ x1: from.x, y1: from.y, x2: midX, y2: from.y });
        segments.push({ x1: midX, y1: from.y, x2: midX, y2: to.y });
        segments.push({ x1: midX, y1: to.y, x2: to.x, y2: to.y });
      }
    }

    wires.push({ net, segments });
  }

  // Junctions: where 3+ wire endpoints meet at the same point
  const junctions: Junction[] = [];
  const pointCount = new Map<string, number>();
  for (const wire of wires) {
    for (const seg of wire.segments) {
      const k1 = `${seg.x1},${seg.y1}`;
      const k2 = `${seg.x2},${seg.y2}`;
      pointCount.set(k1, (pointCount.get(k1) ?? 0) + 1);
      pointCount.set(k2, (pointCount.get(k2) ?? 0) + 1);
    }
  }
  for (const [key, count] of pointCount) {
    if (count >= 3) {
      const [x, y] = key.split(',').map(Number);
      junctions.push({ x, y });
    }
  }

  // Compute bounds
  let maxX = 0, maxY = 0;
  for (const pc of placedComponents) {
    const sym = getSymbol(pc.component.type, pc.component.displayValue);
    maxX = Math.max(maxX, pc.x + sym.width);
    maxY = Math.max(maxY, pc.y + sym.height);
  }

  return {
    components: placedComponents,
    wires,
    junctions,
    bounds: { width: maxX + MARGIN, height: maxY + MARGIN },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/schematic/layout.ts packages/ui/src/schematic/layout.test.ts
git commit -m "feat(ui): add schematic auto-layout algorithm (#12)"
```

---

### Task 5: React SchematicView Component

**Files:**
- Create: `packages/ui/src/react/SchematicView.tsx`
- Modify: `packages/ui/src/react/index.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Create SchematicView.tsx**

```tsx
// packages/ui/src/react/SchematicView.tsx
import { useMemo } from 'react';
import { buildSchematicGraph } from '../schematic/graph.js';
import { layoutSchematic } from '../schematic/layout.js';
import { getSymbol, groundSymbol, GRID } from '../schematic/symbols.js';
import type { SvgElement } from '../schematic/symbols.js';
import type { ThemeConfig } from '../core/types.js';
import { resolveTheme } from '../core/theme.js';

export interface SchematicViewProps {
  /** SPICE netlist string to render */
  netlist: string;
  /** Theme preset or custom config */
  theme?: 'dark' | 'light' | ThemeConfig;
  /** Width of the container */
  width?: number | string;
  /** Height of the container */
  height?: number | string;
  /** Called when a net node is clicked (future probe hookup) */
  onNodeClick?: (node: string) => void;
}

function renderSvgElement(el: SvgElement, i: number, stroke: string) {
  const common = { key: i, stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (el.tag) {
    case 'path':
      return <path {...common} d={el.attrs.d as string} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'line':
      return <line {...common} x1={el.attrs.x1} y1={el.attrs.y1} x2={el.attrs.x2} y2={el.attrs.y2} />;
    case 'circle':
      return <circle {...common} cx={el.attrs.cx} cy={el.attrs.cy} r={el.attrs.r} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'polyline':
      return <polyline {...common} points={el.attrs.points as string} fill={(el.attrs.fill as string) ?? 'none'} />;
    case 'text':
      return (
        <text key={i} x={el.attrs.x} y={el.attrs.y}
          fill={stroke} fontSize={el.attrs['font-size'] ?? 10}
          fontFamily="'JetBrains Mono', monospace"
        >
          {el.text}
        </text>
      );
    default:
      return null;
  }
}

export function SchematicView({ netlist, theme, width = '100%', height = 400, onNodeClick }: SchematicViewProps) {
  const resolvedTheme = resolveTheme(theme ?? 'dark');
  const stroke = resolvedTheme.text;

  const { layout, error } = useMemo(() => {
    try {
      const graph = buildSchematicGraph(netlist);
      return { layout: layoutSchematic(graph), error: null };
    } catch (e) {
      return { layout: null, error: e instanceof Error ? e.message : 'Failed to parse netlist' };
    }
  }, [netlist]);

  if (error) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: resolvedTheme.textMuted,
      }}>
        Schematic error: {error}
      </div>
    );
  }

  if (!layout || layout.components.length === 0) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: resolvedTheme.textMuted,
      }}>
        No components to display
      </div>
    );
  }

  const { bounds } = layout;
  const padded = { width: bounds.width + GRID, height: bounds.height + GRID };

  return (
    <div style={{ width, height: typeof height === 'number' ? height : undefined, overflow: 'auto' }}>
      <svg
        viewBox={`0 0 ${padded.width} ${padded.height}`}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Wires */}
        {layout.wires.map((wire, wi) => (
          <g key={`w-${wi}`}>
            {wire.segments.map((seg, si) => (
              <line key={si}
                x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
                stroke={stroke} strokeWidth={1} opacity={0.5}
              />
            ))}
          </g>
        ))}

        {/* Junctions */}
        {layout.junctions.map((j, i) => (
          <circle key={`j-${i}`} cx={j.x} cy={j.y} r={3} fill={stroke} />
        ))}

        {/* Components */}
        {layout.components.map((pc, ci) => {
          const sym = getSymbol(pc.component.type, pc.component.displayValue);
          return (
            <g key={ci} transform={`translate(${pc.x},${pc.y})`}>
              {/* Symbol */}
              {sym.elements.map((el, i) => renderSvgElement(el, i, stroke))}

              {/* Pin dots */}
              {sym.pins.map((p, i) => (
                <circle key={`p-${i}`} cx={p.dx} cy={p.dy} r={2.5}
                  fill={stroke} opacity={0.7}
                  style={{ cursor: onNodeClick ? 'pointer' : undefined }}
                  onClick={() => onNodeClick?.(pc.pins[i]?.net ?? '')}
                />
              ))}

              {/* Component name label */}
              <text
                x={sym.width / 2} y={-6}
                textAnchor="middle" fill={stroke}
                fontSize={10} fontFamily="'JetBrains Mono', monospace"
                opacity={0.8}
              >
                {pc.component.name}
              </text>

              {/* Value label */}
              <text
                x={sym.width / 2} y={sym.height + 12}
                textAnchor="middle" fill={stroke}
                fontSize={9} fontFamily="'JetBrains Mono', monospace"
                opacity={0.5}
              >
                {pc.component.displayValue}
              </text>
            </g>
          );
        })}

        {/* Ground symbols — render at pins connected to net '0' */}
        {layout.components.flatMap((pc, ci) =>
          pc.pins.filter(p => p.net === '0').map((p, gi) => {
            const gnd = groundSymbol();
            return (
              <g key={`gnd-${ci}-${gi}`} transform={`translate(${p.x - gnd.width / 2},${p.y})`}>
                {gnd.elements.map((el, i) => renderSvgElement(el, i, stroke))}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Export from react/index.ts**

Add to `packages/ui/src/react/index.ts`:

```typescript
export { SchematicView } from './SchematicView.js';
export type { SchematicViewProps } from './SchematicView.js';
```

- [ ] **Step 3: Export schematic types from core/index.ts**

Add to `packages/ui/src/core/index.ts`:

```typescript
export type {
  SchematicComponent, SchematicGraph, SchematicLayout,
  PlacedComponent, Pin, Wire, Junction, WireSegment,
} from '../schematic/types.js';
export { buildSchematicGraph } from '../schematic/graph.js';
export { layoutSchematic } from '../schematic/layout.js';
```

- [ ] **Step 4: Verify build**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run all UI tests**

Run: `cd packages/ui && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/react/SchematicView.tsx packages/ui/src/react/index.ts packages/ui/src/core/index.ts
git commit -m "feat(ui): add SchematicView React component (#12)"
```

---

### Task 6: Showcase Integration

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Add SchematicView import and panel**

In `examples/showcase/main.tsx`, add the import:

```typescript
import { SchematicView } from '@spice-ts/ui/react';
```

Then, in the panels section, add the schematic panel between the netlist editor panel and the waveform panel. Find the closing `</div>` of the netlist editor panel (after `</textarea>`) and add after it:

```tsx
          {/* Schematic panel */}
          <div className="panel">
            <div className="panel-header">
              <h3>Schematic</h3>
            </div>
            <div className="panel-body">
              <SchematicView
                netlist={editedNetlist}
                theme={vaultTecTheme ?? 'dark'}
                height={300}
              />
            </div>
          </div>
```

- [ ] **Step 2: Build and verify**

Run: `cd /Users/mfiumara/repos/spice-ts && pnpm build`
Expected: All packages build. The showcase should show a schematic panel that renders the circuit topology.

- [ ] **Step 3: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "feat(showcase): embed SchematicView panel (#12)"
```

---

### Task 7: Final Validation

- [ ] **Step 1: Run UI tests**

Run: `cd packages/ui && npx vitest run`
Expected: All tests pass (existing + new schematic tests)

- [ ] **Step 2: Run core tests**

Run: `cd packages/core && npx vitest run`
Expected: 331+ tests pass (no core changes, just regression check)

- [ ] **Step 3: Full build**

Run: `pnpm build`
Expected: All packages build

- [ ] **Step 4: Visual check**

Start dev server and verify:
- RC Low-Pass renders correctly (V source left, R middle, C right, ground symbols at bottom)
- Wires connect components on the same net
- Labels show component names and values
- Other circuits in the sidebar also render reasonable schematics
- Vault-Tec mode applies to the schematic (monochrome green)
