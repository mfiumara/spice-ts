import { describe, it, expect } from 'vitest';
import { parse, parseAsync } from './index.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';

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

  it('parses capacitor .model values and instance parameters', () => {
    const ckt = parse(`
      .model CSTD C(CAP=1n TC1=0.001 TC2=0.0001)
      C1 1 0 CSTD M=2 SCALE=0.5 TEMP=37
      .op
      .end
    `);
    const compiled = ckt.compile();
    const cap = compiled.devices.find(d => d.name === 'C1');

    expect(cap).toBeInstanceOf(Capacitor);
    expect((cap as Capacitor).capacitance).toBeCloseTo(1.02e-9);
  });

  it('parses semiconductor capacitor geometry from model and instance dimensions', () => {
    const ckt = parse(`
      .model CMOD C(CJ=5e-5 CJSW=2e-11 DEFW=2u)
      C1 1 0 CMOD L=10u W=1u
      .op
      .end
    `);
    const compiled = ckt.compile();
    const cap = compiled.devices.find(d => d.name === 'C1');

    expect(cap).toBeInstanceOf(Capacitor);
    expect((cap as Capacitor).capacitance).toBeCloseTo(9.4e-16);
  });

  it('parses capacitor values with separated physical units', () => {
    const ckt = parse(`
      C1 1 0 1 uF
      .op
      .end
    `);
    const compiled = ckt.compile();
    const cap = compiled.devices.find(d => d.name === 'C1');

    expect(cap).toBeInstanceOf(Capacitor);
    expect((cap as Capacitor).capacitance).toBeCloseTo(1e-6);
  });

  it('parses capacitor parasitic model parameters', () => {
    const ckt = parse(`
      .model CLOSS C(CAP=1u ESR=250m ESL=10n RLEAK=1meg)
      C1 1 0 CLOSS
      .op
      .end
    `);
    const compiled = ckt.compile();

    expect(compiled.devices.map(d => d.name)).toEqual([
      'C1.RLEAK',
      'C1.ESL',
      'C1.ESR',
      'C1',
    ]);
    expect(compiled.branchNames).toEqual(['C1.ESL']);
  });

  it('parses inductor .model values and multiplicity', () => {
    const ckt = parse(`
      .model LSTD L(IND=10u TC1=0.001)
      L1 1 0 LSTD M=2 SCALE=0.5 TEMP=37
      .op
      .end
    `);
    const compiled = ckt.compile();
    const ind = compiled.devices.find(d => d.name === 'L1');

    expect(ind).toBeInstanceOf(Inductor);
    expect((ind as Inductor).inductance).toBeCloseTo(2.525e-6);
  });

  it('parses geometric inductor models', () => {
    const ckt = parse(`
      .model LGEOM L(LENGTH=10u CSECT=4p NT=20 MU=2)
      L1 1 0 LGEOM
      .op
      .end
    `);
    const compiled = ckt.compile();
    const ind = compiled.devices.find(d => d.name === 'L1');

    expect(ind).toBeInstanceOf(Inductor);
    expect((ind as Inductor).inductance).toBeCloseTo(4.021238596594944e-10);
  });

  it('parses inductor parasitic model parameters', () => {
    const ckt = parse(`
      .model LLOSS L(IND=10u RSER=400m RPAR=2k CPAR=3p)
      L1 1 0 LLOSS
      .op
      .end
    `);
    const compiled = ckt.compile();

    expect(compiled.devices.map(d => d.name)).toEqual([
      'L1.RPAR',
      'L1.CPAR',
      'L1.RSER',
      'L1',
    ]);
    expect(compiled.branchNames).toEqual(['L1']);
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
