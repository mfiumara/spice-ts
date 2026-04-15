import { describe, it, expect } from 'vitest';
import { layoutSchematic } from './layout.js';
import type { CircuitIR } from './types.js';

/** Helper to build a simple CircuitIR for testing. */
function makeCircuit(...components: CircuitIR['components']): CircuitIR {
  const netSet = new Set<string>();
  for (const c of components) {
    for (const p of c.ports) {
      if (p.net !== '0') netSet.add(p.net);
    }
  }
  return { components, nets: [...netSet] };
}

describe('layoutSchematic', () => {
  it('lays out voltage divider left-to-right', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
      { type: 'R', id: 'R2', name: 'R2', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 2000 }, displayValue: '2k' },
    );
    const layout = layoutSchematic(circuit);

    expect(layout.components).toHaveLength(3);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);

    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const r1 = layout.components.find(c => c.component.name === 'R1')!;
    const r2 = layout.components.find(c => c.component.name === 'R2')!;
    expect(v1.x).toBeLessThan(r1.x);
    expect(r1.x).toBeLessThanOrEqual(r2.x);
  });

  it('produces wires connecting components on the same net', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { resistance: 1000 }, displayValue: '1k' },
    );
    const layout = layoutSchematic(circuit);

    expect(layout.wires.length).toBeGreaterThan(0);
    const inWire = layout.wires.find(w => w.net === 'in');
    expect(inWire).toBeDefined();
  });

  it('places ground symbols at bottom', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: '1' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: '1' }, { name: 'n', net: '0' }], params: { resistance: 1000 }, displayValue: '1k' },
    );
    const layout = layoutSchematic(circuit);

    const v1 = layout.components.find(c => c.component.name === 'V1')!;
    const gndPin = v1.pins.find(p => p.net === '0');
    const sigPin = v1.pins.find(p => p.net === '1');
    if (gndPin && sigPin) {
      expect(gndPin.y).toBeGreaterThanOrEqual(sigPin.y);
    }
  });

  it('handles empty circuit', () => {
    const layout = layoutSchematic({ components: [], nets: [] });
    expect(layout.components).toHaveLength(0);
    expect(layout.wires).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });
});
