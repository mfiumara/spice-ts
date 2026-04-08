import { describe, it, expect } from 'vitest';
import { parse } from './index.js';

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
});
