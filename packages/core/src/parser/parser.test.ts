import { describe, it, expect } from 'vitest';
import { parse, parseAsync } from './index.js';

describe('SPICE netlist parser', () => {
  it('parses a simple voltage divider', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(3);
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.branchCount).toBe(1);
    expect(compiled.analyses).toEqual([{ type: 'op' }]);
  });

  it('parses engineering notation (k, M, u, n, p, f, m)', () => {
    const ckt = parse(`
      R1 1 0 4.7k
      R2 1 0 1M
      C1 1 0 100n
      R3 1 0 2.2m
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(4);
  });

  it('parses transient analysis command', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .tran 1n 10u
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({ type: 'tran', timestep: 1e-9, stopTime: 10e-6 });
  });

  it('parses AC analysis command', () => {
    const ckt = parse(`
      V1 1 0 AC 1 0
      R1 1 0 1k
      .ac dec 10 1 1G
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({
      type: 'ac', variation: 'dec', points: 10, startFreq: 1, stopFreq: 1e9,
    });
  });

  it('parses PULSE source', () => {
    const ckt = parse(`
      V1 1 0 PULSE(0 5 0 1n 1n 5u 10u)
      R1 1 0 1k
      .tran 1n 20u
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('parses SIN source', () => {
    const ckt = parse(`
      V1 1 0 SIN(0 1 1k)
      R1 1 0 1k
      .tran 1u 2m
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('handles comments and blank lines', () => {
    const ckt = parse(`
      * This is a comment
      V1 1 0 DC 5

      R1 1 0 1k
      ; Another comment style
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('handles line continuations with +', () => {
    const ckt = parse(`
      V1 1 0
      + DC 5
      R1 1 0 1k
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('parses .model card', () => {
    const ckt = parse(`
      .model DMOD D(IS=1e-14 N=1.05 BV=100)
      V1 1 0 DC 1
      D1 1 0 DMOD
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.models.has('DMOD')).toBe(true);
    expect(compiled.models.get('DMOD')!.params.IS).toBeCloseTo(1e-14);
  });

  it('parses DC sweep', () => {
    const ckt = parse(`
      V1 1 0 DC 0
      R1 1 0 1k
      .dc V1 0 5 0.1
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({
      type: 'dc', source: 'V1', start: 0, stop: 5, step: 0.1,
    });
  });

  it('is case-insensitive for keywords', () => {
    const ckt = parse(`
      v1 1 0 dc 5
      r1 1 0 1K
      .OP
      .END
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  describe('.subckt parsing', () => {
    it('parses a simple subcircuit definition', () => {
      const ckt = parse(`
        .subckt inv in out vdd vss
        M1 out in vdd vdd PMOD
        M2 out in vss vss NMOD
        .ends inv
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.subcircuits.has('INV')).toBe(true);
      const sub = compiled.subcircuits.get('INV')!;
      expect(sub.ports).toEqual(['in', 'out', 'vdd', 'vss']);
      expect(sub.body).toHaveLength(2);
    });

    it('parses subcircuit with default parameters', () => {
      const ckt = parse(`
        .subckt inv in out vdd vss W=1u L=100n
        M1 out in vdd vdd PMOD W={W}
        .ends inv
        .op
      `);
      const compiled = ckt.compile();
      const sub = compiled.subcircuits.get('INV')!;
      expect(sub.params.W).toBeCloseTo(1e-6);
      expect(sub.params.L).toBeCloseTo(100e-9);
    });

    it('parses .ends without name', () => {
      const ckt = parse(`
        .subckt buf in out
        R1 in out 1k
        .ends
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.subcircuits.has('BUF')).toBe(true);
    });
  });

  describe('X device parsing', () => {
    it('parses a subcircuit instance', () => {
      const ckt = parse(`
        .subckt res2 a b
        R1 a b 1k
        .ends res2
        X1 1 0 res2
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.devices.length).toBeGreaterThanOrEqual(1);
    });

    it('parses X device with parameter overrides', () => {
      const ckt = parse(`
        .subckt myres a b R=1k
        R1 a b {R}
        .ends myres
        X1 1 0 myres R=2k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.devices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('.include/.lib guards in sync parse', () => {
    it('throws ParseError on .include', () => {
      expect(() => parse(`.include 'models.lib'\n.op`)).toThrow('async');
    });

    it('throws ParseError on .lib with file', () => {
      expect(() => parse(`.lib 'models.lib' TT\n.op`)).toThrow('async');
    });
  });

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
      expect(compiled.branchCount).toBe(1);
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
      expect(compiled.branchCount).toBe(2);
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
      expect(compiled.branchCount).toBe(3);
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

  describe('parseAsync', () => {
    it('parses a simple netlist without resolver', async () => {
      const ckt = await parseAsync(`
        V1 1 0 DC 5
        R1 1 0 1k
        .op
      `);
      const compiled = ckt.compile();
      expect(compiled.devices).toHaveLength(2);
    });

    it('resolves .include with resolver', async () => {
      const resolver = async (path: string) => {
        if (path === 'models.lib') return '.model DMOD D(IS=1e-14)';
        throw new Error(`Unknown: ${path}`);
      };
      const ckt = await parseAsync(`
        .include 'models.lib'
        V1 1 0 DC 0.7
        D1 1 0 DMOD
        .op
      `, resolver);
      const compiled = ckt.compile();
      expect(compiled.models.has('DMOD')).toBe(true);
    });
  });
});
