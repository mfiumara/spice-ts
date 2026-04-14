# Schematic Viewer — Auto-Layout SVG Renderer

**Date:** 2026-04-14
**Issue:** #12 (first sub-project)

## Summary

Add a `<SchematicView />` React component to `@spice-ts/ui` that takes a SPICE netlist string and renders a read-only SVG schematic with automatic left-to-right layout. Uses the showcase's industrial oscilloscope aesthetic (phosphor green on dark, JetBrains Mono labels). Embedded in the showcase as a panel above the waveform viewer.

## Scope

### v1 (this spec)

- Parse netlist into a circuit graph (nodes + components)
- Auto-layout: left-to-right signal flow, ground rail at bottom, grid-snapped
- SVG rendering with IEEE standard component symbols in industrial theme
- Orthogonal wire routing with junction dots
- Component labels (name + value)
- Showcase integration as a new panel
- Re-renders when netlist changes (live update from textarea edits)
- `onNodeClick` prop wired as no-op (future probe hookup)

### Deferred

- Probe interaction — click node to add signal to waveform viewer (#32)
- Interactive value editing (click component → popover)
- Zoom/pan on the schematic
- Manual layout overrides
- SPICE import → schematic (best-effort reverse layout)
- Full `@spice-ts/designer` drag-and-drop editor (#12)

## Architecture

Three layers in `packages/ui/src/schematic/`:

### 1. Netlist → Circuit Graph (`graph.ts`)

Parses a netlist string into an abstract graph using `parse()` and `compile()` from `@spice-ts/core`.

```typescript
interface SchematicComponent {
  type: string;        // 'R', 'C', 'L', 'V', 'I', 'D', 'Q', 'M', 'E', 'G', 'F', 'H'
  name: string;        // 'R1', 'C1', etc.
  nodes: string[];     // net names this component connects to
  value?: string;      // display value, e.g. '1k', '100n'
}

interface SchematicGraph {
  components: SchematicComponent[];
  nets: string[];       // unique net names (excluding ground '0')
}

function buildSchematicGraph(netlist: string): SchematicGraph
```

Uses `@spice-ts/core`'s `parse()` to get a Circuit, then extracts device descriptors and node names. The `value` field is parsed from the netlist text for display (human-readable with SI suffixes, not the numeric value).

### 2. Auto-Layout (`layout.ts`)

Takes a `SchematicGraph` and computes positions on a grid.

```typescript
interface PlacedComponent {
  component: SchematicComponent;
  x: number;           // grid-snapped position
  y: number;
  rotation: number;    // 0, 90, 180, 270 degrees
  pins: { name: string; x: number; y: number }[];
}

interface Wire {
  net: string;
  segments: { x1: number; y1: number; x2: number; y2: number }[];
}

interface Junction {
  x: number;
  y: number;
}

interface SchematicLayout {
  components: PlacedComponent[];
  wires: Wire[];
  junctions: Junction[];
  bounds: { width: number; height: number };
}

function layoutSchematic(graph: SchematicGraph): SchematicLayout
```

**Algorithm:** Simple left-to-right signal flow.
1. Find input source(s) — voltage/current sources are placed on the left edge
2. Walk the circuit graph from source through components following node connections
3. Place components left-to-right, one column per hop from the source
4. Vertical components (caps to ground, load resistors) placed below the signal path
5. Ground rail drawn as a horizontal line at the bottom
6. All positions snapped to a 20px grid
7. Wire routing: orthogonal segments (horizontal + vertical) connecting component pins to their nets, with 90-degree bends

### 3. SVG Symbols + React Component

**Symbols** (`symbols.ts`): Each device type has a function returning SVG elements.

```typescript
function renderResistor(x: number, y: number, rotation: number, name: string, value: string): SVGElement[]
function renderCapacitor(...): SVGElement[]
// etc.
```

**v1 symbol set:**

| Device | Symbol | Size (grid units) |
|--------|--------|--------------------|
| R | IEEE zigzag (6 peaks) | 3w x 1h |
| C | Two parallel plates with gap | 1w x 2h |
| L | 4 coil arcs | 3w x 1h |
| V (DC) | Circle with +/- | 2w x 2h |
| V (AC/Pulse) | Circle with sine wave | 2w x 2h |
| I | Circle with arrow | 2w x 2h |
| D | Triangle + bar | 1.5w x 1h |
| Q (BJT) | Standard 3-terminal with arrow | 2w x 2h |
| M (MOSFET) | Standard 3-terminal with gate bar | 2w x 2h |
| E/G (opamp) | Triangle with +/- inputs | 2w x 3h |
| GND | Three horizontal lines decreasing | 1w x 1h |

**React component** (`SchematicView.tsx`):

```typescript
interface SchematicViewProps {
  netlist: string;
  theme?: 'dark' | 'light' | ThemeConfig;
  width?: number | string;       // default '100%'
  height?: number | string;      // default 400
  onNodeClick?: (node: string) => void;  // future probe hookup
}
```

Internally: `netlist → buildSchematicGraph() → layoutSchematic() → SVG render`. Re-runs the pipeline when `netlist` prop changes. Wraps output in a `<svg>` with viewBox computed from layout bounds.

## Visual Style

All rendering follows the industrial oscilloscope aesthetic:

- **Stroke**: phosphor green (`--phosphor`, #39ff85), 1.5px
- **Labels**: JetBrains Mono, 10px. Component name above, value below.
- **Pins**: small filled circles (3px radius) at connection points
- **Wires**: 1px phosphor green, orthogonal only (horizontal/vertical)
- **Junctions**: filled circles (4px) where 3+ wires meet
- **Ground symbol**: three decreasing horizontal lines
- **Background**: transparent (inherits panel background)
- **Grid**: 20px snap grid (not drawn, just alignment)

In Vault-Tec mode: same monochrome green palette, no visual changes needed since the schematic already uses phosphor green.

## Showcase Integration

New panel in the showcase, between the netlist editor and the waveform panel:

```
Netlist (editable textarea)
Schematic View (SVG)          ← new
Waveform / Bode / DC Plot
```

Uses the same `.panel` CSS class. The schematic updates live as the user edits the netlist textarea. Parse errors show a subtle inline message instead of crashing.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/ui/src/schematic/graph.ts` | Netlist → SchematicGraph |
| Create | `packages/ui/src/schematic/layout.ts` | Graph → positioned layout |
| Create | `packages/ui/src/schematic/symbols.ts` | SVG symbol rendering functions |
| Create | `packages/ui/src/schematic/types.ts` | Shared types |
| Create | `packages/ui/src/react/SchematicView.tsx` | React component |
| Create | `packages/ui/src/schematic/graph.test.ts` | Graph extraction tests |
| Create | `packages/ui/src/schematic/layout.test.ts` | Layout algorithm tests |
| Modify | `packages/ui/src/react/index.ts` | Export SchematicView |
| Modify | `packages/ui/src/core/index.ts` | Export schematic types |
| Modify | `examples/showcase/main.tsx` | Embed SchematicView panel |

## Testing

- **Unit: graph extraction** — verify correct components and nets from simple netlists (voltage divider, RC filter, MOSFET circuit)
- **Unit: layout** — verify components are positioned left-to-right, ground at bottom, no overlaps
- **Unit: symbols** — verify each symbol function returns valid SVG path data
- **Integration: showcase** — visual check that schematics render correctly for all implemented circuits
- **Edge cases:** empty netlist, parse error, single component, disconnected nodes

## Dependencies

- `@spice-ts/core` — `parse()` and `compile()` for netlist parsing. This is already a peer dependency of `@spice-ts/ui`.
- No new external dependencies.
