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

  describe.each(['NPN', 'PNP'] as const)('%s external-terminal IC defaults', (polarity) => {
    const sign = polarity === 'NPN' ? 1 : -1;
    const withResistance = (ic: string, uic = true) => deck(ic, uic, polarity)
      .replace('Q1 c b 0 QMOD', 'Q1 c b e QMOD')
      .replace('CJC=1n)', 'CJC=1n RC=100 RB=50 RE=100)')
      .replace('.tran', `REX e 0 1k\n.ic v(c)=${sign} v(b)=${sign * 0.2} v(e)=${sign * 0.1}\n.tran`);

    it.each(['', `IC=${sign * 0.1}`])('uses external node IC for omitted components (%s)', async (ic) => {
      const implicit = await simulate(withResistance(ic));
      const explicit = await simulate(withResistance(`IC=${sign * 0.1},${sign * 0.9}`));
      expect(implicit.transient!.time).toEqual(explicit.transient!.time);
      for (const node of ['c', 'b', 'e']) {
        expect(implicit.transient!.voltage(node)).toEqual(explicit.transient!.voltage(node));
      }
    });

    it('preserves the RC-only review reproduction', async () => {
      const input = deck(`IC=${sign * 0.2}`, true, polarity)
        .replace('CJC=1n)', 'CJC=1n RC=100)')
        .replace('.tran', `.ic v(c)=${sign}\n.tran`);
      const result = await simulate(input);
      // ngspice-47, identical deck: t=2ps, v(c)=+/-1.090913V.
      expect(result.transient!.time[0]).toBeCloseTo(2e-12, 20);
      expect(result.transient!.voltage('c')[0]).toBeCloseTo(sign * 1.090913, 6);
    });

    it('ignores instance IC without UIC with RC/RB/RE present', async () => {
      const ordinary = await simulate(withResistance('', false));
      const explicit = await simulate(withResistance(`IC=${sign * 0.1},${sign * 0.9}`, false));
      expect(explicit.transient!.time).toEqual(ordinary.transient!.time);
      for (const node of ['c', 'b', 'e']) {
        expect(explicit.transient!.voltage(node)).toEqual(ordinary.transient!.voltage(node));
      }
    });
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
    // ngspice-47 on the identical NPN deck (.print tran v(b)) gives
    // t=2e-12, v(b)=2.000018e-1; the PNP deck is its sign mirror.
    expect(charged.transient!.time[0]).toBeCloseTo(2e-12, 20);
    expect(charged.transient!.voltage('b')[0]).toBeCloseTo(sign * 0.2000018, 6);
  });
});
