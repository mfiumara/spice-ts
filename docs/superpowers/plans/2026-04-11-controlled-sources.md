# Controlled Sources (E/G/H/F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VCVS (E), VCCS (G), CCVS (H), and CCCS (F) controlled sources to spice-ts with full DC, transient, and AC support.

**Architecture:** Four new device classes implement `DeviceModel`, each with `stamp()` and `stampAC()`. VCCS and CCCS inject current (no branch variable). VCVS and CCVS force voltage (need a branch variable, like `VoltageSource`). `Circuit.compile()` gains E/H branch counting and a device map for resolving CCVS/CCCS controlling-source references by name. Parser adds four new element-type cases.

**Tech Stack:** TypeScript, Vitest, MNA stamp pattern from existing device classes.

---

### Task 1: VCCS device (G element) — test + implementation

The simplest controlled source: a current injection with no branch variable. Pattern follows `Resistor` — no branches, stamps only into G matrix.

**Files:**
- Create: `src/devices/vccs.ts`
- Create: `src/devices/controlled-sources.test.ts`

- [ ] **Step 1: Write the failing unit test for VCCS stamp**

Create `src/devices/controlled-sources.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { VCCS } from './vccs.js';

describe('VCCS (G element)', () => {
  it('stamps transconductance gm between output and control nodes', () => {
    // 4 nodes: 0=out+, 1=out-, 2=ctrl+, 3=ctrl-
    const asm = new MNAAssembler(4, 0);
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    g.stamp(asm.getStampContext());

    // G(out+, ctrl+) += gm
    expect(asm.G.get(0, 2)).toBeCloseTo(0.01);
    // G(out+, ctrl-) -= gm
    expect(asm.G.get(0, 3)).toBeCloseTo(-0.01);
    // G(out-, ctrl+) -= gm
    expect(asm.G.get(1, 2)).toBeCloseTo(-0.01);
    // G(out-, ctrl-) += gm
    expect(asm.G.get(1, 3)).toBeCloseTo(0.01);
  });

  it('handles ground node (-1) on output side', () => {
    // out- is ground: nodes [0, -1, 1, -1] => ctrl- also ground
    const asm = new MNAAssembler(2, 0);
    const g = new VCCS('G1', [0, -1, 1, -1], 0.005);
    g.stamp(asm.getStampContext());

    expect(asm.G.get(0, 1)).toBeCloseTo(0.005);
    // No stamps into ground rows/cols
    expect(asm.G.get(0, 0)).toBeCloseTo(0);
  });

  it('is linear with no branches', () => {
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    expect(g.isNonlinear).toBe(false);
    expect(g.branches).toEqual([]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(4, 0);
    const g = new VCCS('G1', [0, 1, 2, 3], 0.01);
    g.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    expect(asm.G.get(0, 2)).toBeCloseTo(0.01);
    expect(asm.G.get(0, 3)).toBeCloseTo(-0.01);
    expect(asm.G.get(1, 2)).toBeCloseTo(-0.01);
    expect(asm.G.get(1, 3)).toBeCloseTo(0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: FAIL — cannot resolve `./vccs.js`

- [ ] **Step 3: Implement VCCS device**

Create `src/devices/vccs.ts`:

```typescript
import type { DeviceModel, StampContext } from './device.js';

export class VCCS implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly gm: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN, nCtrlP, nCtrlN] = this.nodes;

    if (nOutP >= 0 && nCtrlP >= 0) ctx.stampG(nOutP, nCtrlP, this.gm);
    if (nOutP >= 0 && nCtrlN >= 0) ctx.stampG(nOutP, nCtrlN, -this.gm);
    if (nOutN >= 0 && nCtrlP >= 0) ctx.stampG(nOutN, nCtrlP, -this.gm);
    if (nOutN >= 0 && nCtrlN >= 0) ctx.stampG(nOutN, nCtrlN, this.gm);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add src/devices/vccs.ts src/devices/controlled-sources.test.ts
git commit -m "feat: add VCCS (G element) device with stamp and AC support"
```

---

### Task 2: VCVS device (E element) — test + implementation

A voltage-controlled voltage source. Needs a branch variable, following the `VoltageSource`/`Inductor` pattern. The branch row encodes: `V(n+) - V(n-) - gain * V(nc+ - nc-) = 0`.

**Files:**
- Create: `src/devices/vcvs.ts`
- Modify: `src/devices/controlled-sources.test.ts`

- [ ] **Step 1: Write the failing unit test for VCVS stamp**

Append to `src/devices/controlled-sources.test.ts`:

```typescript
import { VCVS } from './vcvs.js';

describe('VCVS (E element)', () => {
  it('stamps branch equation with gain coupling', () => {
    // 4 nodes: 0=out+, 1=out-, 2=ctrl+, 3=ctrl-. 1 branch at index 0.
    const asm = new MNAAssembler(4, 1);
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    e.stamp(asm.getStampContext());

    const bi = 4; // numNodes + branchIndex = 4 + 0

    // KCL coupling
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(1, bi)).toBe(-1);

    // KVL constraint row
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, 1)).toBe(-1);

    // Control coupling: -gain on ctrl+, +gain on ctrl-
    expect(asm.G.get(bi, 2)).toBe(-10);
    expect(asm.G.get(bi, 3)).toBe(10);

    // RHS = 0
    expect(asm.b[bi]).toBe(0);
  });

  it('handles ground on output negative node', () => {
    // out- = ground, ctrl- = ground: nodes [0, -1, 1, -1], 1 branch
    const asm = new MNAAssembler(2, 1);
    const e = new VCVS('E1', [0, -1, 1, -1], 0, 5);
    e.stamp(asm.getStampContext());

    const bi = 2; // numNodes(2) + branchIndex(0)

    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, 1)).toBe(-5);
  });

  it('is linear with one branch', () => {
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    expect(e.isNonlinear).toBe(false);
    expect(e.branches).toEqual([0]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(4, 1);
    const e = new VCVS('E1', [0, 1, 2, 3], 0, 10);
    e.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    const bi = 4;
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, 2)).toBe(-10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: FAIL — cannot resolve `./vcvs.js`

- [ ] **Step 3: Implement VCVS device**

Create `src/devices/vcvs.ts`:

```typescript
import type { DeviceModel, StampContext } from './device.js';

export class VCVS implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    readonly gain: number,
  ) {
    this.branches = [branchIndex];
  }

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN, nCtrlP, nCtrlN] = this.nodes;
    const bi = ctx.numNodes + this.branchIndex;

    // KCL coupling: branch current enters out+, leaves out-
    if (nOutP >= 0) ctx.stampG(nOutP, bi, 1);
    if (nOutN >= 0) ctx.stampG(nOutN, bi, -1);

    // KVL constraint: V(out+) - V(out-) - gain * (V(ctrl+) - V(ctrl-)) = 0
    if (nOutP >= 0) ctx.stampG(bi, nOutP, 1);
    if (nOutN >= 0) ctx.stampG(bi, nOutN, -1);
    if (nCtrlP >= 0) ctx.stampG(bi, nCtrlP, -this.gain);
    if (nCtrlN >= 0) ctx.stampG(bi, nCtrlN, this.gain);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: PASS — all VCVS + VCCS tests green

- [ ] **Step 5: Commit**

```bash
git add src/devices/vcvs.ts src/devices/controlled-sources.test.ts
git commit -m "feat: add VCVS (E element) device with branch and AC support"
```

---

### Task 3: CCCS device (F element) — test + implementation

A current-controlled current source. Reads the controlling V-source's branch current via its column in the MNA matrix. No new branch variable needed.

**Files:**
- Create: `src/devices/cccs.ts`
- Modify: `src/devices/controlled-sources.test.ts`

- [ ] **Step 1: Write the failing unit test for CCCS stamp**

Append to `src/devices/controlled-sources.test.ts`:

```typescript
import { CCCS } from './cccs.js';

describe('CCCS (F element)', () => {
  it('stamps gain into controlling branch column at output nodes', () => {
    // 2 nodes + 1 branch (from controlling V-source).
    // nodes: 0=out+, 1=out-. controlBranchIndex=0.
    const asm = new MNAAssembler(2, 1);
    const f = new CCCS('F1', [0, 1], 0, 3);
    f.stamp(asm.getStampContext());

    const biCtrl = 2; // numNodes(2) + controlBranchIndex(0)

    // G(out+, biCtrl) += gain
    expect(asm.G.get(0, biCtrl)).toBe(3);
    // G(out-, biCtrl) -= gain
    expect(asm.G.get(1, biCtrl)).toBe(-3);
  });

  it('handles ground on output negative node', () => {
    // out- = ground: nodes [0, -1]. 1 branch.
    const asm = new MNAAssembler(1, 1);
    const f = new CCCS('F1', [0, -1], 0, 5);
    f.stamp(asm.getStampContext());

    const biCtrl = 1; // numNodes(1) + 0
    expect(asm.G.get(0, biCtrl)).toBe(5);
  });

  it('is linear with no branches of its own', () => {
    const f = new CCCS('F1', [0, 1], 0, 3);
    expect(f.isNonlinear).toBe(false);
    expect(f.branches).toEqual([]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(2, 1);
    const f = new CCCS('F1', [0, 1], 0, 3);
    f.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    const biCtrl = 2;
    expect(asm.G.get(0, biCtrl)).toBe(3);
    expect(asm.G.get(1, biCtrl)).toBe(-3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: FAIL — cannot resolve `./cccs.js`

- [ ] **Step 3: Implement CCCS device**

Create `src/devices/cccs.ts`:

```typescript
import type { DeviceModel, StampContext } from './device.js';

export class CCCS implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly controlBranchIndex: number,
    readonly gain: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN] = this.nodes;
    const biCtrl = ctx.numNodes + this.controlBranchIndex;

    if (nOutP >= 0) ctx.stampG(nOutP, biCtrl, this.gain);
    if (nOutN >= 0) ctx.stampG(nOutN, biCtrl, -this.gain);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: PASS — all VCCS + VCVS + CCCS tests green

- [ ] **Step 5: Commit**

```bash
git add src/devices/cccs.ts src/devices/controlled-sources.test.ts
git commit -m "feat: add CCCS (F element) device with AC support"
```

---

### Task 4: CCVS device (H element) — test + implementation

A current-controlled voltage source. Like VCVS, it needs its own branch variable. Its constraint row couples to the controlling V-source's branch column instead of control nodes.

**Files:**
- Create: `src/devices/ccvs.ts`
- Modify: `src/devices/controlled-sources.test.ts`

- [ ] **Step 1: Write the failing unit test for CCVS stamp**

Append to `src/devices/controlled-sources.test.ts`:

```typescript
import { CCVS } from './ccvs.js';

describe('CCVS (H element)', () => {
  it('stamps branch equation with controlling branch coupling', () => {
    // 2 nodes: 0=out+, 1=out-. 2 branches: 0=controlling V-source, 1=this CCVS.
    const asm = new MNAAssembler(2, 2);
    const h = new CCVS('H1', [0, 1], 0, 1, 1000);
    h.stamp(asm.getStampContext());

    const bi = 2 + 1;     // numNodes(2) + branchIndex(1) = 3
    const biCtrl = 2 + 0; // numNodes(2) + controlBranchIndex(0) = 2

    // KCL coupling
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(1, bi)).toBe(-1);

    // KVL constraint row
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, 1)).toBe(-1);

    // Control coupling: -gain on controlling branch column
    expect(asm.G.get(bi, biCtrl)).toBe(-1000);

    // RHS = 0
    expect(asm.b[bi]).toBe(0);
  });

  it('handles ground on output negative node', () => {
    // out- = ground: nodes [0, -1]. 2 branches.
    const asm = new MNAAssembler(1, 2);
    const h = new CCVS('H1', [0, -1], 0, 1, 500);
    h.stamp(asm.getStampContext());

    const bi = 1 + 1;     // numNodes(1) + branchIndex(1)
    const biCtrl = 1 + 0; // numNodes(1) + controlBranchIndex(0)

    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, 0)).toBe(1);
    expect(asm.G.get(bi, biCtrl)).toBe(-500);
  });

  it('is linear with one branch', () => {
    const h = new CCVS('H1', [0, 1], 0, 1, 1000);
    expect(h.isNonlinear).toBe(false);
    expect(h.branches).toEqual([1]);
  });

  it('stampAC produces identical stamps', () => {
    const asm = new MNAAssembler(2, 2);
    const h = new CCVS('H1', [0, 1], 0, 1, 1000);
    h.stampAC!(asm.getStampContext(), 2 * Math.PI * 1000);

    const bi = 3;
    const biCtrl = 2;
    expect(asm.G.get(0, bi)).toBe(1);
    expect(asm.G.get(bi, biCtrl)).toBe(-1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: FAIL — cannot resolve `./ccvs.js`

- [ ] **Step 3: Implement CCVS device**

Create `src/devices/ccvs.ts`:

```typescript
import type { DeviceModel, StampContext } from './device.js';

export class CCVS implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly controlBranchIndex: number,
    readonly branchIndex: number,
    readonly gain: number,
  ) {
    this.branches = [branchIndex];
  }

  stamp(ctx: StampContext): void {
    const [nOutP, nOutN] = this.nodes;
    const bi = ctx.numNodes + this.branchIndex;
    const biCtrl = ctx.numNodes + this.controlBranchIndex;

    // KCL coupling: branch current enters out+, leaves out-
    if (nOutP >= 0) ctx.stampG(nOutP, bi, 1);
    if (nOutN >= 0) ctx.stampG(nOutN, bi, -1);

    // KVL constraint: V(out+) - V(out-) - gain * I_ctrl = 0
    if (nOutP >= 0) ctx.stampG(bi, nOutP, 1);
    if (nOutN >= 0) ctx.stampG(bi, nOutN, -1);
    ctx.stampG(bi, biCtrl, -this.gain);
  }

  stampAC(ctx: StampContext, _omega: number): void {
    this.stamp(ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/devices/controlled-sources.test.ts`
Expected: PASS — all 16 unit tests green

- [ ] **Step 5: Commit**

```bash
git add src/devices/ccvs.ts src/devices/controlled-sources.test.ts
git commit -m "feat: add CCVS (H element) device with branch and AC support"
```

---

### Task 5: Export devices and update `DeviceDescriptor`

Wire the four new device classes into the module exports and extend `DeviceDescriptor` to support the `controlSource` field needed by CCVS/CCCS.

**Files:**
- Modify: `src/devices/index.ts:1-14`
- Modify: `src/circuit.ts:31-39` (DeviceDescriptor)

- [ ] **Step 1: Add exports to `src/devices/index.ts`**

Add after line 14 (after the BSIM3v3 exports):

```typescript
export { VCCS } from './vccs.js';
export { VCVS } from './vcvs.js';
export { CCCS } from './cccs.js';
export { CCVS } from './ccvs.js';
```

- [ ] **Step 2: Add `controlSource` field to `DeviceDescriptor` in `src/circuit.ts`**

In the `DeviceDescriptor` interface (line 31-39), add a new optional field after `params`:

```typescript
controlSource?: string;
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/devices/index.ts src/circuit.ts
git commit -m "feat: export controlled source devices and extend DeviceDescriptor"
```

---

### Task 6: Circuit API methods for controlled sources

Add `addVCVS`, `addVCCS`, `addCCVS`, `addCCCS` to the `Circuit` class, plus update `branchCount` to account for E and H elements.

**Files:**
- Modify: `src/circuit.ts:58-60` (branchCount)
- Modify: `src/circuit.ts:102` (add methods after `addCurrentSource`)
- Modify: `src/circuit.test.ts` (add tests)

- [ ] **Step 1: Write failing tests for Circuit API**

Append to `src/circuit.test.ts`:

```typescript
describe('controlled source API', () => {
  it('addVCCS registers 4 nodes and no branches', () => {
    const ckt = new Circuit();
    ckt.addVCCS('G1', 'out', '0', 'in', '0', 0.01);
    expect(ckt.nodeCount).toBe(2); // 'out' and 'in' (0 is ground)
    expect(ckt.branchCount).toBe(0);
  });

  it('addVCVS registers 4 nodes and 1 branch', () => {
    const ckt = new Circuit();
    ckt.addVCVS('E1', 'out', '0', 'in', '0', 10);
    expect(ckt.nodeCount).toBe(2);
    expect(ckt.branchCount).toBe(1);
  });

  it('addCCCS registers 2 output nodes and no branch', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vsense', '1', '0', { dc: 0 });
    ckt.addCCCS('F1', 'out', '0', 'Vsense', 3);
    expect(ckt.branchCount).toBe(1); // only the V source
  });

  it('addCCVS registers 2 output nodes and 1 branch', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vsense', '1', '0', { dc: 0 });
    ckt.addCCVS('H1', 'out', '0', 'Vsense', 1000);
    expect(ckt.branchCount).toBe(2); // V source + CCVS
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/circuit.test.ts`
Expected: FAIL — `addVCCS` is not a function

- [ ] **Step 3: Update `branchCount` getter**

In `src/circuit.ts`, change `branchCount` (line 58-60) from:

```typescript
get branchCount(): number {
  return this.descriptors.filter(d => d.type === 'V' || d.type === 'L').length;
}
```

to:

```typescript
get branchCount(): number {
  return this.descriptors.filter(d =>
    d.type === 'V' || d.type === 'L' || d.type === 'E' || d.type === 'H',
  ).length;
}
```

- [ ] **Step 4: Add four API methods after `addCurrentSource` (after line 102)**

```typescript
addVCVS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gain: number): void {
  this.nodeSet.add(nOutP);
  this.nodeSet.add(nOutN);
  this.nodeSet.add(nCtrlP);
  this.nodeSet.add(nCtrlN);
  this.descriptors.push({ type: 'E', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gain });
}

addVCCS(name: string, nOutP: string, nOutN: string, nCtrlP: string, nCtrlN: string, gm: number): void {
  this.nodeSet.add(nOutP);
  this.nodeSet.add(nOutN);
  this.nodeSet.add(nCtrlP);
  this.nodeSet.add(nCtrlN);
  this.descriptors.push({ type: 'G', name, nodes: [nOutP, nOutN, nCtrlP, nCtrlN], value: gm });
}

addCCVS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
  this.nodeSet.add(nOutP);
  this.nodeSet.add(nOutN);
  this.descriptors.push({ type: 'H', name, nodes: [nOutP, nOutN], value: gain, controlSource });
}

addCCCS(name: string, nOutP: string, nOutN: string, controlSource: string, gain: number): void {
  this.nodeSet.add(nOutP);
  this.nodeSet.add(nOutN);
  this.descriptors.push({ type: 'F', name, nodes: [nOutP, nOutN], value: gain, controlSource });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/circuit.test.ts`
Expected: PASS — all tests including the 4 new ones

- [ ] **Step 6: Commit**

```bash
git add src/circuit.ts src/circuit.test.ts
git commit -m "feat: add Circuit API methods and branch counting for controlled sources"
```

---

### Task 7: Compile controlled sources in `circuit.compile()`

Extend the `compile()` switch statement to instantiate E/G/H/F devices. Maintain a device map so H/F can look up controlling V-source branch indices by name.

**Files:**
- Modify: `src/circuit.ts:228-300` (compile switch)
- Modify: `src/circuit.test.ts`

- [ ] **Step 1: Write failing test for compile**

Append to `src/circuit.test.ts`:

```typescript
describe('controlled source compilation', () => {
  it('compiles VCCS into a device', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
    ckt.addVCCS('G1', '2', '0', '1', '0', 0.01);
    ckt.addResistor('RL', '2', '0', 1e3);
    ckt.addAnalysis('op');
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'G1')).toBeDefined();
  });

  it('compiles VCVS with a branch', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
    ckt.addVCVS('E1', '2', '0', '1', '0', 10);
    ckt.addResistor('RL', '2', '0', 1e3);
    ckt.addAnalysis('op');
    const compiled = ckt.compile();
    expect(compiled.branchCount).toBe(2); // V1 + E1
    expect(compiled.devices.find(d => d.name === 'E1')).toBeDefined();
  });

  it('compiles CCCS resolving controlling V-source', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vsense', '1', '2', { dc: 0 });
    ckt.addResistor('R1', '2', '0', 1e3);
    ckt.addCCCS('F1', '3', '0', 'Vsense', 5);
    ckt.addResistor('RL', '3', '0', 1e3);
    ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
    ckt.addAnalysis('op');
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'F1')).toBeDefined();
  });

  it('compiles CCVS with own branch + controlling reference', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vsense', '1', '2', { dc: 0 });
    ckt.addResistor('R1', '2', '0', 1e3);
    ckt.addCCVS('H1', '3', '0', 'Vsense', 1000);
    ckt.addResistor('RL', '3', '0', 1e3);
    ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
    ckt.addAnalysis('op');
    const compiled = ckt.compile();
    expect(compiled.branchCount).toBe(3); // Vsense + V1 + H1
    expect(compiled.devices.find(d => d.name === 'H1')).toBeDefined();
  });

  it('throws when CCCS references undefined V-source', () => {
    const ckt = new Circuit();
    ckt.addCCCS('F1', '1', '0', 'Vnope', 5);
    ckt.addResistor('R1', '1', '0', 1e3);
    ckt.addAnalysis('op');
    expect(() => ckt.compile()).toThrow('Vnope');
  });

  it('throws when CCVS references undefined V-source', () => {
    const ckt = new Circuit();
    ckt.addCCVS('H1', '1', '0', 'Vnope', 1000);
    ckt.addResistor('R1', '1', '0', 1e3);
    ckt.addAnalysis('op');
    expect(() => ckt.compile()).toThrow('Vnope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/circuit.test.ts`
Expected: FAIL — `Device type 'G' not yet implemented`

- [ ] **Step 3: Add imports for new device classes at top of `src/circuit.ts`**

After the existing import for `BSIM3v3` (line 11), add:

```typescript
import { VCCS } from './devices/vccs.js';
import { VCVS } from './devices/vcvs.js';
import { CCCS } from './devices/cccs.js';
import { CCVS } from './devices/ccvs.js';
```

- [ ] **Step 4: Add a `deviceMap` and controlled source cases to `compile()`**

In the `compile()` method, add a device map declaration after `const devices: DeviceModel[] = [];` (line 228):

```typescript
const deviceMap = new Map<string, DeviceModel>();
```

At the end of the `for` loop body, after the switch statement but before the closing brace of the for loop, add a single line that maps every successfully-created device:

```typescript
if (devices.length > prevLength) {
  deviceMap.set(desc.name, devices[devices.length - 1]);
}
```

Add `const prevLength = devices.length;` just before the switch statement to track whether a device was pushed. This avoids modifying every existing case — the map is populated automatically.

Then add the four new cases inside the switch, before `default`:

```typescript
case 'G': {
  const dev = new VCCS(desc.name, nodeIndices, desc.value!);
  devices.push(dev);
  deviceMap.set(desc.name, dev);
  break;
}
case 'E': {
  const bi = branchIndex++;
  branchNames.push(desc.name);
  const dev = new VCVS(desc.name, nodeIndices, bi, desc.value!);
  devices.push(dev);
  deviceMap.set(desc.name, dev);
  break;
}
case 'F': {
  const ctrlName = desc.controlSource!;
  const ctrlDev = deviceMap.get(ctrlName);
  if (!ctrlDev || ctrlDev.branches.length === 0) {
    throw new Error(
      `CCCS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
    );
  }
  const dev = new CCCS(desc.name, nodeIndices, ctrlDev.branches[0], desc.value!);
  devices.push(dev);
  deviceMap.set(desc.name, dev);
  break;
}
case 'H': {
  const ctrlName = desc.controlSource!;
  const ctrlDev = deviceMap.get(ctrlName);
  if (!ctrlDev || ctrlDev.branches.length === 0) {
    throw new Error(
      `CCVS '${desc.name}' references unknown or branchless source '${ctrlName}'`,
    );
  }
  const bi = branchIndex++;
  branchNames.push(desc.name);
  const dev = new CCVS(desc.name, nodeIndices, ctrlDev.branches[0], bi, desc.value!);
  devices.push(dev);
  deviceMap.set(desc.name, dev);
  break;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/circuit.test.ts`
Expected: PASS — all controlled source compilation tests green

- [ ] **Step 6: Run the full test suite for regression check**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/circuit.ts src/circuit.test.ts
git commit -m "feat: compile controlled sources (E/G/H/F) in circuit with device map lookups"
```

---

### Task 8: Parser support for E/G/H/F netlist elements

Add parsing of controlled source netlist lines. E/G take 4 nodes + gain. H/F take 2 nodes + Vsource name + gain.

**Files:**
- Modify: `src/parser/index.ts:140-206` (parseDevice switch)
- Modify: `src/parser/parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Append to `src/parser/parser.test.ts`:

```typescript
describe('controlled source parsing', () => {
  it('parses VCCS (G element)', () => {
    const ckt = parse(`
      V1 1 0 DC 1
      G1 2 0 1 0 10m
      R1 2 0 1k
      .op
    `);
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'G1')).toBeDefined();
    expect(compiled.branchCount).toBe(1); // only V1
  });

  it('parses VCVS (E element)', () => {
    const ckt = parse(`
      V1 1 0 DC 1
      E1 2 0 1 0 10
      R1 2 0 1k
      .op
    `);
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'E1')).toBeDefined();
    expect(compiled.branchCount).toBe(2); // V1 + E1
  });

  it('parses CCCS (F element)', () => {
    const ckt = parse(`
      V1 1 0 DC 1
      Vsense 1 2 DC 0
      R1 2 0 1k
      F1 3 0 Vsense 5
      R2 3 0 1k
      .op
    `);
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'F1')).toBeDefined();
  });

  it('parses CCVS (H element)', () => {
    const ckt = parse(`
      V1 1 0 DC 1
      Vsense 1 2 DC 0
      R1 2 0 1k
      H1 3 0 Vsense 1k
      R2 3 0 1k
      .op
    `);
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'H1')).toBeDefined();
    expect(compiled.branchCount).toBe(3); // V1 + Vsense + H1
  });

  it('is case-insensitive for controlled sources', () => {
    const ckt = parse(`
      v1 1 0 dc 1
      g1 2 0 1 0 10m
      r1 2 0 1k
      .op
    `);
    const compiled = ckt.compile();
    expect(compiled.devices.find(d => d.name === 'g1')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/parser.test.ts`
Expected: FAIL — `Unknown device type: 'G'`

- [ ] **Step 3: Add E/G/H/F cases to `parseDevice` in `src/parser/index.ts`**

In the `parseDevice` function, add these cases before the `default` case (before line 204):

```typescript
case 'E': {
  // E<name> n+ n- nc+ nc- gain
  const gain = parseNumber(tokens[5]);
  circuit.addVCVS(name, tokens[1], tokens[2], tokens[3], tokens[4], gain);
  break;
}
case 'G': {
  // G<name> n+ n- nc+ nc- gm
  const gm = parseNumber(tokens[5]);
  circuit.addVCCS(name, tokens[1], tokens[2], tokens[3], tokens[4], gm);
  break;
}
case 'H': {
  // H<name> n+ n- Vsource gain
  const gain = parseNumber(tokens[4]);
  circuit.addCCVS(name, tokens[1], tokens[2], tokens[3], gain);
  break;
}
case 'F': {
  // F<name> n+ n- Vsource gain
  const gain = parseNumber(tokens[4]);
  circuit.addCCCS(name, tokens[1], tokens[2], tokens[3], gain);
  break;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/parser/parser.test.ts`
Expected: PASS — all parser tests green including the 5 new ones

- [ ] **Step 5: Commit**

```bash
git add src/parser/index.ts src/parser/parser.test.ts
git commit -m "feat: parse controlled source netlist elements (E/G/H/F)"
```

---

### Task 9: Subcircuit expansion support for E/G/H/F

Extend `expandSubcircuit()` in `circuit.ts` to handle controlled source device types inside subcircuit bodies.

**Files:**
- Modify: `src/circuit.ts:451-569` (expandSubcircuit switch)
- Modify: `src/circuit.test.ts`

- [ ] **Step 1: Write failing test for subcircuit expansion of controlled sources**

Append to `src/circuit.test.ts` inside the `subcircuit expansion` describe block:

```typescript
it('expands subcircuit with VCCS (G device)', () => {
  const ckt = new Circuit();
  ckt.addSubcircuit({
    name: 'gamp',
    ports: ['inp', 'out', 'gnd'],
    params: {},
    body: ['G1 out gnd inp gnd 10m', 'R1 out gnd 1k'],
  });
  ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'gamp');
  ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
  ckt.addAnalysis('op');
  const compiled = ckt.compile();
  expect(compiled.devices.find(d => d.name === 'X1.G1')).toBeDefined();
});

it('expands subcircuit with VCVS (E device)', () => {
  const ckt = new Circuit();
  ckt.addSubcircuit({
    name: 'eamp',
    ports: ['inp', 'out', 'gnd'],
    params: {},
    body: ['E1 out gnd inp gnd 10'],
  });
  ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'eamp');
  ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
  ckt.addResistor('RL', '2', '0', 1e3);
  ckt.addAnalysis('op');
  const compiled = ckt.compile();
  expect(compiled.devices.find(d => d.name === 'X1.E1')).toBeDefined();
});

it('expands subcircuit with CCCS (F device)', () => {
  const ckt = new Circuit();
  ckt.addSubcircuit({
    name: 'famp',
    ports: ['inp', 'out', 'gnd'],
    params: {},
    body: ['Vs inp mid DC 0', 'R1 mid gnd 1k', 'F1 out gnd Vs 5'],
  });
  ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'famp');
  ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
  ckt.addResistor('RL', '2', '0', 1e3);
  ckt.addAnalysis('op');
  const compiled = ckt.compile();
  expect(compiled.devices.find(d => d.name === 'X1.F1')).toBeDefined();
});

it('expands subcircuit with CCVS (H device)', () => {
  const ckt = new Circuit();
  ckt.addSubcircuit({
    name: 'hamp',
    ports: ['inp', 'out', 'gnd'],
    params: {},
    body: ['Vs inp mid DC 0', 'R1 mid gnd 1k', 'H1 out gnd Vs 1k'],
  });
  ckt.addSubcircuitInstance('X1', ['1', '2', '0'], 'hamp');
  ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
  ckt.addResistor('RL', '2', '0', 1e3);
  ckt.addAnalysis('op');
  const compiled = ckt.compile();
  expect(compiled.devices.find(d => d.name === 'X1.H1')).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/circuit.test.ts`
Expected: FAIL — G/E/H/F cases not handled in `expandSubcircuit`

- [ ] **Step 3: Add E/G/H/F cases to the `expandSubcircuit` switch**

In `expandSubcircuit()`, inside the switch statement (after the `M` case, before the `X` case), add:

```typescript
case 'E': {
  const valStr = evalToken(tokens[5]);
  result.push({
    type: 'E', name: devName,
    nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
    value: parseNumber(valStr),
  });
  break;
}
case 'G': {
  const valStr = evalToken(tokens[5]);
  result.push({
    type: 'G', name: devName,
    nodes: [mapNode(tokens[1]), mapNode(tokens[2]), mapNode(tokens[3]), mapNode(tokens[4])],
    value: parseNumber(valStr),
  });
  break;
}
case 'H': {
  const valStr = evalToken(tokens[4]);
  result.push({
    type: 'H', name: devName,
    nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
    controlSource: `${instanceName}.${tokens[3]}`,
    value: parseNumber(valStr),
  });
  break;
}
case 'F': {
  const valStr = evalToken(tokens[4]);
  result.push({
    type: 'F', name: devName,
    nodes: [mapNode(tokens[1]), mapNode(tokens[2])],
    controlSource: `${instanceName}.${tokens[3]}`,
    value: parseNumber(valStr),
  });
  break;
}
```

Note: H/F `controlSource` is prefixed with `instanceName.` because the controlling V-source inside the subcircuit also gets prefixed — they must match at compile time.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/circuit.test.ts`
Expected: PASS — all subcircuit expansion tests green

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/circuit.ts src/circuit.test.ts
git commit -m "feat: support E/G/H/F controlled sources inside subcircuit expansion"
```

---

### Task 10: DC integration tests

End-to-end DC operating-point tests using `simulate()` with known closed-form answers.

**Files:**
- Create: `src/controlled-sources-integration.test.ts`

- [ ] **Step 1: Write the integration test file**

Create `src/controlled-sources-integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.js';

describe('Controlled sources integration', () => {
  describe('VCCS (G element)', () => {
    it('transconductance amplifier: Vout = gm * Vin * RL', async () => {
      // gm=10mS, Vin=1V, RL=1k => Vout = 0.01 * 1 * 1000 = 10V
      const result = await simulate(`
        V1 1 0 DC 1
        G1 2 0 1 0 10m
        R1 2 0 1k
        .op
      `);
      expect(result.dc!.voltage('2')).toBeCloseTo(10, 4);
    });
  });

  describe('VCVS (E element)', () => {
    it('voltage amplifier: Vout = gain * Vin', async () => {
      // gain=10, Vin=1V => Vout = 10V
      const result = await simulate(`
        V1 1 0 DC 1
        E1 2 0 1 0 10
        R1 2 0 1k
        .op
      `);
      expect(result.dc!.voltage('2')).toBeCloseTo(10, 4);
    });
  });

  describe('CCCS (F element)', () => {
    it('current mirror: Iout = gain * Isense', async () => {
      // V1=1V through R1=1k => Isense=1mA. gain=5 => Iout=5mA.
      // Iout through RL=1k => VRL = 5V
      const result = await simulate(`
        V1 1 0 DC 1
        Vsense 1 2 DC 0
        R1 2 0 1k
        F1 3 0 Vsense 5
        RL 3 0 1k
        .op
      `);
      // Isense = V1 / R1 = 1V / 1k = 1mA
      // Iout = 5 * 1mA = 5mA
      // V(3) = Iout * RL = 5mA * 1k = 5V
      expect(result.dc!.voltage('3')).toBeCloseTo(5, 4);
    });
  });

  describe('CCVS (H element)', () => {
    it('transimpedance amplifier: Vout = gain * Isense', async () => {
      // V1=1V through R1=1k => Isense=1mA. gain=1k => Vout=1V.
      const result = await simulate(`
        V1 1 0 DC 1
        Vsense 1 2 DC 0
        R1 2 0 1k
        H1 3 0 Vsense 1k
        RL 3 0 1k
        .op
      `);
      // Isense = 1V / 1k = 1mA
      // Vout = 1000 * 1mA = 1V
      expect(result.dc!.voltage('3')).toBeCloseTo(1, 4);
    });
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run src/controlled-sources-integration.test.ts`
Expected: PASS — all 4 DC integration tests green

- [ ] **Step 3: Commit**

```bash
git add src/controlled-sources-integration.test.ts
git commit -m "test: add DC integration tests for controlled sources"
```

---

### Task 11: AC integration test — inverting op-amp model

Test an inverting amplifier using a high-gain VCVS as an ideal op-amp approximation. Verify the closed-loop gain at AC matches -Rf/Rin.

**Files:**
- Modify: `src/controlled-sources-integration.test.ts`

- [ ] **Step 1: Write the AC integration test**

Append to `src/controlled-sources-integration.test.ts`:

```typescript
describe('AC analysis with controlled sources', () => {
  it('inverting op-amp (VCVS) has gain = -Rf/Rin at mid-band', async () => {
    // Ideal op-amp model: VCVS with gain = -100000
    // Inverting config: Rin=1k, Rf=10k => closed-loop gain = -10
    //
    // Circuit:
    //   Vac  1  0  AC 1 0           (AC stimulus)
    //   Rin  1  2  1k               (input resistor, node 2 = inverting input)
    //   Rf   2  3  10k              (feedback resistor)
    //   E1   3  0  0  2  100000     (VCVS: V(3) = 100000 * (V(0) - V(2)) = -100000 * V(2))
    //   .ac dec 10 1k 1k
    //
    // Note: non-inverting input is ground (node 0), inverting input is node 2.
    // E1 n+ n- nc+ nc- gain => V(3,0) = 100000 * V(0,2) = -100000 * V(2)
    const result = await simulate(`
      Vac 1 0 AC 1 0
      Rin 1 2 1k
      Rf 2 3 10k
      E1 3 0 0 2 100000
      .ac dec 1 1k 1k
    `);

    const ac = result.ac!;
    // At 1kHz, closed-loop gain magnitude should be ~10 (= Rf/Rin)
    const mag = ac.magnitude('3');
    expect(mag[0]).toBeCloseTo(10, 0);

    // Phase should be ~180 degrees (inverting)
    const phase = ac.phase('3');
    expect(Math.abs(phase[0])).toBeCloseTo(180, 0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/controlled-sources-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/controlled-sources-integration.test.ts
git commit -m "test: add AC integration test for inverting op-amp model using VCVS"
```

---

### Task 12: Final regression check and cleanup

Run the full suite, verify zero regressions, and ensure all new files are tracked.

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass with zero failures

- [ ] **Step 2: Verify new device exports work from the package entrypoint**

Run: `npx vitest run -t "VCCS\|VCVS\|CCCS\|CCVS"` (or similar grep)
Expected: All controlled source tests appear and pass

- [ ] **Step 3: Check for any unstaged files**

Run: `git status`
Expected: Clean working tree — all changes committed

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors
