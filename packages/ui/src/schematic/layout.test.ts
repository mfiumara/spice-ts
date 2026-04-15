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

  it('handles empty circuit', () => {
    const layout = layoutSchematic({ components: [], nets: [] });
    expect(layout.components).toHaveLength(0);
    expect(layout.wires).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });
});
