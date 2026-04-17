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
  it('places all components and produces valid bounds', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
      { type: 'R', id: 'R2', name: 'R2', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 2000 }, displayValue: '2k' },
    );
    const layout = layoutSchematic(circuit);

    expect(layout.components).toHaveLength(3);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(0);
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

  it('ranks ground lower than source positive terminal (higher Y)', () => {
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

    // drain pin (port 0) should be at higher x than gate (port 1)
    const drainPin = m1.pins[0];
    const gatePin = m1.pins[1];
    expect(drainPin.x).toBeGreaterThan(gatePin.x);
  });

  it('places components spanning same ranks side by side', () => {
    const circuit = makeCircuit(
      { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
      { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { resistance: 1000 }, displayValue: '1k' },
    );
    const layout = layoutSchematic(circuit);

    const v1 = layout.components.find(c => c.component.id === 'V1')!;
    const r1 = layout.components.find(c => c.component.id === 'R1')!;
    // Different X (side by side), similar Y (same rank span)
    expect(v1.x).not.toBe(r1.x);
  });

  it('handles empty circuit', () => {
    const layout = layoutSchematic({ components: [], nets: [] });
    expect(layout.components).toHaveLength(0);
    expect(layout.wires).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });

  describe('buck-boost inverting topology', () => {
    function makeBuckBoost(): CircuitIR {
      return makeCircuit(
        { type: 'V', id: 'Vin',   name: 'Vin',   ports: [{ name: 'p', net: 'in' },   { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg',    name: 'Vg',    ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 },  displayValue: 'PULSE' },
        { type: 'M', id: 'M1',    name: 'M1',    ports: [
          { name: 'drain',  net: 'in' },
          { name: 'gate',   net: 'gate' },
          { name: 'source', net: 'sw' },
          { name: 'bulk',   net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'L', id: 'L1',    name: 'L1',    ports: [{ name: 'p', net: 'sw' },   { name: 'n', net: 'n1' }],  params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'D', id: 'D1',    name: 'D1',    ports: [{ name: 'p', net: 'n1' },   { name: 'n', net: '0' }],  params: { modelName: 'DMOD' },   displayValue: 'DMOD' },
        { type: 'C', id: 'C1',    name: 'C1',    ports: [{ name: 'p', net: 'n1' },   { name: 'n', net: 'neg' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'neg' },  { name: 'n', net: '0' }],  params: { resistance: 10 },      displayValue: '10' },
      );
    }

    function horizontalBusY(layout: ReturnType<typeof layoutSchematic>, net: string): number | undefined {
      const w = layout.wires.find(w => w.net === net);
      if (!w) return undefined;
      const hSeg = w.segments.find(s => s.y1 === s.y2);
      return hSeg?.y1;
    }

    it('assigns distinct vertical positions to in, gate, sw nets', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const inY = horizontalBusY(layout, 'in');
      const gateY = horizontalBusY(layout, 'gate');
      const swY = horizontalBusY(layout, 'sw');

      expect(inY).toBeDefined();
      expect(gateY).toBeDefined();
      expect(swY).toBeDefined();
      const ys = new Set([inY, gateY, swY]);
      expect(ys.size).toBe(3);
    });

    it('orders nets by potential: in above sw above n1 (lower Y = higher on screen)', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const inY = horizontalBusY(layout, 'in')!;
      const swY = horizontalBusY(layout, 'sw')!;
      const n1Y = horizontalBusY(layout, 'n1')!;

      expect(inY).toBeLessThan(swY);
      expect(swY).toBeLessThan(n1Y);
    });

    it('places M1 with drain pin above source pin', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const m1 = layout.components.find(c => c.component.id === 'M1')!;
      const drain = m1.pins[0];
      const source = m1.pins[2];
      expect(drain.y).toBeLessThan(source.y);
    });

    it('places no two-terminal component degenerately (endpoints on the same rank)', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const twoTerm = ['Vin', 'L1', 'D1', 'C1', 'Rload'];
      for (const id of twoTerm) {
        const pc = layout.components.find(c => c.component.id === id)!;
        const busYs = pc.pins.map(p => horizontalBusY(layout, p.net) ?? p.y);
        const distinctYs = new Set(busYs);
        expect(distinctYs.size, `${id} endpoints should span distinct vertical positions`).toBeGreaterThan(1);
      }
    });

    it('does not draw horizontal buses of different nets on the same pixel row with overlapping x ranges', () => {
      const layout = layoutSchematic(makeBuckBoost());
      type HSeg = { net: string; y: number; xMin: number; xMax: number };
      const hSegs: HSeg[] = [];
      for (const w of layout.wires) {
        for (const s of w.segments) {
          if (s.y1 === s.y2) {
            hSegs.push({ net: w.net, y: s.y1, xMin: Math.min(s.x1, s.x2), xMax: Math.max(s.x1, s.x2) });
          }
        }
      }
      for (let i = 0; i < hSegs.length; i++) {
        for (let j = i + 1; j < hSegs.length; j++) {
          const a = hSegs[i], b = hSegs[j];
          if (a.net === b.net) continue;
          if (a.y !== b.y) continue;
          const overlap = Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin);
          expect(overlap, `nets ${a.net} and ${b.net} overlap on y=${a.y}`).toBeLessThanOrEqual(0);
        }
      }
    });
  });
});
