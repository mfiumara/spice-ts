import { describe, it, expect } from 'vitest';
import { layoutSchematic } from './layout.js';
import { GRID } from './symbols.js';
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

    it('keeps in, gate, and sw buses visually separated (different Y or disjoint x)', () => {
      const layout = layoutSchematic(makeBuckBoost());
      type H = { net: string; y: number; x1: number; x2: number };
      const segs: H[] = [];
      for (const w of layout.wires) {
        for (const s of w.segments) {
          if (s.y1 === s.y2 && (w.net === 'in' || w.net === 'gate' || w.net === 'sw')) {
            segs.push({ net: w.net, y: s.y1, x1: Math.min(s.x1, s.x2), x2: Math.max(s.x1, s.x2) });
          }
        }
      }
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const a = segs[i], b = segs[j];
          if (a.net === b.net || a.y !== b.y) continue;
          const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
          expect(overlap, `${a.net}/${b.net} overlap at y=${a.y}`).toBeLessThanOrEqual(0);
        }
      }
    });

    it('orders nets by potential: in above the sw/n1 rail (lower Y = higher on screen)', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const inY = horizontalBusY(layout, 'in')!;
      const swY = horizontalBusY(layout, 'sw')!;
      const n1Y = horizontalBusY(layout, 'n1')!;

      // sw and n1 share a rail (L1 has no DC drop)
      expect(Math.abs(swY - n1Y)).toBeLessThanOrEqual(GRID * 2);
      // in sits above the sw/n1 rail
      expect(inY).toBeLessThan(swY);
    });

    it('places M1 with drain pin above source pin', () => {
      const layout = layoutSchematic(makeBuckBoost());
      const m1 = layout.components.find(c => c.component.id === 'M1')!;
      const drain = m1.pins[0];
      const source = m1.pins[2];
      expect(drain.y).toBeLessThan(source.y);
    });

    it('rank-differentiating components (V, D, C) span distinct vertical positions', () => {
      // R and L can legitimately be rank-preserving (same rail on both ends)
      // when no DC current flows through them. V, D, C must cross rails.
      const layout = layoutSchematic(makeBuckBoost());
      for (const id of ['Vin', 'D1', 'C1']) {
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

  describe('common textbook topologies', () => {
    function horizontalBusY(layout: ReturnType<typeof layoutSchematic>, net: string): number | undefined {
      const w = layout.wires.find(w => w.net === net);
      if (!w) return undefined;
      const hSeg = w.segments.find(s => s.y1 === s.y2);
      if (hSeg) return hSeg.y1;
      // No explicit horizontal segment — the net's bus Y is the Y that shared
      // by all vertical drops' endpoints.
      const ys = w.segments.flatMap(s => [s.y1, s.y2]);
      const counts = new Map<number, number>();
      for (const y of ys) counts.set(y, (counts.get(y) ?? 0) + 1);
      let best = -Infinity, bestN = 0;
      for (const [y, n] of counts) if (n > bestN) { best = y; bestN = n; }
      return bestN >= 2 ? best : undefined;
    }

    it('RC low-pass: R with no DC current → in and out share the top rail', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-9 }, displayValue: '100n' },
      );
      const layout = layoutSchematic(circuit);
      const inY = horizontalBusY(layout, 'in')!;
      const outY = horizontalBusY(layout, 'out')!;
      // in and out must be on the same rail (within the corridor-offset band)
      expect(Math.abs(inY - outY)).toBeLessThanOrEqual(GRID * 2);
      // R1 should render horizontally (both pins at the same Y)
      const r1 = layout.components.find(c => c.component.id === 'R1')!;
      expect(r1.pins[0].y).toBe(r1.pins[1].y);
    });

    it('RLC series bandpass: R and L have no DC drop → in/mid/n1 share the top rail', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }],  params: { dc: 5 }, displayValue: 'PULSE' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: 'mid' }], params: { resistance: 100 }, displayValue: '100' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'mid' }, { name: 'n', net: 'n1' }],  params: { inductance: 10e-3 }, displayValue: '10m' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'n1' },  { name: 'n', net: '0' }],   params: { capacitance: 1e-6 }, displayValue: '1u' },
      );
      const layout = layoutSchematic(circuit);
      const inY  = horizontalBusY(layout, 'in')!;
      const midY = horizontalBusY(layout, 'mid')!;
      const n1Y  = horizontalBusY(layout, 'n1')!;
      // All three share the same rail
      expect(Math.abs(inY - midY)).toBeLessThanOrEqual(GRID * 2);
      expect(Math.abs(midY - n1Y)).toBeLessThanOrEqual(GRID * 2);
      // R1 and L1 render horizontally
      for (const id of ['R1', 'L1']) {
        const c = layout.components.find(c => c.component.id === id)!;
        expect(c.pins[0].y).toBe(c.pins[1].y);
      }
    });

    it('voltage divider: R in a DC loop stays rank-differentiating', () => {
      // V-R1-R2-gnd: removing either R leaves a DC path via the other R and V,
      // so both R's carry DC current and must separate ranks.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'R', id: 'R2', name: 'R2', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }],  params: { resistance: 2000 }, displayValue: '2k' },
      );
      const layout = layoutSchematic(circuit);
      const inY  = horizontalBusY(layout, 'in')!;
      const outY = horizontalBusY(layout, 'out')!;
      expect(inY).toBeLessThan(outY);
    });

    it('RC low-pass: V1, R1, C1 top pins all sit on a single horizontal rail', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-9 }, displayValue: '100n' },
      );
      const layout = layoutSchematic(circuit);
      const v1in = layout.components.find(c => c.component.id === 'V1')!.pins.find(p => p.net === 'in')!;
      const r1in = layout.components.find(c => c.component.id === 'R1')!.pins.find(p => p.net === 'in')!;
      const r1out = layout.components.find(c => c.component.id === 'R1')!.pins.find(p => p.net === 'out')!;
      const c1out = layout.components.find(c => c.component.id === 'C1')!.pins.find(p => p.net === 'out')!;
      expect(v1in.y).toBe(r1in.y);
      expect(r1out.y).toBe(c1out.y);
    });

    it('RC low-pass: components flow V1 → R1 → C1 from left to right', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-9 }, displayValue: '100n' },
      );
      const layout = layoutSchematic(circuit);
      const v1 = layout.components.find(c => c.component.id === 'V1')!;
      const r1 = layout.components.find(c => c.component.id === 'R1')!;
      const c1 = layout.components.find(c => c.component.id === 'C1')!;
      expect(v1.x).toBeLessThan(r1.x);
      expect(r1.x).toBeLessThan(c1.x);
    });

    it('RLC bandpass: components flow V1 → R1 → L1 → C1', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }],  params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: 'mid' }], params: { resistance: 100 }, displayValue: '100' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'mid' }, { name: 'n', net: 'n1' }],  params: { inductance: 10e-3 }, displayValue: '10m' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'n1' },  { name: 'n', net: '0' }],   params: { capacitance: 1e-6 }, displayValue: '1u' },
      );
      const layout = layoutSchematic(circuit);
      const xs = ['V1', 'R1', 'L1', 'C1'].map(id => layout.components.find(c => c.component.id === id)!.x);
      expect(xs[0]).toBeLessThan(xs[1]);
      expect(xs[1]).toBeLessThan(xs[2]);
      expect(xs[2]).toBeLessThan(xs[3]);
    });

    it('Sallen-Key: in, n1, n2, and out all sit on one signal rail', () => {
      // Unity-gain VCVS: E1 pins outN=0 and ctrlN=out, so out is electrically
      // at the opamp's output — same DC potential as the input via feedback.
      // Expect a single signal rail, not a second rank above it.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { ac: 1 }, displayValue: 'AC 1' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: 'n1' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'R', id: 'R2', name: 'R2', ports: [{ name: 'p', net: 'n1' }, { name: 'n', net: 'n2' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'n1' }, { name: 'n', net: 'out' }], params: { capacitance: 10e-9 }, displayValue: '10n' },
        { type: 'C', id: 'C2', name: 'C2', ports: [{ name: 'p', net: 'n2' }, { name: 'n', net: '0' }],  params: { capacitance: 10e-9 }, displayValue: '10n' },
        { type: 'E', id: 'E1', name: 'E1', ports: [
          { name: 'ctrlP', net: 'n2' },
          { name: 'ctrlN', net: 'out' },
          { name: 'outP',  net: 'out' },
          { name: 'outN',  net: '0' },
        ], params: { gain: 1e6 }, displayValue: '1e6' },
      );
      const layout = layoutSchematic(circuit);
      const y = (net: string) => horizontalBusY(layout, net);
      const inY = y('in')!, n1Y = y('n1')!, n2Y = y('n2')!, outY = y('out')!;
      for (const [a, b, name] of [[inY, n1Y, 'in/n1'], [n1Y, n2Y, 'n1/n2'], [n2Y, outY, 'n2/out']] as const) {
        expect(Math.abs(a - b), `${name} not on same rail`).toBeLessThanOrEqual(GRID * 2);
      }
    });

    it('CMOS inverter: MP and MN stack in the same column', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'VDD', name: 'VDD', ports: [{ name: 'p', net: 'vdd' }, { name: 'n', net: '0' }], params: { dc: 1.8 }, displayValue: 'DC 1.8' },
        { type: 'V', id: 'VIN', name: 'VIN', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }], params: { dc: 0 },   displayValue: 'DC 0' },
        { type: 'M', id: 'MP',  name: 'MP',  ports: [
          { name: 'drain',  net: 'out' },
          { name: 'gate',   net: 'in' },
          { name: 'source', net: 'vdd' },
          { name: 'bulk',   net: 'vdd' },
        ], params: { modelName: 'PMOD', channelType: 'p' }, displayValue: 'PMOD' },
        { type: 'M', id: 'MN',  name: 'MN',  ports: [
          { name: 'drain',  net: 'out' },
          { name: 'gate',   net: 'in' },
          { name: 'source', net: '0' },
          { name: 'bulk',   net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
      );
      const layout = layoutSchematic(circuit);
      const mp = layout.components.find(c => c.component.id === 'MP')!;
      const mn = layout.components.find(c => c.component.id === 'MN')!;
      expect(mp.x).toBe(mn.x);
      expect(mp.y).toBeLessThan(mn.y);
    });

    it('common-source amp: RD with a DC path through the MOSFET stays differentiating', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'VDD', name: 'VDD', ports: [{ name: 'p', net: 'vdd' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'V', id: 'VGS', name: 'VGS', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }], params: { dc: 1.5 }, displayValue: 'AC 1' },
        { type: 'M', id: 'M1',  name: 'M1',  ports: [
          { name: 'drain',  net: 'out' },
          { name: 'gate',   net: 'in' },
          { name: 'source', net: '0' },
          { name: 'bulk',   net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'R', id: 'RD',  name: 'RD',  ports: [{ name: 'p', net: 'vdd' }, { name: 'n', net: 'out' }], params: { resistance: 10000 }, displayValue: '10k' },
      );
      const layout = layoutSchematic(circuit);
      const vddY = horizontalBusY(layout, 'vdd')!;
      const outY = horizontalBusY(layout, 'out')!;
      expect(vddY).toBeLessThan(outY);
    });

    it('CMOS inverter: vdd rail sits above out, which sits above gnd', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'VDD', name: 'VDD', ports: [{ name: 'p', net: 'vdd' }, { name: 'n', net: '0' }], params: { dc: 1.8 }, displayValue: 'DC 1.8' },
        { type: 'V', id: 'VIN', name: 'VIN', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }], params: { dc: 0 },   displayValue: 'DC 0' },
        { type: 'M', id: 'MP',  name: 'MP',  ports: [
          { name: 'drain',  net: 'out' },
          { name: 'gate',   net: 'in' },
          { name: 'source', net: 'vdd' },
          { name: 'bulk',   net: 'vdd' },
        ], params: { modelName: 'PMOD', channelType: 'p' }, displayValue: 'PMOD' },
        { type: 'M', id: 'MN',  name: 'MN',  ports: [
          { name: 'drain',  net: 'out' },
          { name: 'gate',   net: 'in' },
          { name: 'source', net: '0' },
          { name: 'bulk',   net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
      );
      const layout = layoutSchematic(circuit);
      const vddY = horizontalBusY(layout, 'vdd')!;
      const outY = horizontalBusY(layout, 'out')!;
      expect(vddY).toBeLessThan(outY);

      // MP drain should be below its source (source=vdd is the high side for PMOS)
      const mp = layout.components.find(c => c.component.id === 'MP')!;
      const mpDrain  = mp.pins[0];
      const mpSource = mp.pins[2];
      expect(mpDrain.y).toBeGreaterThan(mpSource.y);
    });
  });
});
