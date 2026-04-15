# Circuit IR Design

**Date:** 2026-04-15
**Issue:** #34
**Related:** #35 (circuit-json adapter, future)

## Problem

The current core model is tightly coupled to SPICE netlist syntax. The schematic renderer (`buildSchematicGraph`) re-parses SPICE text with its own ad-hoc tokenizer instead of consuming a shared model. There is no typed, structured representation of a circuit that both simulation and rendering can share.

## Solution

Introduce a lean Circuit IR — a flat, generic component graph that sits between netlist parsing and all consumers (simulation, schematic rendering, future editing).

### Design Principles

- **Zero dependencies** — plain TypeScript types, no Zod or external schema libraries
- **Generic components** — one `Component` interface with `Record<string, ...>` params, not a typed union per device
- **Circuit topology only** — no analysis directives, model cards, or simulation results in the IR
- **Flat structure** — no subcircuit nesting; designed so nesting can be added later without breaking changes
- **Single source of truth** — the IR is the canonical circuit representation that both core and UI consume
- **circuit-json compatible** — field shapes chosen so a future adapter can map to/from tscircuit's circuit-json format (see #35)

## Data Model

```ts
// packages/core/src/ir/types.ts

type ComponentType = 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'Q' | 'M' | 'E' | 'G' | 'H' | 'F' | 'X'

interface Port {
  name: string    // 'p', 'n', 'gate', 'drain', 'source', 'collector', 'base', 'emitter', ...
  net: string     // net/node name: '1', 'out', 'vcc', '0' (ground)
}

interface Component {
  type: ComponentType
  id: string            // unique identifier, e.g. 'R1', 'M2'
  name: string          // display name
  ports: Port[]
  params: Record<string, number | string | boolean>
  displayValue?: string // human-readable: "10k", "NMOS W=10u L=1u"
}

interface Circuit {
  components: Component[]
  nets: string[]         // unique net names derived from ports
}
```

### Port naming convention

| Device | Ports |
|---|---|
| R, C, L | `p`, `n` |
| V, I | `p`, `n` |
| D | `anode`, `cathode` |
| Q (BJT) | `collector`, `base`, `emitter` |
| M (MOSFET) | `drain`, `gate`, `source`, `bulk` |
| E, G (voltage-controlled) | `outP`, `outN`, `ctrlP`, `ctrlN` |
| H, F (current-controlled) | `outP`, `outN` |
| X (subcircuit) | matches subcircuit port names |

### Params per device type

| Device | Example params |
|---|---|
| R | `{ resistance: 1000 }` |
| C | `{ capacitance: 1e-6 }` |
| L | `{ inductance: 1e-3 }` |
| V | `{ waveform: 'dc', dc: 5 }` or `{ waveform: 'sin', offset: 0, amplitude: 1, frequency: 1000 }` |
| I | `{ waveform: 'dc', dc: 0.001 }` |
| D | `{ modelName: 'D1N4148' }` |
| Q | `{ modelName: 'Q2N2222', type: 'npn' }` |
| M | `{ modelName: 'NMOD', channelType: 'n', W: 10e-6, L: 1e-6 }` |
| E (VCVS) | `{ gain: 10 }` |
| G (VCCS) | `{ gm: 0.001 }` |
| H (CCVS) | `{ gain: 100, controlSource: 'V1' }` |
| F (CCCS) | `{ gain: 5, controlSource: 'V2' }` |
| X | `{ subcircuit: 'opamp' }` + any parameter overrides |

## Parser Output

The parser splits its output into the IR (shared with UI) and simulation metadata (internal to core):

```ts
// packages/core/src/parser/index.ts

interface ParseResult {
  circuit: Circuit                          // IR — shared with UI
  analyses: AnalysisCommand[]               // .op, .tran, .ac, .dc
  models: Map<string, ModelParams>          // .model cards
  subcircuits: Map<string, SubcktDefinition> // .subckt definitions
  steps: StepAnalysis[]                     // .step directives
}

function parse(netlist: string): ParseResult
```

## Data Flow

```
                    +----------------+
  SPICE netlist --> |    Parser      | --> Circuit (IR)
                    +----------------+        |
                                              +---> compile() --> CompiledCircuit --> Simulate
                                              |
                                              +---> SchematicRenderer (layout + draw + edit)
                                              |
                                              +---> future: circuit-json adapter (#35)
```

## Programmatic API

The existing `Circuit` builder class is preserved. It builds up an IR internally:

```ts
const ckt = new Circuit()
ckt.addResistor('R1', '1', '0', 1000)
ckt.addVoltageSource('V1', '1', '0', { type: 'dc', value: 5 })
ckt.addAnalysis('op')

const ir = ckt.toIR()           // IR Circuit (for schematic rendering)
const compiled = ckt.compile()   // CompiledCircuit (for simulation, uses IR internally)
```

The `simulate()` function is unchanged — it continues to accept a netlist string or Circuit builder and returns `SimulationResult`.

## UI Integration

### Removed
- `buildSchematicGraph()` in `packages/ui/src/schematic/graph.ts` — the ad-hoc SPICE re-parser

### Changed
- `SchematicView` accepts `circuit: Circuit` prop instead of `netlist: string`
- `layoutSchematic()` consumes IR `Circuit` directly instead of `SchematicGraph`
- `getSymbol()` uses `Component.params` to pick symbol variants (N vs P-channel MOSFET, NPN vs PNP BJT, DC vs sine source)
- Pin placement uses `Port.name` instead of guessing from token order

### Mapping

| SchematicGraph (removed) | IR Circuit (replacement) |
|---|---|
| `SchematicComponent.type` | `Component.type` |
| `SchematicComponent.name` | `Component.name` |
| `SchematicComponent.nodes[]` | `Component.ports[].net` |
| `SchematicComponent.displayValue` | `Component.displayValue` |
| `SchematicGraph.nets[]` | `Circuit.nets[]` |

## Future: Editable Schematic

The IR is the single source of truth for an editable schematic:

1. User double-clicks a component in the schematic
2. UI shows a property panel with `Component.params` as editable key-value pairs
3. User modifies a value (e.g. resistance: 1000 -> 2000)
4. IR updates in place
5. Re-compile and re-simulate from the modified IR
6. Schematic and waveforms update

## Future: Subcircuit Support

The IR is flat (no nesting) for now. When subcircuits are needed, `Component` can gain an optional `children: Component[]` or the `Circuit` can gain a `subcircuits: Map<string, Circuit>` field. The flat structure does not preclude this.

## Out of Scope

- circuit-json adapter package (tracked in #35)
- Editable schematic UI (future work)
- Subcircuit nesting in the IR
- Analysis directives or simulation results in the IR
