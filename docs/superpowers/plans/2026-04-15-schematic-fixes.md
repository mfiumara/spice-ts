# Schematic Rendering Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix pin mapping bugs (MOSFET, opamp, controlled sources) and improve layout algorithm so complex circuits render correctly.

**Architecture:** Three independent fix areas applied sequentially: (1) reorder E/G IR ports and MOSFET symbol pins so nets map to correct visual positions, (2) add diamond symbol for F/H dependent sources, (3) improve layout column assignment and vertical alignment for multi-terminal devices.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Fix E/G port order in IR builder

**Files:**
- Modify: `packages/core/src/ir/builder.ts:26-39`
- Modify: `packages/core/src/ir/ir.test.ts`

The SPICE parser passes E/G nodes as `[outP, outN, ctrlP, ctrlN]`. The opamp symbol has 3 pins: `[+in, -in, out]`. Currently the IR produces ports in SPICE order, so outP maps to +in — wrong. Reorder the PORT_NAMES so E/G produce `[ctrlP, ctrlN, outP, outN]`, matching the visual symbol.

- [ ] **Step 1: Update the test expectations**

In `packages/core/src/ir/ir.test.ts`, find the controlled sources test (around line 181). Update the E1 and G1 port expectations:

```ts
    // VCVS
    const e1 = ir.components.find(c => c.id === 'E1')!;
    expect(e1.type).toBe('E');
    expect(e1.ports).toEqual([
      { name: 'ctrlP', net: 'c1' },
      { name: 'ctrlN', net: 'c2' },
      { name: 'outP', net: 'o1' },
      { name: 'outN', net: 'o2' },
    ]);
    expect(e1.params).toEqual({ gain: 10 });
    expect(e1.displayValue).toBe('10');

    // VCCS
    const g1 = ir.components.find(c => c.id === 'G1')!;
    expect(g1.type).toBe('G');
    expect(g1.ports).toEqual([
      { name: 'ctrlP', net: 'c3' },
      { name: 'ctrlN', net: 'c4' },
      { name: 'outP', net: 'o3' },
      { name: 'outN', net: 'o4' },
    ]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: FAIL — port order doesn't match.

- [ ] **Step 3: Update PORT_NAMES and buildPorts for E/G**

In `packages/core/src/ir/builder.ts`, change the PORT_NAMES table for E and G, and add special handling in `buildPorts`:

Change lines 35-36 from:
```ts
  E: ['outP', 'outN', 'ctrlP', 'ctrlN'],
  G: ['outP', 'outN', 'ctrlP', 'ctrlN'],
```
to:
```ts
  E: ['ctrlP', 'ctrlN', 'outP', 'outN'],
  G: ['ctrlP', 'ctrlN', 'outP', 'outN'],
```

Then add a special case in `buildPorts` (before the `const names = PORT_NAMES[desc.type]` line) to reorder the SPICE nodes for E/G:

```ts
  if (desc.type === 'E' || desc.type === 'G') {
    // SPICE order: outP outN ctrlP ctrlN
    // Symbol order: ctrlP ctrlN outP outN (inputs left, output right)
    const [outP, outN, ctrlP, ctrlN] = desc.nodes;
    return [
      { name: 'ctrlP', net: ctrlP },
      { name: 'ctrlN', net: ctrlN },
      { name: 'outP', net: outP },
      { name: 'outN', net: outN },
    ];
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/ir/ir.test.ts`
Expected: PASS

- [ ] **Step 5: Run full core tests for regressions**

Run: `cd packages/core && npx vitest run`
Expected: All 350 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ir/builder.ts packages/core/src/ir/ir.test.ts
git commit -m "fix(core): reorder E/G IR ports to match opamp symbol [ctrlP, ctrlN, outP, outN]"
```

---

### Task 2: Fix MOSFET symbol pin order

**Files:**
- Modify: `packages/ui/src/schematic/symbols.ts:182-187`

The MOSFET symbol has pins `[gate, drain, source]` but the IR produces ports `[drain, gate, source]`. Reorder the symbol pins to match.

- [ ] **Step 1: Write a layout test for MOSFET pin mapping**

Add to `packages/ui/src/schematic/layout.test.ts`:

```ts
  it('maps MOSFET IR ports to correct symbol pins', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'vdd' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'M', id: 'M1', name: 'M1', ports: [
        { name: 'drain', net: 'vdd' },
        { name: 'gate', net: 'ctrl' },
        { name: 'source', net: '0' },
      ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
    );
    const layout = layoutSchematic(circuit);
    const m1 = layout.components.find(c => c.component.id === 'M1')!;

    // drain pin (port 0) should be at right upper (higher x than gate)
    // gate pin (port 1) should be at left center (lower x)
    const drainPin = m1.pins[0]; // drain
    const gatePin = m1.pins[1];  // gate
    expect(drainPin.x).toBeGreaterThan(gatePin.x);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: FAIL — drain pin has lower x (mapped to gate position at x=0).

- [ ] **Step 3: Reorder MOSFET symbol pins**

In `packages/ui/src/schematic/symbols.ts`, change the `mosfetSymbol` function's pins array (lines 183-187) from:

```ts
    pins: [
      { dx: 0, dy: cy },    // gate  (left centre)
      { dx: w, dy: gy0 },   // drain (right upper)
      { dx: w, dy: gy1 },   // source (right lower)
    ],
```

to:

```ts
    pins: [
      { dx: w, dy: gy0 },   // drain (right upper)  — matches IR port 0
      { dx: 0, dy: cy },    // gate  (left centre)   — matches IR port 1
      { dx: w, dy: gy1 },   // source (right lower)  — matches IR port 2
    ],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/schematic/symbols.ts packages/ui/src/schematic/layout.test.ts
git commit -m "fix(ui): reorder MOSFET symbol pins to match IR port order [drain, gate, source]"
```

---

### Task 3: Add diamond symbol for F/H controlled sources

**Files:**
- Modify: `packages/ui/src/schematic/symbols.ts`

F (CCCS) and H (CCVS) are current-controlled dependent sources. They currently fall back to a resistor symbol. Add a diamond-shaped symbol (IEEE standard for dependent sources) with 2 pins (outP at top, outN at bottom).

- [ ] **Step 1: Add the diamond symbol function**

In `packages/ui/src/schematic/symbols.ts`, add before the `getSymbol` function:

```ts
function dependentSourceSymbol(): SymbolDef {
  const size = GRID * 2;
  const cx = size / 2, cy = size / 2;

  return {
    elements: [
      // Lead wires top/bottom
      { tag: 'line', attrs: { x1: cx, y1: 0, x2: cx, y2: cy - size * 0.35 } },
      { tag: 'line', attrs: { x1: cx, y1: cy + size * 0.35, x2: cx, y2: size } },
      // Diamond shape
      { tag: 'path', attrs: {
        d: `M${cx},${cy - size * 0.35} L${cx + size * 0.35},${cy} L${cx},${cy + size * 0.35} L${cx - size * 0.35},${cy} Z`,
        fill: 'none',
      }},
    ],
    pins: [{ dx: cx, dy: 0 }, { dx: cx, dy: size }],
    width: size, height: size,
  };
}
```

- [ ] **Step 2: Update getSymbol to use diamond for F/H**

Change line 268 from:
```ts
    case 'F': case 'H': return resistorSymbol();
```
to:
```ts
    case 'F': case 'H': return dependentSourceSymbol();
```

- [ ] **Step 3: Run tests**

Run: `cd packages/ui && npx vitest run`
Expected: All tests PASS (no tests directly reference F/H symbol shape).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/schematic/symbols.ts
git commit -m "feat(ui): add diamond symbol for F/H dependent current-controlled sources"
```

---

### Task 4: Layout — align multi-terminal devices by input pin

**Files:**
- Modify: `packages/ui/src/schematic/layout.ts`
- Modify: `packages/ui/src/schematic/layout.test.ts`

Currently the layout aligns each component by its "first non-ground pin". For MOSFETs, this is pin 0 (drain), which is wrong — the gate (input) should drive vertical alignment. Add logic to select the alignment pin based on device type.

- [ ] **Step 1: Write a test for MOSFET gate alignment**

Add to `packages/ui/src/schematic/layout.test.ts`:

```ts
  it('aligns MOSFET by gate pin (input), not drain', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'M', id: 'M1', name: 'M1', ports: [
        { name: 'drain', net: 'vdd' },
        { name: 'gate', net: 'in' },
        { name: 'source', net: '0' },
      ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
    );
    const layout = layoutSchematic(circuit);
    const v1 = layout.components.find(c => c.component.id === 'V1')!;
    const m1 = layout.components.find(c => c.component.id === 'M1')!;

    // V1's positive pin and M1's gate pin should be on the same signal rail (same Y)
    const v1Signal = v1.pins.find(p => p.net === 'in')!;
    const m1Gate = m1.pins.find(p => p.net === 'in')!;
    expect(m1Gate.y).toBe(v1Signal.y);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: FAIL — MOSFET aligns by drain, not gate.

- [ ] **Step 3: Add alignment pin selection logic**

In `packages/ui/src/schematic/layout.ts`, add a helper function after `componentNets`:

```ts
/**
 * Get the pin index to use for vertical rail alignment.
 * Multi-terminal devices align by their input pin (gate, base, +in).
 * Two-terminal devices align by the first non-ground pin.
 */
function alignmentPinIndex(comp: IRComponent, nets: string[]): number {
  switch (comp.type) {
    case 'M': return 1; // gate (IR port order: drain=0, gate=1, source=2)
    case 'Q': return 1; // base (IR port order: collector=0, base=1, emitter=2)
    case 'E': case 'G': return 0; // ctrlP / +in (IR port order: ctrlP=0, ctrlN=1, outP=2, outN=3)
    default: {
      // Two-terminal: first non-ground pin
      const idx = nets.findIndex(n => n !== '0');
      return idx >= 0 ? idx : 0;
    }
  }
}
```

Then in the pixel position loop, replace lines 86-89:

```ts
    const signalPinIdx = nets.findIndex(n => n !== '0');
    const signalPinDy = signalPinIdx >= 0 && signalPinIdx < symbol.pins.length
      ? symbol.pins[signalPinIdx].dy
      : symbol.pins[0].dy;
```

with:

```ts
    const alignIdx = alignmentPinIndex(comp, nets);
    const signalPinDy = alignIdx < symbol.pins.length
      ? symbol.pins[alignIdx].dy
      : symbol.pins[0].dy;
```

- [ ] **Step 4: Run tests**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/schematic/layout.ts packages/ui/src/schematic/layout.test.ts
git commit -m "fix(ui): align multi-terminal devices by input pin (gate, base, +in)"
```

---

### Task 5: Layout — improve BFS column assignment with signal-flow priority

**Files:**
- Modify: `packages/ui/src/schematic/layout.ts`

Currently BFS places components based on any shared non-ground net with the frontier. This causes piling when components share power nets (VDD) but are topologically distant. Improve by preferring signal/input net connections over power nets.

- [ ] **Step 1: Add input-net helper**

In `packages/ui/src/schematic/layout.ts`, add after `alignmentPinIndex`:

```ts
/**
 * Get the "input" nets for a component — the nets most meaningful for
 * signal-flow column placement. For multi-terminal devices, prefer
 * the input/control pins over output/power pins.
 */
function inputNets(comp: IRComponent): Set<string> {
  const nets = new Set<string>();
  switch (comp.type) {
    case 'M': // gate is the input
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    case 'Q': // base is the input
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    case 'E': case 'G': // ctrlP, ctrlN are inputs
      if (comp.ports[0]?.net !== '0') nets.add(comp.ports[0].net);
      if (comp.ports[1]?.net !== '0') nets.add(comp.ports[1].net);
      break;
    default: // all non-ground nets
      for (const p of comp.ports) {
        if (p.net !== '0') nets.add(p.net);
      }
  }
  // Fallback: if no input nets found, use all non-ground nets
  if (nets.size === 0) {
    for (const p of comp.ports) {
      if (p.net !== '0') nets.add(p.net);
    }
  }
  return nets;
}
```

- [ ] **Step 2: Update BFS to use two-pass placement**

Replace the BFS loop (lines 39-60) with a two-pass approach: first place components whose *input* nets match the frontier, then place remaining components that share any net:

```ts
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

    // Two-pass: first place components whose input nets match frontier,
    // then place remaining that share any net.
    let row = 0;
    const placed_this_col = new Set<string>();

    // Pass 1: input-net matches (signal flow priority)
    for (const comp of others) {
      if (visited.has(comp.id)) continue;
      const inNets = inputNets(comp);
      const matchesInput = [...inNets].some(n => frontierNets.has(n));
      if (matchesInput) {
        placed.set(comp.id, { col, row });
        visited.add(comp.id);
        placed_this_col.add(comp.id);
        nextFrontier.push(comp);
        row++;
      }
    }

    // Pass 2: any shared net (catches components connected by output/power nets)
    for (const comp of others) {
      if (visited.has(comp.id)) continue;
      const nets = componentNets(comp);
      const sharesNet = nets.some(n => n !== '0' && frontierNets.has(n));
      if (sharesNet) {
        placed.set(comp.id, { col, row });
        visited.add(comp.id);
        nextFrontier.push(comp);
        row++;
      }
    }

    frontier = nextFrontier;
    col++;
  }
```

- [ ] **Step 3: Run tests**

Run: `cd packages/ui && npx vitest run src/schematic/layout.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Run full UI tests**

Run: `cd packages/ui && npx vitest run`
Expected: All 169 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/schematic/layout.ts
git commit -m "fix(ui): improve BFS column assignment with signal-flow priority"
```

---

### Task 6: Layout — offset wire routing corridors

**Files:**
- Modify: `packages/ui/src/schematic/layout.ts`

When multiple nets route through the same column gap, their vertical segments overlap at the midpoint X. Add a per-net horizontal offset so parallel wires are visually distinct.

- [ ] **Step 1: Update wire routing with corridor offsets**

In `packages/ui/src/schematic/layout.ts`, replace the wire routing section (lines 117-135) with:

```ts
  // Assign unique corridor offsets to nets that share the same column gap
  const CORRIDOR_OFFSET = GRID * 0.4;
  const corridorMap = new Map<string, number>(); // "col1-col2" → next offset index

  for (const [net, pins] of netPins) {
    if (net === '0' || pins.length < 2) continue;
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];

    const sorted = [...pins].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (from.y === to.y) {
        segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      } else {
        // Compute a unique corridor offset for this column gap
        const colKey = `${Math.round(from.x / COL_SPACING)}-${Math.round(to.x / COL_SPACING)}`;
        const offsetIdx = corridorMap.get(colKey) ?? 0;
        corridorMap.set(colKey, offsetIdx + 1);
        const midX = (from.x + to.x) / 2 + (offsetIdx - 0.5) * CORRIDOR_OFFSET;

        segments.push({ x1: from.x, y1: from.y, x2: midX, y2: from.y });
        segments.push({ x1: midX, y1: from.y, x2: midX, y2: to.y });
        segments.push({ x1: midX, y1: to.y, x2: to.x, y2: to.y });
      }
    }

    wires.push({ net, segments });
  }
```

- [ ] **Step 2: Run tests**

Run: `cd packages/ui && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/schematic/layout.ts
git commit -m "fix(ui): offset wire routing corridors to avoid overlapping segments"
```

---

### Task 7: Visual verification and full regression check

**Files:** None (verification only)

- [ ] **Step 1: Run core tests**

Run: `cd packages/core && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run UI tests**

Run: `cd packages/ui && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Rebuild and verify showcase**

Run: `pnpm -C packages/core build && pnpm -C packages/ui build`

Start the dev server and verify:
- Inverting Amplifier: opamp shows +in and -in on left, output on right, correct net connections
- Common-Source Amp / MOSFET circuits: gate on left, drain/source on right
- Buck / Boost / Buck-Boost converters: components spread across columns, not piled
- Circuits with F/H elements render diamond symbols

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "fix: schematic rendering fixups"
```
