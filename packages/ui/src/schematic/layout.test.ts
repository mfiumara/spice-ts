import { describe, it, expect } from 'vitest';
import { layoutSchematic } from './layout.js';
import { GRID, getSymbol } from './symbols.js';
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
      // so both R's carry DC current and must separate ranks. R1 and R2 stack
      // in one column so the `out` tap between them sits strictly below `in`.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' },  { name: 'n', net: 'out' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'R', id: 'R2', name: 'R2', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }],  params: { resistance: 2000 }, displayValue: '2k' },
      );
      const layout = layoutSchematic(circuit);
      const r1 = layout.components.find(c => c.component.id === 'R1')!;
      const inPinY = r1.pins.find(p => p.net === 'in')!.y;
      const outPinY = r1.pins.find(p => p.net === 'out')!.y;
      expect(inPinY).toBeLessThan(outPinY);
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

    it('Sallen-Key: feedback cap C1 stretches across the opamp feedback span', () => {
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
      const c1 = layout.components.find(c => c.component.id === 'C1')!;
      // The feedback cap's two pins span from the leftmost n1 pin on the
      // chain to the rightmost out pin at the opamp, so the loop visibly
      // brackets the signal chain instead of sitting in one narrow column.
      const capWidth = Math.abs(c1.pins[0].x - c1.pins[1].x);
      expect(capWidth).toBeGreaterThan(GRID * 10);
    });

    it('Sallen-Key: feedback cap C1 is elevated above the main signal rail', () => {
      // C1 connects n1 to out, both on the signal rail. Conventional
      // schematics draw it as a loop above the chain rather than in-line,
      // so C1's pins must sit at a smaller Y than R1/R2's pins.
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
      const c1 = layout.components.find(c => c.component.id === 'C1')!;
      const r1 = layout.components.find(c => c.component.id === 'R1')!;
      expect(c1.pins[0].y).toBeLessThan(r1.pins[0].y - GRID * 2);
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

    it('Sallen-Key: no wire segments cross at the opamp inputs', () => {
      // When -in and +in connect to different nets whose buses sit on the
      // same side of the opamp, the drop-wires must neither overlap (same x)
      // nor cross (one net's drop passing through another's bus). This test
      // checks the stronger property: for any two distinct-net segments
      // (one vertical, one horizontal), they don't intersect in the plane.
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
      type Seg = { net: string; x1: number; y1: number; x2: number; y2: number };
      const segs: Seg[] = [];
      for (const w of layout.wires) for (const s of w.segments) segs.push({ net: w.net, ...s });
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const a = segs[i], b = segs[j];
          if (a.net === b.net) continue;
          const aH = a.y1 === a.y2, bH = b.y1 === b.y2;
          if (aH === bH) continue; // both horizontal or both vertical — skip
          const h = aH ? a : b, v = aH ? b : a;
          const xMin = Math.min(h.x1, h.x2), xMax = Math.max(h.x1, h.x2);
          const yMin = Math.min(v.y1, v.y2), yMax = Math.max(v.y1, v.y2);
          // Strict interior intersection (endpoints touching is fine).
          const xi = v.x1, yi = h.y1;
          if (xi > xMin && xi < xMax && yi > yMin && yi < yMax) {
            throw new Error(`Crossing at (${xi},${yi}): net ${h.net} horizontal crosses net ${v.net} vertical`);
          }
        }
      }
    });

    it('Sallen-Key: opamp input pins do not share an x-coordinate', () => {
      // ctrlP (+in) connects to n2 whose bus is above the opamp; ctrlN (-in)
      // connects to out whose bus is also above. If both pins sit at the same
      // x, their vertical drop-wires to those two different buses run atop
      // each other and visually merge into one line. The symbol must separate
      // them horizontally so each drop has its own corridor.
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
      const e1 = layout.components.find(c => c.component.id === 'E1')!;
      const ctrlP = e1.pins[0], ctrlN = e1.pins[1];
      expect(ctrlP.x).not.toBe(ctrlN.x);
    });

    it('half-wave rectifier: out rail sits above ground, not collapsed onto it', () => {
      // Rl carries the rectified DC current from out to ground through the
      // diode path V1→0 ... anode←D1←out. Without diodes treated as DC-
      // conductive, the DC-path check for Rl falsely concludes there's no
      // other route from out to 0 and marks Rl rank-preserving. That collapses
      // 'out' onto the ground rank, drawing Rl and Cl horizontally along the
      // bus — so the horizontal out-bus wire runs through Rl's body.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { ac: 5 }, displayValue: 'SIN 0 5 1k' },
        { type: 'R', id: 'Rs', name: 'Rs', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'anode' }], params: { resistance: 10 }, displayValue: '10' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'anode' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'R', id: 'Rl', name: 'Rl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'C', id: 'Cl', name: 'Cl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 10e-6 }, displayValue: '10u' },
      );
      const layout = layoutSchematic(circuit);
      const rl = layout.components.find(c => c.component.id === 'Rl')!;
      const outPin = rl.pins.find(p => p.net === 'out')!;
      const gndPin = rl.pins.find(p => p.net === '0')!;
      // Sanity: the ground pin sits visibly below the out pin (load resistor
      // drops its current toward ground, not collapsed onto the ground rail).
      expect(gndPin.y).toBeGreaterThan(outPin.y);
    });

    it('half-wave rectifier: Rl draws vertically between out rail and ground', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { ac: 5 }, displayValue: 'SIN 0 5 1k' },
        { type: 'R', id: 'Rs', name: 'Rs', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'anode' }], params: { resistance: 10 }, displayValue: '10' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'anode' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'R', id: 'Rl', name: 'Rl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'C', id: 'Cl', name: 'Cl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 10e-6 }, displayValue: '10u' },
      );
      const layout = layoutSchematic(circuit);
      const rl = layout.components.find(c => c.component.id === 'Rl')!;
      const outPin = rl.pins.find(p => p.net === 'out')!;
      const gndPin = rl.pins.find(p => p.net === '0')!;
      // A vertical resistor has its rail-side pin strictly above its ground
      // pin (pin-Y differs by the full rank span, not both sitting on a
      // horizontal body).
      expect(outPin.y).toBeLessThan(gndPin.y - GRID);
    });

    it('half-wave rectifier: V1, Rl, and Cl ground pins share a single ground rail Y', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { ac: 5 }, displayValue: 'SIN 0 5 1k' },
        { type: 'R', id: 'Rs', name: 'Rs', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'anode' }], params: { resistance: 10 }, displayValue: '10' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'anode' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'R', id: 'Rl', name: 'Rl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'C', id: 'Cl', name: 'Cl', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 10e-6 }, displayValue: '10u' },
      );
      const layout = layoutSchematic(circuit);
      const gnds = ['V1', 'Rl', 'Cl'].map(id =>
        layout.components.find(c => c.component.id === id)!.pins.find(p => p.net === '0')!.y
      );
      for (let i = 1; i < gnds.length; i++) expect(gnds[i]).toBe(gnds[0]);
    });

    it('buck/boost converter: horizontal buses do not pass through V-source bodies', () => {
      // A common same-rank topology has multiple V sources driving different
      // input nets (Vin for the supply, Vg for the gate). Horizontal buses
      // between other components must skirt above the V-source bodies, which
      // hang from the rail down to ground.
      function check(circuit: CircuitIR) {
        const layout = layoutSchematic(circuit);
        const vBodies: Array<{ x1: number; x2: number; y1: number; y2: number }> = [];
        for (const pc of layout.components) {
          if (pc.component.type !== 'V' && pc.component.type !== 'I') continue;
          const xs = pc.pins.map(p => p.x);
          const ys = pc.pins.map(p => p.y);
          // The actual symbol body is a circle of ~GRID*0.9 radius centered
          // between the pins; long connecting leads stretch between the body
          // and each pin when the source spans multiple ranks. A bus crossing
          // a lead is acceptable (standard no-junction crossing); crossing
          // the body circle is not.
          const yMin = Math.min(...ys), yMax = Math.max(...ys);
          const center = (yMin + yMax) / 2;
          const half = Math.min((yMax - yMin) / 2, GRID * 0.9);
          vBodies.push({ x1: Math.min(...xs), x2: Math.max(...xs), y1: center - half, y2: center + half });
        }
        const vPins = new Set<string>();
        for (const pc of layout.components) {
          if (pc.component.type !== 'V' && pc.component.type !== 'I') continue;
          for (const p of pc.pins) vPins.add(`${p.x},${p.y}`);
        }
        for (const w of layout.wires) {
          for (const s of w.segments) {
            if (s.y1 !== s.y2) continue; // only horizontal bus segments
            const x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2);
            for (const b of vBodies) {
              if (s.y1 <= b.y1 || s.y1 >= b.y2) continue;
              if (x2 <= b.x1 || x1 >= b.x2) continue;
              // The bus y is strictly inside the V body y-range AND x-ranges overlap.
              const crossesVPin = vPins.has(`${b.x1},${s.y1}`) || vPins.has(`${b.x2},${s.y1}`);
              if (!crossesVPin) {
                throw new Error(`wire on net ${w.net} at y=${s.y1} crosses through V body [${b.x1}..${b.x2}, ${b.y1}..${b.y2}]`);
              }
            }
          }
        }
      }
      check(makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      ));
      check(makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'sw' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: '0' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      ));
    });

    it('buck converter: L1 inductor stays straight horizontal (no drops at its pins)', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const l1 = layout.components.find(c => c.component.id === 'L1')!;
      const swPin = l1.pins.find(p => p.net === 'sw')!;
      const outPin = l1.pins.find(p => p.net === 'out')!;
      // Both pins sit on the rail — neither net's bus should force a drop at
      // the inductor ends.
      const swBusY = layout.wires.find(w => w.net === 'sw')?.segments.find(s => s.y1 === s.y2)?.y1;
      const outBusY = layout.wires.find(w => w.net === 'out')?.segments.find(s => s.y1 === s.y2)?.y1;
      expect(swBusY).toBe(swPin.y);
      expect(outBusY).toBe(outPin.y);
    });

    it('boost converter: L1 inductor and sw bus share the rail (no drops at its pins)', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'sw' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: '0' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const l1 = layout.components.find(c => c.component.id === 'L1')!;
      const inPin = l1.pins.find(p => p.net === 'in')!;
      const swPin = l1.pins.find(p => p.net === 'sw')!;
      const inBusY = layout.wires.find(w => w.net === 'in')?.segments.find(s => s.y1 === s.y2)?.y1;
      const swBusY = layout.wires.find(w => w.net === 'sw')?.segments.find(s => s.y1 === s.y2)?.y1;
      expect(inBusY).toBe(inPin.y);
      expect(swBusY).toBe(swPin.y);
    });

    it('buck converter: in bus does not route through M1 transistor body', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const m1 = layout.components.find(c => c.component.id === 'M1')!;
      // M1's symbol bounding box
      const m1X1 = m1.x, m1X2 = m1.x + 50;  // MOSFET width 2.5*GRID
      const m1Y1 = m1.y, m1Y2 = m1.y + 50;  // MOSFET height 2.5*GRID
      const inWire = layout.wires.find(w => w.net === 'in')!;
      for (const s of inWire.segments) {
        if (s.y1 !== s.y2) continue; // only horizontal buses
        const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
        const xOverlaps = xMax > m1X1 && xMin < m1X2;
        const yStrictlyInside = s.y1 > m1Y1 && s.y1 < m1Y2;
        const atPin = m1.pins.some(p => Math.abs(p.y - s.y1) < 1);
        expect(!(xOverlaps && yStrictlyInside && !atPin), `in bus at y=${s.y1} routes through M1 body [${m1X1}..${m1X2}, ${m1Y1}..${m1Y2}]`).toBe(true);
      }
    });

    it('buck-boost inverting: Rload draws vertically from neg rail down to ground', () => {
      // In an inverting buck-boost, the output cap C1 sits on the `neg` rail
      // and Rload pulls `neg` toward ground. Without a parallel DC path via
      // other components, the rank heuristic wrongly collapses `neg` onto the
      // ground rail — Rload ends up horizontal. A load resistor on a cap
      // output must always draw vertically.
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'in' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'sw' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'n1' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: 'n1' }, { name: 'n', net: '0' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'n1' }, { name: 'n', net: 'neg' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'neg' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const rload = layout.components.find(c => c.component.id === 'Rload')!;
      const negPin = rload.pins.find(p => p.net === 'neg')!;
      const gndPin = rload.pins.find(p => p.net === '0')!;
      // Pins on different Y (vertical body), ground strictly below neg.
      expect(negPin.y).toBeLessThan(gndPin.y - GRID);
    });

    it('buck converter: in bus does not cross Vg source body', () => {
      // In a buck converter with two V sources (Vin driving `in`, Vg driving
      // `gate`), Vg gets stretched upward so its + pin lines up with the
      // MOSFET gate. That stretches Vg's body across the `in` bus Y, so Vin
      // must be placed to the RIGHT of Vg; otherwise Vin's bus runs through
      // Vg's body.
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const vg = layout.components.find(c => c.component.id === 'Vg')!;
      const vgBodyYMin = Math.min(vg.pins[0].y, vg.pins[1].y);
      const vgBodyYMax = Math.max(vg.pins[0].y, vg.pins[1].y);
      // V-source body circle is at pin-center x, use a tight horizontal band.
      const vgCenterX = vg.pins[0].x;
      const inWire = layout.wires.find(w => w.net === 'in')!;
      for (const s of inWire.segments) {
        if (s.y1 !== s.y2) continue;
        const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
        const xCrosses = vgCenterX > xMin && vgCenterX < xMax;
        const yInBody = s.y1 >= vgBodyYMin && s.y1 <= vgBodyYMax;
        expect(xCrosses && yInBody, `in bus at y=${s.y1} x=[${xMin},${xMax}] crosses Vg body at x=${vgCenterX} y=[${vgBodyYMin},${vgBodyYMax}]`).toBe(false);
      }
    });

    it('diode with anode at lower rank flips its triangle so it points from anode to cathode', () => {
      // A freewheel-style diode with anode=gnd (rank 0) and cathode=sw
      // (higher rank) must render with the triangle apex at the TOP (cathode
      // side) and the anode lead coming from the BOTTOM. Without flipping
      // the symbol, the triangle points from cathode to anode — backwards.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 5 }, displayValue: 'DC 5' },
        { type: 'R', id: 'R1', name: 'R1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'out' }], params: { resistance: 1 }, displayValue: '1' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'out' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
      );
      const layout = layoutSchematic(circuit);
      const d1 = layout.components.find(c => c.component.id === 'D1')!;
      const anode = d1.pins.find(p => p.net === '0')!;
      const cathode = d1.pins.find(p => p.net === 'out')!;
      // Anode (ground) is physically below cathode.
      expect(anode.y).toBeGreaterThan(cathode.y);
      // The symbol's triangle path must now point UP (tip closer to cathode y
      // than base). We detect this by checking the triangle path in the
      // symbol: the tip y-coordinate sits above the base y-coordinate.
      const sym = getSymbol('D', d1.component.displayValue ?? '', d1.horizontal ?? false, d1.stretchH, d1.stretchW, d1.flipped ?? false);
      const trianglePath = sym.elements.find(el => el.tag === 'path')!;
      const d = trianglePath.attrs.d as string;
      // Triangle path format: M<x>,<y> L<x>,<y> L<x>,<y> Z. For a vertical
      // diode flipped so triangle points up, the tip y is the SMALLEST y
      // among the three points (tip at top, base spans across bottom).
      const matches = [...d.matchAll(/[ML]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)];
      const ys = matches.map(m => parseFloat(m[2]));
      const tipY = ys[2]; // third point is the tip in our M L L Z pattern
      const baseY1 = ys[0], baseY2 = ys[1];
      expect(tipY).toBeLessThan(Math.min(baseY1, baseY2));
    });

    it('buck converter: freewheel diode D1 (anode=0, cathode=sw) draws vertically', () => {
      // D1 bridges ground (rank 0) to the switch node (higher rank). A
      // horizontal diode body would put both pins on a midline row with long
      // drop-wires on each side. Drawing vertically keeps the cathode on the
      // sw rail and the anode on the ground rail.
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const d1 = layout.components.find(c => c.component.id === 'D1')!;
      const swPin = d1.pins.find(p => p.net === 'sw')!;
      const gndPin = d1.pins.find(p => p.net === '0')!;
      // Vertical diode: cathode on sw rail, anode strictly below on ground.
      expect(swPin.y).toBeLessThan(gndPin.y - GRID);
      // x-coordinates coincide (pins stacked, not side by side).
      expect(swPin.x).toBe(gndPin.x);
    });

    it('buck converter: sw bus does not pass through L1 inductor body', () => {
      // D1 (freewheel) sits on the sw node, same as M1.drain and L1.sw. If D1
      // is placed to the RIGHT of L1, the horizontal sw bus connecting them
      // runs visually through L1's body at the top rail — the inductor looks
      // like "a line is going through it." Canonical buck draws D1 between M1
      // and L1 so the bus stays on M1's side of L1.
      const circuit = makeCircuit(
        { type: 'V', id: 'Vin', name: 'Vin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 12 }, displayValue: 'DC 12' },
        { type: 'V', id: 'Vg', name: 'Vg', ports: [{ name: 'p', net: 'gate' }, { name: 'n', net: '0' }], params: { dc: 0 }, displayValue: 'PULSE' },
        { type: 'M', id: 'M1', name: 'M1', ports: [
          { name: 'drain', net: 'sw' }, { name: 'gate', net: 'gate' },
          { name: 'source', net: 'in' }, { name: 'bulk', net: '0' },
        ], params: { modelName: 'NMOD', channelType: 'n' }, displayValue: 'NMOD' },
        { type: 'D', id: 'D1', name: 'D1', ports: [{ name: 'p', net: '0' }, { name: 'n', net: 'sw' }], params: { modelName: 'DMOD' }, displayValue: 'DMOD' },
        { type: 'L', id: 'L1', name: 'L1', ports: [{ name: 'p', net: 'sw' }, { name: 'n', net: 'out' }], params: { inductance: 100e-6 }, displayValue: '100u' },
        { type: 'C', id: 'C1', name: 'C1', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { capacitance: 100e-6 }, displayValue: '100u' },
        { type: 'R', id: 'Rload', name: 'Rload', ports: [{ name: 'p', net: 'out' }, { name: 'n', net: '0' }], params: { resistance: 10 }, displayValue: '10' },
      );
      const layout = layoutSchematic(circuit);
      const l1 = layout.components.find(c => c.component.id === 'L1')!;
      const l1SwPin = l1.pins.find(p => p.net === 'sw')!;
      const l1OutPin = l1.pins.find(p => p.net === 'out')!;
      const l1X1 = Math.min(l1SwPin.x, l1OutPin.x);
      const l1X2 = Math.max(l1SwPin.x, l1OutPin.x);
      const swWire = layout.wires.find(w => w.net === 'sw')!;
      for (const s of swWire.segments) {
        if (s.y1 !== s.y2) continue; // horizontal only
        const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
        // Segments must not cross INTO L1's x-range (touching a pin is OK:
        // xMax <= l1X1 or xMin >= l1X2).
        const strictOverlap = xMax > l1X1 && xMin < l1X2;
        expect(strictOverlap, `sw bus segment [${xMin},${xMax}] crosses L1 body [${l1X1},${l1X2}]`).toBe(false);
      }
    });

    it('common-source amp: RD aligns horizontally with M1 drain (straight line)', () => {
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
      const rd = layout.components.find(c => c.component.id === 'RD')!;
      const m1 = layout.components.find(c => c.component.id === 'M1')!;
      const rdOut = rd.pins.find(p => p.net === 'out')!;
      const m1Drain = m1.pins.find(p => p.net === 'out')!;
      // RD's bottom pin should sit directly above M1's drain — no horizontal
      // jog in the out net between them.
      expect(rdOut.x).toBe(m1Drain.x);
    });

    it('common-source amp: RD draws vertically between vdd rail and out', () => {
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
      const rd = layout.components.find(c => c.component.id === 'RD')!;
      const vddPin = rd.pins.find(p => p.net === 'vdd')!;
      const outPin = rd.pins.find(p => p.net === 'out')!;
      expect(vddPin.y).toBeLessThan(outPin.y - GRID);
    });

    it('inverting amp: Rin lies on the main signal rail (straight line into opamp -in)', () => {
      // Rin connects V1+ to the opamp's -in. With the feedback resistor Rf
      // closing the loop from -in back to out, Rin must stay on the same
      // horizontal rail as V1 and the opamp's -in — no detour above or below.
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 0.1 }, displayValue: 'PULSE' },
        { type: 'R', id: 'Rin', name: 'Rin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'nm' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'R', id: 'Rf', name: 'Rf', ports: [{ name: 'p', net: 'nm' }, { name: 'n', net: 'out' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'E', id: 'E1', name: 'E1', ports: [
          { name: 'ctrlP', net: '0' }, { name: 'ctrlN', net: 'nm' },
          { name: 'outP',  net: 'out' }, { name: 'outN',  net: '0' },
        ], params: { gain: 1e6 }, displayValue: '1e6' },
      );
      const layout = layoutSchematic(circuit);
      const v1 = layout.components.find(c => c.component.id === 'V1')!;
      const rin = layout.components.find(c => c.component.id === 'Rin')!;
      const e1 = layout.components.find(c => c.component.id === 'E1')!;
      const v1InPin = v1.pins.find(p => p.net === 'in')!;
      const rinInPin = rin.pins.find(p => p.net === 'in')!;
      const rinNmPin = rin.pins.find(p => p.net === 'nm')!;
      const e1NmPin = e1.pins.find(p => p.net === 'nm')!;
      // V1+ and Rin's in pin on same rail
      expect(Math.abs(v1InPin.y - rinInPin.y)).toBeLessThanOrEqual(GRID);
      // Rin's two pins on same Y (horizontal body)
      expect(rinInPin.y).toBe(rinNmPin.y);
      // Rin's nm pin and opamp's -in pin on the same rail (± one grid for the
      // opamp lead offset we added earlier).
      expect(Math.abs(rinNmPin.y - e1NmPin.y)).toBeLessThanOrEqual(GRID * 2);
    });

    it('inverting amp: Rf is elevated as a feedback loop above the rail', () => {
      const circuit = makeCircuit(
        { type: 'V', id: 'V1', name: 'V1', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: '0' }], params: { dc: 0.1 }, displayValue: 'PULSE' },
        { type: 'R', id: 'Rin', name: 'Rin', ports: [{ name: 'p', net: 'in' }, { name: 'n', net: 'nm' }], params: { resistance: 1000 }, displayValue: '1k' },
        { type: 'R', id: 'Rf', name: 'Rf', ports: [{ name: 'p', net: 'nm' }, { name: 'n', net: 'out' }], params: { resistance: 10000 }, displayValue: '10k' },
        { type: 'E', id: 'E1', name: 'E1', ports: [
          { name: 'ctrlP', net: '0' }, { name: 'ctrlN', net: 'nm' },
          { name: 'outP',  net: 'out' }, { name: 'outN',  net: '0' },
        ], params: { gain: 1e6 }, displayValue: '1e6' },
      );
      const layout = layoutSchematic(circuit);
      const rin = layout.components.find(c => c.component.id === 'Rin')!;
      const rf = layout.components.find(c => c.component.id === 'Rf')!;
      expect(rf.pins[0].y).toBeLessThan(rin.pins[0].y - GRID * 2);
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
