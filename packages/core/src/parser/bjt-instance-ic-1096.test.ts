import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';
import { parseBJTInstance } from './bjt-parser.js';

const deck = (ic: string, uic: boolean, polarity: 'NPN' | 'PNP' = 'NPN') => `BJT instance IC regression #1096
VCC supply 0 ${polarity === 'NPN' ? 2 : -2}
RC supply c 1k
RB b 0 10k
Q1 c b 0 QMOD ${ic}
.model QMOD ${polarity}(IS=1e-14 BF=100 CJE=1n CJC=1n)
.tran 1n 20n ${uic ? 'uic' : ''}
.end
`;

describe('BJT instance IC (#1096)', () => {
  it.each(['IC=0.2,1', 'IC=0.2 1', 'ic = 200m, 1'])('parses %s through the netlist tokenizer', (ic) => {
    const compiled = parse(deck(ic, true)).compile();
    expect(compiled.devices.find(device => device.name === 'Q1')).toBeDefined();
  });

  it('returns signed IC components without treating them as area scaling', () => {
    expect(parseBJTInstance(['Q1', 'c', 'b', 'e', 'QMOD', 'IC=-0.2,-1', 'M=2'], 1))
      .toMatchObject({ params: { ICVBE: -0.2, ICVCE: -1, M: 2 } });
  });

  it('accepts a single IC component', () => {
    expect(parseBJTInstance(['Q1', 'c', 'b', 'e', 'QMOD', 'IC=0.2'], 1))
      .toMatchObject({ params: { ICVBE: 0.2 } });
  });

  it('preserves IC through netlist serialization and subcircuit expansion', async () => {
    const original = deck('IC=0.2,1', true);
    const serialized = parse(original).toNetlist();
    expect(serialized).toContain('IC=0.2,1');
    const expanded = original.replace('Q1 c b 0 QMOD IC=0.2,1', `.subckt stage c b e
Q1 c b e QMOD IC=0.2,1
.ends
X1 c b 0 stage`);
    const flat = await simulate(original);
    for (const netlist of [serialized, expanded]) {
      const result = await simulate(netlist);
      expect(result.transient!.voltage('b')[0]).toBeCloseTo(flat.transient!.voltage('b')[0], 12);
    }
  });

  it.each(['IC=', 'IC=bad', 'IC=0,1,2', 'IC=0 IC=1', 'IC=1e999'])('rejects malformed or duplicate %s', (ic) => {
    expect(() => parse(deck(ic, true))).toThrow();
  });

  it('explicitly rejects unsupported VBIC IC', () => {
    const vbic = deck('IC=0,0', true)
      .replace('IS=1e-14 BF=100 CJE=1n CJC=1n', 'LEVEL=4')
      .replace('.tran 1n 20n uic', '.op');
    expect(() => parse(vbic).compile())
      .toThrow("VBIC 'Q1' does not support instance IC");
  });

  it.each(['NPN', 'PNP'] as const)('ignores instance IC without UIC for %s', async (polarity) => {
    const sign = polarity === 'NPN' ? 1 : -1;
    const ordinary = await simulate(deck('', false, polarity));
    const withIC = await simulate(deck(`IC=${sign * 0.2},${sign}`, false, polarity));
    expect(withIC.transient!.time).toEqual(ordinary.transient!.time);
    expect(withIC.transient!.voltage('b')).toEqual(ordinary.transient!.voltage('b'));
  });

  it.each(['NPN', 'PNP'] as const)('initializes stored junction charge only with UIC for %s', async (polarity) => {
    const sign = polarity === 'NPN' ? 1 : -1;
    const zeroIC = await simulate(deck('IC=0,0', true, polarity));
    const charged = await simulate(deck(`IC=${sign * 0.2},${sign}`, true, polarity));
    // bjtload.c MODEINITJCT + MODETRANOP + MODEUIC initializes device-local
    // vbe=type*icVBE, vbc=type*(icVBE-icVCE), not global node constraints.
    // These charges must affect the first accepted point, not just parsing.
    expect(charged.transient!.time[0]).toBe(zeroIC.transient!.time[0]);
    expect(Math.abs(charged.transient!.voltage('b')[0] - zeroIC.transient!.voltage('b')[0]))
      .toBeGreaterThan(0.01);
  });
});
