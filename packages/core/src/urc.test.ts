import { describe, expect, it } from 'vitest';
import { parseTitleless as parse } from './parser/index.js';
import { ParseError } from './errors.js';
import { expandUrc } from './devices/urc.js';
import { simulate } from './simulate.js';

describe('ngspice URC expansion', () => {
  it('matches ngspice-47 DC and transient on identical explicit-N line decks', async () => {
    // Project-authored MIT probe. ngspice -n -b -r probe.raw probe.cir,
    // SPICE_ASCIIRAWFILE=1; linear interpolation at the listed times.
    const deck = 'V1 in 0 DC 1 PULSE(0 1 1n 100p 100p 20n 40n)\nU1 in out 0 UM L=2 N=3\nRL out 0 14\n.model UM URC(K=2 RPERL=7 CPERL=5p)\n.op\n.tran 10p 2n 0 10p';
    const result = await simulate(parse(deck));
    expect(result.dc!.voltage('out')).toBeCloseTo(.5, 12);
    const tran = result.transient!;
    const values = tran.voltage('out');
    for (const [time, expected] of [[1e-9, 0], [1.05e-9, .07575351718647234],
      [1.1e-9, .2776286413937931], [1.2e-9, .48502939265162803],
      [1.5e-9, .499996405604884], [2e-9, .4999999999966948]]) {
      const i = tran.time.findIndex(t => t >= time);
      expect(i).toBeGreaterThan(0);
      const fraction = (time - tran.time[i - 1]) / (tran.time[i] - tran.time[i - 1]);
      const actual = values[i - 1] + fraction * (values[i] - values[i - 1]);
      expect(Math.abs(actual - expected)).toBeLessThan(5e-5);
    }
  });

  it('matches urcsetup geometric sections and shared centre', () => {
    const { devices } = expandUrc('U1', ['in', 'out', 'ref'], { L: 2, LUMPS: 3 },
      { name: 'UM', type: 'URC', params: { K: 2, RPERL: 7, CPERL: 5 } });
    expect(devices.filter(d => d.type === 'R').map(d => d.value)).toEqual([1, 1, 2, 2, 4, 4]);
    expect(devices.filter(d => d.type === 'C').map(d => d.value)).toEqual([1, 1, 2, 2, 4]);
    expect(devices.find(d => d.name === 'U1:rlo3')?.nodes[1]).toBe(devices.find(d => d.name === 'U1:rhi3')?.nodes[0]);
    expect(devices.filter(d => d.type === 'C').every(d => d.nodes[1] === 'ref')).toBe(true);
  });

  it('selects the default number of lumps with the ngspice frequency formula', () => {
    const low = expandUrc('U1', ['in', 'out', '0'], { L: 1 }, { name: 'UM', type: 'URC', params: {} });
    expect(low.devices.filter(d => d.type === 'R')).toHaveLength(6);
    const high = expandUrc('U1', ['in', 'out', '0'], { L: .02 },
      { name: 'UM', type: 'URC', params: { RPERL: 1e5, CPERL: 1e-10, FMAX: 1e10 } });
    expect(high.devices.filter(d => d.type === 'R')).toHaveLength(16);
  });

  it('expands optional diode areas and model values', () => {
    const { devices, model } = expandUrc('U1', ['in', 'out', '0'], { L: 2, LUMPS: 3 },
      { name: 'UM', type: 'URC', params: { K: 2, RPERL: 7, CPERL: 5, ISPERL: 1e-12, RSPERL: 4 } });
    expect(devices.filter(d => d.type === 'D').map(d => d.params?.AREA)).toEqual([1, 1, 2, 2, 4]);
    expect(model).toMatchObject({ type: 'D', params: { CJO: 1, IS: 2e-13, RS: 24 } });
  });

  it('handles subcircuit-local models, spaced assignments and repeated compilation', () => {
    const circuit = parse('.subckt line a b ref\nU1 a b ref UM L = 2 LUMPS=3\n.model UM URC(K=2 RPERL=7 CPERL=5)\n.ends\nX1 in out 0 line\nV1 in 0 1\nR1 out 0 14\n.op');
    expect(circuit.compile().devices).toHaveLength(13);
    expect(circuit.compile().devices).toHaveLength(13);
    expect(parse(circuit.toNetlist()).compile().devices).toHaveLength(13);
  });

  it.each(['.model UM URC(FOO=1)', 'U1 a b 0 UM L=1 FOO=2\n.model UM URC',
    'U1 a b 0 UM L=1 LUMPS=1.5\n.model UM URC', 'U1 a b 0 UM L=0\n.model UM URC',
    '.model UM URC(K=1)', '.model UM URC(CPERL=-1)', '.model UM URC(K=xyz)',
    'U1 a b 0 UM L=1 N=3 LUMPS=4\n.model UM URC'])('rejects invalid/unsupported input structurally: %s', deck => {
    expect(() => parse(deck).compile()).toThrow(ParseError);
  });
});
