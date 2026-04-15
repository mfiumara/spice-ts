# Circuit IR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a lean Circuit IR that decouples the schematic renderer from SPICE netlist parsing, replacing the ad-hoc `buildSchematicGraph()` with a shared typed model.

**Architecture:** The IR types live in `packages/core/src/ir/`. The SPICE parser and `Circuit` builder both produce IR objects. The UI schematic renderer consumes the IR directly instead of re-parsing SPICE text. The `simulate()` API is unchanged.

**Tech Stack:** TypeScript (no new dependencies)

---

### Task 1: Define IR types

**Files:**
- Create: `packages/core/src/ir/types.ts`
- Create: `packages/core/src/ir/index.ts`

- [ ] **Step 1: Write type-level test**

Create a test that imports IR types and constructs a valid circuit. This verifies the types compile correctly.

```ts
// packages/core/src/ir/ir.test.ts
import { describe, it, expect } from 'vitest';
import type { CircuitIR, IRComponent, IRPort, ComponentType } from './types.js';

describe('IR types', () => {
  it('should construct a valid circuit', () => {
    const circuit: CircuitIR = {
      components: [
        {
          type: 'R' as ComponentType,
          id: 'R1',
          name: 'R1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { resistance: 1000 },
          displayValue: '1k',
        },
        {
          type: 'V' as ComponentType,
          id: 'V1',
          name: 'V1',
          ports: [
            { name: 'p', net: '1' },
            { name: 'n', net: '0' },
          ],
          params: { waveform: 'dc', dc: 5 },
          displayValue: 'DC 5',
        },
      ],
      nets: ['1'],
    };

    expect(circuit.components).toHaveLength(2);
    expect(circuit.nets).toEqual(['1']);
    expect(circuit.components[0].ports[0].name).toBe('p');
  });

  it('should construct MOSFET with named ports', () => {
    const mosfet: IRComponent = {
      type: 'M',
      id: 'M1',
      name: 'M1',
      ports: [
        { name: 'drain', net: 'vdd' },
        { name: 'gate', net: 'in' },
        { name: 'source', net: '0' },
      ],
      params: { modelName: 'NMOD', channelType: 'n', W: 10e-6, L: 1e-6 },
    };

    expect(mosfet.ports.find(p => p.name === 'gate')?.net).toBe('in');
    expect(mosfet.params.channelType).toBe('n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: FAIL — module `./types.js` not found.

- [ ] **Step 3: Create IR type definitions**

```ts
// packages/core/src/ir/types.ts

/** SPICE device type letter. */
export type ComponentType = 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'Q' | 'M' | 'E' | 'G' | 'H' | 'F' | 'X';

/** A named connection point on a component. */
export interface IRPort {
  /** Port role name: 'p', 'n', 'gate', 'drain', 'source', 'collector', 'base', 'emitter', etc. */
  name: string;
  /** Net/node name this port connects to: '1', 'out', 'vcc', '0' (ground) */
  net: string;
}

/** A circuit component with typed parameters. */
export interface IRComponent {
  /** SPICE device type letter */
  type: ComponentType;
  /** Unique identifier, e.g. 'R1', 'M2' */
  id: string;
  /** Display name */
  name: string;
  /** Named connection points */
  ports: IRPort[];
  /** Device parameters (resistance, capacitance, modelName, channelType, gain, etc.) */
  params: Record<string, number | string | boolean>;
  /** Human-readable value for display: "10k", "NMOS W=10u L=1u" */
  displayValue?: string;
}

/** A flat circuit representation — components and their net connectivity. */
export interface CircuitIR {
  /** All components in the circuit */
  components: IRComponent[];
  /** Unique net names (excluding ground '0') */
  nets: string[];
}
```

```ts
// packages/core/src/ir/index.ts
export type { ComponentType, IRPort, IRComponent, CircuitIR } from './types.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ir/
git commit -m "feat(core): define Circuit IR types (#34)"
```

---

### Task 2: Implement `toIR()` on Circuit class

**Files:**
- Create: `packages/core/src/ir/builder.ts`
- Modify: `packages/core/src/circuit.ts`
- Test: `packages/core/src/ir/ir.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/ir/ir.test.ts`:

```ts
import { Circuit } from '../circuit.js';

describe('Circuit.toIR()', () => {
  it('should convert a simple resistor divider to IR', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', 'in', '0', { type: 'dc', value: 5 });
    ckt.addResistor('R1', 'in', 'out', 1000);
    ckt.addResistor('R2', 'out', '0', 2000);

    const ir = ckt.toIR();

    expect(ir.components).toHaveLength(3);
    expect(ir.nets).toContain('in');
    expect(ir.nets).toContain('out');
    expect(ir.nets).not.toContain('0');

    const v1 = ir.components.find(c => c.id === 'V1')!;
    expect(v1.type).toBe('V');
    expect(v1.ports).toEqual([
      { name: 'p', net: 'in' },
      { name: 'n', net: '0' },
    ]);
    expect(v1.params).toEqual({ waveform: 'dc', dc: 5 });
    expect(v1.displayValue).toBe('DC 5');

    const r1 = ir.components.find(c => c.id === 'R1')!;
    expect(r1.type).toBe('R');
    expect(r1.ports).toEqual([
      { name: 'p', net: 'in' },
      { name: 'n', net: 'out' },
    ]);
    expect(r1.params).toEqual({ resistance: 1000 });
    expect(r1.displayValue).toBe('1k');
  });

  it('should convert a MOSFET with named ports', () => {
    const ckt = new Circuit();
    ckt.addMOSFET('M1', 'vdd', 'in', 'gnd', 'NMOD', { W: 10e-6, L: 1e-6 });
    ckt.addModel({ name: 'NMOD', type: 'NMOS', params: {} });

    const ir = ckt.toIR();
    const m1 = ir.components.find(c => c.id === 'M1')!;

    expect(m1.type).toBe('M');
    expect(m1.ports).toEqual([
      { name: 'drain', net: 'vdd' },
      { name: 'gate', net: 'in' },
      { name: 'source', net: 'gnd' },
    ]);
    expect(m1.params).toMatchObject({ modelName: 'NMOD', channelType: 'n', W: 10e-6, L: 1e-6 });
  });

  it('should convert a BJT with named ports', () => {
    const ckt = new Circuit();
    ckt.addBJT('Q1', 'vcc', 'base', 'emit', 'QMOD');
    ckt.addModel({ name: 'QMOD', type: 'NPN', params: { BF: 100 } });

    const ir = ckt.toIR();
    const q1 = ir.components.find(c => c.id === 'Q1')!;

    expect(q1.type).toBe('Q');
    expect(q1.ports).toEqual([
      { name: 'collector', net: 'vcc' },
      { name: 'base', net: 'base' },
      { name: 'emitter', net: 'emit' },
    ]);
    expect(q1.params).toMatchObject({ modelName: 'QMOD', type: 'npn' });
  });

  it('should convert a diode with named ports', () => {
    const ckt = new Circuit();
    ckt.addDiode('D1', 'anode_net', 'cathode_net', 'DMOD');

    const ir = ckt.toIR();
    const d1 = ir.components.find(c => c.id === 'D1')!;

    expect(d1.type).toBe('D');
    expect(d1.ports).toEqual([
      { name: 'anode', net: 'anode_net' },
      { name: 'cathode', net: 'cathode_net' },
    ]);
    expect(d1.params).toEqual({ modelName: 'DMOD' });
  });

  it('should convert controlled sources', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { type: 'dc', value: 5 });
    ckt.addVCVS('E1', '3', '0', '1', '2', 10);
    ckt.addVCCS('G1', '4', '0', '1', '2', 0.001);
    ckt.addCCVS('H1', '5', '0', 'V1', 100);
    ckt.addCCCS('F1', '6', '0', 'V1', 5);

    const ir = ckt.toIR();

    const e1 = ir.components.find(c => c.id === 'E1')!;
    expect(e1.ports).toEqual([
      { name: 'outP', net: '3' },
      { name: 'outN', net: '0' },
      { name: 'ctrlP', net: '1' },
      { name: 'ctrlN', net: '2' },
    ]);
    expect(e1.params).toEqual({ gain: 10 });

    const g1 = ir.components.find(c => c.id === 'G1')!;
    expect(g1.params).toEqual({ gm: 0.001 });

    const h1 = ir.components.find(c => c.id === 'H1')!;
    expect(h1.ports).toEqual([
      { name: 'outP', net: '5' },
      { name: 'outN', net: '0' },
    ]);
    expect(h1.params).toEqual({ gain: 100, controlSource: 'V1' });

    const f1 = ir.components.find(c => c.id === 'F1')!;
    expect(f1.params).toEqual({ gain: 5, controlSource: 'V1' });
  });

  it('should convert sources with various waveforms', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { type: 'sin', offset: 0, amplitude: 1, frequency: 1000 });
    ckt.addCurrentSource('I1', '2', '0', { type: 'pulse', v1: 0, v2: 1, delay: 0, rise: 1e-9, fall: 1e-9, width: 5e-4, period: 1e-3 });

    const ir = ckt.toIR();

    const v1 = ir.components.find(c => c.id === 'V1')!;
    expect(v1.params.waveform).toBe('sin');
    expect(v1.params.amplitude).toBe(1);
    expect(v1.params.frequency).toBe(1000);

    const i1 = ir.components.find(c => c.id === 'I1')!;
    expect(i1.params.waveform).toBe('pulse');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: FAIL — `ckt.toIR is not a function`

- [ ] **Step 3: Implement the descriptor-to-IR builder**

Create `packages/core/src/ir/builder.ts` — a pure function that converts `DeviceDescriptor[]` and model/subcircuit maps into a `CircuitIR`:

```ts
// packages/core/src/ir/builder.ts
import type { CircuitIR, IRComponent, IRPort } from './types.js';
import type { SourceWaveform, ModelParams } from '../types.js';
import { GROUND_NODE } from '../types.js';

interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
  controlSource?: string;
}

/**
 * Build a CircuitIR from internal device descriptors.
 *
 * Maps positional node arrays to named ports and extracts
 * user-facing parameters for each device type.
 */
export function buildIR(
  descriptors: DeviceDescriptor[],
  models: Map<string, ModelParams>,
): CircuitIR {
  const netSet = new Set<string>();
  const components: IRComponent[] = [];

  for (const desc of descriptors) {
    const ports = buildPorts(desc);
    const params = buildParams(desc, models);
    const displayValue = buildDisplayValue(desc, models);

    components.push({
      type: desc.type as IRComponent['type'],
      id: desc.name,
      name: desc.name,
      ports,
      params,
      ...(displayValue !== undefined && { displayValue }),
    });

    for (const port of ports) {
      if (port.net !== GROUND_NODE) netSet.add(port.net);
    }
  }

  return { components, nets: [...netSet].sort() };
}

function buildPorts(desc: DeviceDescriptor): IRPort[] {
  switch (desc.type) {
    case 'R':
    case 'C':
    case 'L':
    case 'V':
    case 'I':
      return [
        { name: 'p', net: desc.nodes[0] },
        { name: 'n', net: desc.nodes[1] },
      ];
    case 'D':
      return [
        { name: 'anode', net: desc.nodes[0] },
        { name: 'cathode', net: desc.nodes[1] },
      ];
    case 'Q':
      return [
        { name: 'collector', net: desc.nodes[0] },
        { name: 'base', net: desc.nodes[1] },
        { name: 'emitter', net: desc.nodes[2] },
      ];
    case 'M': {
      const ports: IRPort[] = [
        { name: 'drain', net: desc.nodes[0] },
        { name: 'gate', net: desc.nodes[1] },
        { name: 'source', net: desc.nodes[2] },
      ];
      if (desc.nodes.length >= 4) {
        ports.push({ name: 'bulk', net: desc.nodes[3] });
      }
      return ports;
    }
    case 'E':
    case 'G':
      return [
        { name: 'outP', net: desc.nodes[0] },
        { name: 'outN', net: desc.nodes[1] },
        { name: 'ctrlP', net: desc.nodes[2] },
        { name: 'ctrlN', net: desc.nodes[3] },
      ];
    case 'H':
    case 'F':
      return [
        { name: 'outP', net: desc.nodes[0] },
        { name: 'outN', net: desc.nodes[1] },
      ];
    case 'X':
      return desc.nodes.map((net, i) => ({ name: `port${i + 1}`, net }));
    default:
      return desc.nodes.map((net, i) => ({ name: `${i}`, net }));
  }
}

function buildParams(
  desc: DeviceDescriptor,
  models: Map<string, ModelParams>,
): Record<string, number | string | boolean> {
  const params: Record<string, number | string | boolean> = {};

  switch (desc.type) {
    case 'R':
      params.resistance = desc.value!;
      break;
    case 'C':
      params.capacitance = desc.value!;
      break;
    case 'L':
      params.inductance = desc.value!;
      break;
    case 'V':
    case 'I':
      flattenWaveform(desc.waveform, params);
      break;
    case 'D':
      if (desc.modelName) params.modelName = desc.modelName;
      break;
    case 'Q': {
      if (desc.modelName) params.modelName = desc.modelName;
      const model = desc.modelName ? models.get(desc.modelName) : undefined;
      params.type = (model?.type?.toLowerCase() ?? 'npn') as string;
      break;
    }
    case 'M': {
      if (desc.modelName) params.modelName = desc.modelName;
      const model = desc.modelName ? models.get(desc.modelName) : undefined;
      params.channelType = model?.type === 'PMOS' ? 'p' : 'n';
      if (desc.params) {
        for (const [k, v] of Object.entries(desc.params)) {
          params[k] = v;
        }
      }
      break;
    }
    case 'E':
      params.gain = desc.value!;
      break;
    case 'G':
      params.gm = desc.value!;
      break;
    case 'H':
      params.gain = desc.value!;
      if (desc.controlSource) params.controlSource = desc.controlSource;
      break;
    case 'F':
      params.gain = desc.value!;
      if (desc.controlSource) params.controlSource = desc.controlSource;
      break;
    case 'X':
      if (desc.modelName) params.subcircuit = desc.modelName;
      if (desc.params) {
        for (const [k, v] of Object.entries(desc.params)) {
          params[k] = v;
        }
      }
      break;
  }

  return params;
}

function flattenWaveform(
  wf: (Partial<SourceWaveform> & { dc?: number }) | undefined,
  params: Record<string, number | string | boolean>,
): void {
  if (!wf) {
    params.waveform = 'dc';
    params.dc = 0;
    return;
  }
  if (wf.dc !== undefined && !wf.type) {
    params.waveform = 'dc';
    params.dc = wf.dc;
    return;
  }
  if (!wf.type) {
    params.waveform = 'dc';
    params.dc = 0;
    return;
  }

  params.waveform = wf.type;
  switch (wf.type) {
    case 'dc':
      params.dc = (wf as { value: number }).value;
      break;
    case 'sin': {
      const s = wf as { offset: number; amplitude: number; frequency: number; delay?: number; damping?: number; phase?: number };
      params.offset = s.offset;
      params.amplitude = s.amplitude;
      params.frequency = s.frequency;
      if (s.delay !== undefined) params.delay = s.delay;
      if (s.damping !== undefined) params.damping = s.damping;
      if (s.phase !== undefined) params.phase = s.phase;
      break;
    }
    case 'pulse': {
      const p = wf as { v1: number; v2: number; delay: number; rise: number; fall: number; width: number; period: number };
      params.v1 = p.v1;
      params.v2 = p.v2;
      params.delay = p.delay;
      params.rise = p.rise;
      params.fall = p.fall;
      params.width = p.width;
      params.period = p.period;
      break;
    }
    case 'ac': {
      const a = wf as { magnitude: number; phase: number };
      params.magnitude = a.magnitude;
      params.phase = a.phase;
      break;
    }
  }
}

/** Format a display value string for human-readable rendering. */
function buildDisplayValue(
  desc: DeviceDescriptor,
  models: Map<string, ModelParams>,
): string | undefined {
  switch (desc.type) {
    case 'R':
      return formatSI(desc.value!);
    case 'C':
      return formatSI(desc.value!) + 'F';
    case 'L':
      return formatSI(desc.value!) + 'H';
    case 'V':
    case 'I':
      return formatWaveformDisplay(desc.waveform);
    case 'D':
      return desc.modelName ?? '';
    case 'Q':
      return desc.modelName ?? '';
    case 'M': {
      const parts = [desc.modelName ?? ''];
      if (desc.params?.W) parts.push(`W=${formatSI(desc.params.W)}`);
      if (desc.params?.L) parts.push(`L=${formatSI(desc.params.L)}`);
      return parts.join(' ');
    }
    case 'E':
    case 'G':
    case 'H':
    case 'F':
      return String(desc.value ?? '');
    case 'X':
      return desc.modelName ?? '';
    default:
      return undefined;
  }
}

function formatWaveformDisplay(wf?: Partial<SourceWaveform> & { dc?: number }): string {
  if (!wf) return 'DC 0';
  if (wf.dc !== undefined && !wf.type) return `DC ${wf.dc}`;
  if (!wf.type) return 'DC 0';
  switch (wf.type) {
    case 'dc': return `DC ${(wf as { value: number }).value}`;
    case 'sin': {
      const s = wf as { amplitude: number; frequency: number };
      return `SIN ${formatSI(s.amplitude)} ${formatSI(s.frequency)}Hz`;
    }
    case 'pulse': return 'PULSE';
    case 'ac': {
      const a = wf as { magnitude: number };
      return `AC ${a.magnitude}`;
    }
    default: return '';
  }
}

const SI_PREFIXES: [number, string][] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'],
  [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

function formatSI(value: number): string {
  const abs = Math.abs(value);
  for (const [threshold, prefix] of SI_PREFIXES) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const str = Number.isInteger(scaled) ? scaled.toString() : scaled.toPrecision(3);
      return `${str}${prefix}`;
    }
  }
  return value.toExponential(2);
}
```

- [ ] **Step 4: Expose `toIR()` on Circuit class**

Add to `packages/core/src/circuit.ts`. The `DeviceDescriptor` interface is already private to this file, so `buildIR` needs access to the descriptors. Add a `toIR()` method to the `Circuit` class:

At the top of `circuit.ts`, add the import:
```ts
import { buildIR } from './ir/builder.js';
```

Add the method to the `Circuit` class (after the existing `addStep` method, before `compile`):

```ts
  /**
   * Convert this circuit to a flat IR representation.
   *
   * The IR contains typed components with named ports and parameters,
   * suitable for schematic rendering and serialization. Analysis commands,
   * model cards, and subcircuit definitions are not included — they remain
   * internal to the core simulation pipeline.
   *
   * @returns A {@link CircuitIR} with components and net names
   */
  toIR(): CircuitIR {
    return buildIR(this.descriptors, this._models);
  }
```

Also add the import of `CircuitIR` type:
```ts
import type { CircuitIR } from './ir/types.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: PASS — all IR construction and `toIR()` tests green.

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `cd packages/core && npx vitest run`
Expected: All existing tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ir/builder.ts packages/core/src/circuit.ts packages/core/src/ir/ir.test.ts
git commit -m "feat(core): implement Circuit.toIR() method (#34)"
```

---

### Task 3: Export IR types from core

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add IR exports**

Add to `packages/core/src/index.ts`:

```ts
export type { CircuitIR, IRComponent, IRPort, ComponentType } from './ir/types.js';
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export IR types from package (#34)"
```

---

### Task 4: Update layout to consume IR

**Files:**
- Modify: `packages/ui/src/schematic/types.ts`
- Modify: `packages/ui/src/schematic/layout.ts`

- [ ] **Step 1: Update SchematicLayout types to use IR**

In `packages/ui/src/schematic/types.ts`, the `PlacedComponent` currently references `SchematicComponent`. Update it to reference `IRComponent` from core's IR. Keep the layout output types (`PlacedComponent`, `Wire`, `Junction`, `SchematicLayout`) but change the input.

Replace the contents of `packages/ui/src/schematic/types.ts`:

```ts
import type { IRComponent } from '@spice-ts/core';

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
  component: IRComponent;
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

- [ ] **Step 2: Update layoutSchematic to consume CircuitIR**

In `packages/ui/src/schematic/layout.ts`, change `layoutSchematic` to accept `CircuitIR` instead of `SchematicGraph`. The key change is accessing `comp.ports.map(p => p.net)` instead of `comp.nodes`, and `comp.displayValue` is now optional.

Replace the function signature and update node access. The full updated file:

```ts
import type { CircuitIR, IRComponent } from '@spice-ts/core';
import type { SchematicLayout, PlacedComponent, Wire, Junction, Pin } from './types.js';
import { getSymbol, GRID } from './symbols.js';

const COL_SPACING = GRID * 5;
const ROW_SPACING = GRID * 3;
const MARGIN = GRID * 2;

/** Get all net names a component connects to. */
function componentNets(comp: IRComponent): string[] {
  return comp.ports.map(p => p.net);
}

/**
 * Auto-layout a circuit IR using left-to-right signal flow.
 *
 * 1. Sources (V, I) placed in column 0
 * 2. BFS through nets to place remaining components in subsequent columns
 * 3. Wire routing: orthogonal L-shaped segments connecting pins on the same net
 */
export function layoutSchematic(circuit: CircuitIR): SchematicLayout {
  if (circuit.components.length === 0) {
    return { components: [], wires: [], junctions: [], bounds: { width: 0, height: 0 } };
  }

  const sources = circuit.components.filter(c => c.type === 'V' || c.type === 'I');
  const others = circuit.components.filter(c => c.type !== 'V' && c.type !== 'I');

  // Assign grid positions via BFS from sources
  const placed = new Map<string, { col: number; row: number }>();
  const visited = new Set<string>();

  sources.forEach((s, i) => {
    placed.set(s.name, { col: 0, row: i });
    visited.add(s.name);
  });

  let frontier = [...sources];
  let col = 1;
  while (frontier.length > 0 && visited.size < circuit.components.length) {
    const nextFrontier: typeof frontier = [];
    const frontierNets = new Set<string>();
    for (const comp of frontier) {
      for (const n of componentNets(comp)) {
        if (n !== '0') frontierNets.add(n);
      }
    }
    let row = 0;
    for (const comp of others) {
      if (visited.has(comp.name)) continue;
      const sharesNet = componentNets(comp).some(n => n !== '0' && frontierNets.has(n));
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
  for (const comp of circuit.components) {
    if (!visited.has(comp.name)) {
      placed.set(comp.name, { col, row: 0 });
      col++;
    }
  }

  // Convert to pixel positions.
  const SIGNAL_RAIL_Y = MARGIN + GRID * 2;
  const placedComponents: PlacedComponent[] = [];

  for (const comp of circuit.components) {
    const pos = placed.get(comp.name)!;
    const nets = componentNets(comp);
    const symbol = getSymbol(comp.type, comp.displayValue ?? '');

    const x = MARGIN + pos.col * COL_SPACING;

    const signalPinIdx = nets.findIndex(n => n !== '0');
    const signalPinDy = signalPinIdx >= 0 && signalPinIdx < symbol.pins.length
      ? symbol.pins[signalPinIdx].dy
      : symbol.pins[0].dy;
    const railY = SIGNAL_RAIL_Y + pos.row * ROW_SPACING;
    const y = railY - signalPinDy;

    const pins: Pin[] = symbol.pins.map((p, i) => ({
      net: i < nets.length ? nets[i] : '0',
      x: x + p.dx,
      y: y + p.dy,
    }));

    placedComponents.push({
      component: comp,
      x, y, rotation: 0,
      pins,
    });
  }

  // Wire routing
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

    const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (from.y === to.y) {
        segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      } else {
        const midX = (from.x + to.x) / 2;
        segments.push({ x1: from.x, y1: from.y, x2: midX, y2: from.y });
        segments.push({ x1: midX, y1: from.y, x2: midX, y2: to.y });
        segments.push({ x1: midX, y1: to.y, x2: to.x, y2: to.y });
      }
    }

    wires.push({ net, segments });
  }

  // Junctions
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

  // Bounds
  let maxX = 0, maxY = 0;
  for (const pc of placedComponents) {
    const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '');
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

- [ ] **Step 3: Verify build compiles**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: Errors in `SchematicView.tsx` and `core/index.ts` (they still reference old types). That's expected — we fix those in the next tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/schematic/types.ts packages/ui/src/schematic/layout.ts
git commit -m "refactor(ui): update layout to consume CircuitIR (#34)"
```

---

### Task 5: Update SchematicView to accept CircuitIR

**Files:**
- Modify: `packages/ui/src/react/SchematicView.tsx`

- [ ] **Step 1: Update SchematicView component**

Replace `netlist: string` prop with `circuit: CircuitIR` prop. Remove the `buildSchematicGraph` import and call. The component now receives a pre-built IR and passes it directly to `layoutSchematic`.

The updated `SchematicView.tsx`:

```tsx
import { useMemo } from 'react';
import type { CircuitIR } from '@spice-ts/core';
import { layoutSchematic } from '../schematic/layout.js';
import { getSymbol, groundSymbol, GRID } from '../schematic/symbols.js';
import type { SvgElement } from '../schematic/symbols.js';
import type { ThemeConfig } from '../core/types.js';
import { resolveTheme } from '../core/theme.js';

export interface SchematicViewProps {
  /** Circuit IR to render */
  circuit: CircuitIR;
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

export function SchematicView({ circuit, theme, width = '100%', height = 400, onNodeClick }: SchematicViewProps) {
  const resolvedTheme = resolveTheme(theme ?? 'dark');
  const stroke = resolvedTheme.text;

  const { layout, error } = useMemo(() => {
    try {
      return { layout: layoutSchematic(circuit), error: null };
    } catch (e) {
      return { layout: null, error: e instanceof Error ? e.message : 'Failed to layout schematic' };
    }
  }, [circuit]);

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
                stroke={stroke} strokeWidth={1.5} opacity={0.7}
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
          const sym = getSymbol(pc.component.type, pc.component.displayValue ?? '');
          return (
            <g key={ci} transform={`translate(${pc.x},${pc.y})`}>
              {sym.elements.map((el, i) => renderSvgElement(el, i, stroke))}

              {sym.pins.map((p, i) => (
                <circle key={`p-${i}`} cx={p.dx} cy={p.dy} r={2.5}
                  fill={stroke} opacity={0.7}
                  style={{ cursor: onNodeClick ? 'pointer' : undefined }}
                  onClick={() => onNodeClick?.(pc.pins[i]?.net ?? '')}
                />
              ))}

              <text
                x={sym.width / 2} y={-6}
                textAnchor="middle" fill={stroke}
                fontSize={10} fontFamily="'JetBrains Mono', monospace"
                opacity={0.8}
              >
                {pc.component.name}
              </text>

              <text
                x={sym.width / 2} y={sym.height + 12}
                textAnchor="middle" fill={stroke}
                fontSize={9} fontFamily="'JetBrains Mono', monospace"
                opacity={0.5}
              >
                {pc.component.displayValue ?? ''}
              </text>
            </g>
          );
        })}

        {/* Ground symbols */}
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

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/react/SchematicView.tsx
git commit -m "refactor(ui): SchematicView accepts CircuitIR instead of netlist (#34)"
```

---

### Task 6: Delete buildSchematicGraph and update exports

**Files:**
- Delete: `packages/ui/src/schematic/graph.ts`
- Modify: `packages/ui/src/core/index.ts`

- [ ] **Step 1: Delete the ad-hoc parser**

```bash
rm packages/ui/src/schematic/graph.ts
```

- [ ] **Step 2: Update UI exports**

In `packages/ui/src/core/index.ts`, remove the old `SchematicComponent`, `SchematicGraph`, and `buildSchematicGraph` exports. Replace with re-exports of IR types from core (for convenience — UI consumers can import from either package).

Remove these lines:
```ts
export type {
  SchematicComponent, SchematicGraph, SchematicLayout,
  PlacedComponent, Pin, Wire, Junction, WireSegment,
} from '../schematic/types.js';
export { buildSchematicGraph } from '../schematic/graph.js';
export { layoutSchematic } from '../schematic/layout.js';
```

Replace with:
```ts
export type {
  SchematicLayout, PlacedComponent, Pin, Wire, Junction, WireSegment,
} from '../schematic/types.js';
export { layoutSchematic } from '../schematic/layout.js';
```

Note: `SchematicComponent` and `SchematicGraph` are removed. Consumers should import `CircuitIR`, `IRComponent` from `@spice-ts/core` instead.

- [ ] **Step 3: Verify build compiles**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: Errors in showcase (fixed in next task). UI package itself should compile.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/schematic/graph.ts packages/ui/src/core/index.ts
git commit -m "refactor(ui): remove buildSchematicGraph, update exports (#34)"
```

---

### Task 7: Update showcase app

**Files:**
- Modify: `examples/showcase/main.tsx`

- [ ] **Step 1: Update showcase to use CircuitIR**

The showcase currently passes `netlist` strings to `SchematicView`. It needs to parse the netlist into IR first using the core `parse()` function, then pass the IR to `SchematicView`.

In `examples/showcase/main.tsx`:

Add import:
```ts
import { parse } from '@spice-ts/core';
```

Replace the `diagramNetlist` computation (around lines 612-615):
```ts
  const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist || circuit.dcNetlist);
  const diagramNetlist = activeView === 'dc' ? circuit.dcNetlist
    : activeView === 'ac' ? circuit.acNetlist
    : circuit.tranNetlist;
```

With:
```ts
  const hasNetlist = !!(circuit.tranNetlist || circuit.acNetlist || circuit.dcNetlist);
  const diagramNetlist = activeView === 'dc' ? circuit.dcNetlist
    : activeView === 'ac' ? circuit.acNetlist
    : circuit.tranNetlist;
  const diagramCircuit = useMemo(() => {
    if (!diagramNetlist) return null;
    try {
      return parse(diagramNetlist).toIR();
    } catch {
      return null;
    }
  }, [diagramNetlist]);
```

Note: also add `useMemo` to the React import if not already present.

Update the SchematicView usage (around lines 761-774):
```tsx
          {diagramCircuit && (
            <div className="panel">
              <div className="panel-header">
                <h3>Schematic</h3>
              </div>
              <div className="panel-body">
                <SchematicView
                  circuit={diagramCircuit}
                  theme={vaultTecTheme ?? 'dark'}
                  height={300}
                />
              </div>
            </div>
          )}
```

Also update the `!hasNetlist` fallback condition to use `!diagramCircuit`:
```tsx
          {!diagramCircuit && !error && (
```

- [ ] **Step 2: Verify the showcase builds**

Run: `cd examples/showcase && npx tsc --noEmit` (or whatever build command the showcase uses)

- [ ] **Step 3: Start dev server and verify schematic renders**

Run the showcase dev server and verify the schematic panel still renders correctly for at least one circuit.

- [ ] **Step 4: Commit**

```bash
git add examples/showcase/main.tsx
git commit -m "refactor(showcase): use CircuitIR for SchematicView (#34)"
```

---

### Task 8: Verify all tests pass and no regressions

**Files:** None (verification only)

- [ ] **Step 1: Run core test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run UI build**

Run: `cd packages/ui && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run full project build**

Run whatever top-level build command exists (e.g., `npm run build` or `pnpm build`).
Expected: Clean build.

- [ ] **Step 4: Manual verification**

Start the showcase dev server and verify:
- Schematic renders for a resistor divider circuit
- Schematic renders for a circuit with MOSFETs or BJTs
- Waveform plots still work (no regression from IR changes)
- Switching between DC/AC/transient views updates the schematic

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: address IR integration fixups (#34)"
```
