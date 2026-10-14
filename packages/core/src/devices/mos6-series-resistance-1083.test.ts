import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { Resistor } from './resistor.js';

const deck = (model: string, instance = '') => `MOS6 series resistance
VDD vdd 0 5
VG g 0 DC 3 AC 1
RL vdd d 1k
M1 d g 0 0 N W=10u L=2u ${instance}
.MODEL N NMOS (LEVEL=6 VTO=0.8 KC=50u GAMMA=0.5 PHI=0.6 LAMBDA0=0.02 TOX=25n CGSO=1n CGDO=1n CBD=1p CBS=1p ${model})
.OP
.AC LIN 1 1MEG 1MEG
.END
`;

const cases = [
  { name: 'direct takes precedence and scales with M', model: 'RD=50 RS=30 RSH=500', instance: 'NRD=2 NRS=3 M=2', drain: 25, source: 15 },
  { name: 'sheet and squares scale with M', model: 'RSH=50', instance: 'NRD=2 NRS=3 M=2', drain: 50, source: 75 },
  { name: 'omitted squares suppress prime nodes in mos6set.c', model: 'RSH=50', instance: '', drain: 0, source: 0 },
  { name: 'explicit zero without sheet is a short', model: 'RD=0 RS=0 RSH=0', instance: '', drain: 0, source: 0 },
  { name: 'zero squares suppress prime nodes', model: 'RSH=50', instance: 'NRD=0 NRS=0', drain: 0, source: 0 },
  { name: 'explicit zero drain with sheet is open', model: 'RD=0 RS=30 RSH=50', instance: 'NRD=2 NRS=3', drain: Infinity, source: 30 },
  { name: 'explicit zero source with sheet is open', model: 'RD=50 RS=0 RSH=50', instance: 'NRD=2 NRS=3', drain: 50, source: Infinity },
];

function explicit(instance: string, drain: number, source: number): string {
  let input = deck('', instance);
  const resistors: string[] = [];
  if (drain !== 0) {
    input = input.replace('M1 d g 0 0', 'M1 dp g 0 0');
    if (Number.isFinite(drain)) resistors.push(`RD d dp ${drain}`);
  }
  if (source !== 0) {
    input = input.replace('g 0 0 N', 'g sp 0 N');
    if (Number.isFinite(source)) resistors.push(`RS sp 0 ${source}`);
  }
  return input.replace('RL vdd d 1k', `RL vdd d 1k\n${resistors.join('\n')}`);
}

const close = (actual: number, expected: number, floor = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThan(2e-4 * Math.abs(expected) + floor);

describe('MOS6 series prime terminals (#1083)', () => {
  it.each(cases.map((c, index) => ({ ...c, index })))('$name matches ngspice-47 OP voltage and current', async c => {
    // ngspice-47 -b -r, SPICE_ASCIIRAWFILE=1, identical deck with only
    // .AC removed. The AC tests below compare explicit resistor expansion.
    const reference = [
      [3.829257694131824, -1.170742305868176e-3],
      [3.877169038120883, -1.122830961879117e-3],
      [4.401582587130006, -5.984174128699937e-4],
      [4.401582587129988, -5.984174128700124e-4],
      [4.401582587130006, -5.984174128699937e-4],
      [5, 0],
      [4.999999993169069, -6.830931376100579e-12],
    ];
    const actual = await simulate(deck(c.model, c.instance).replace('.AC LIN 1 1MEG 1MEG\n', ''));
    close(actual.dc!.voltage('d'), reference[c.index][0]);
    close(actual.dc!.current('VDD'), reference[c.index][1], 1e-11);
  });

  it.each(cases)('$name matches explicit external resistors in OP and AC', async c => {
    const actual = await simulate(deck(c.model, c.instance));
    const expected = await simulate(explicit(c.instance, c.drain, c.source));
    close(actual.dc!.voltage('d'), expected.dc!.voltage('d'));
    close(actual.dc!.current('VDD'), expected.dc!.current('VDD'), 1e-11);
    const a = actual.ac!.voltage('d')[0];
    const e = expected.ac!.voltage('d')[0];
    for (const component of [Math.cos, Math.sin]) {
      close(a.magnitude * component(a.phase * Math.PI / 180), e.magnitude * component(e.phase * Math.PI / 180), 1e-6);
    }
  });

  it.each(cases)('$name creates only finite resistors and preserves prime/bulk nodes', c => {
    const compiled = parse(deck(c.model, c.instance)).compile();
    const resistors = compiled.devices.filter(d => d instanceof Resistor && d.name.startsWith('M1.'));
    expect(resistors).toHaveLength([c.drain, c.source].filter(r => r !== 0 && Number.isFinite(r)).length);
    const mos = compiled.devices.find(d => d.name === 'M1')!;
    expect(mos.nodes[0] === compiled.nodeNames.indexOf('d')).toBe(c.drain === 0);
    expect(mos.nodes[2]).toBe(c.source === 0 ? -1 : compiled.nodeNames.indexOf('M1.source'));
    expect(mos.nodes[3]).toBe(-1);
  });

  it('stamps transient charges behind the prime nodes like external resistors', async () => {
    const transient = (input: string) => input.replace('VG g 0 DC 3 AC 1', 'VG g 0 PULSE(0 3 2n 1n 1n 3n 8n)')
      .replace('.OP\n.AC LIN 1 1MEG 1MEG', '.TRAN 0.05n 10n');
    const c = cases[0];
    const actual = (await simulate(transient(deck(c.model, c.instance)))).transient!;
    const expected = (await simulate(transient(explicit(c.instance, c.drain, c.source)))).transient!;
    expect(actual.time).toEqual(expected.time);
    expect(actual.voltage('d')).toEqual(expected.voltage('d'));
    expect(actual.current('VDD')).toEqual(expected.current('VDD'));
  });

  it.each(['PMOS', 'inverse NMOS'])('preserves external bulk and series terminals for %s', async mode => {
    const c = cases[0];
    const transform = (input: string) => mode === 'PMOS'
      ? input.replace('vdd 0 5', 'vdd 0 -5').replace('DC 3', 'DC -3').replace('NMOS', 'PMOS').replace('VTO=0.8', 'VTO=-0.8')
      : input.replace('vdd 0 5', 'vdd 0 -1');
    const actual = await simulate(transform(deck(c.model, c.instance)));
    const expected = await simulate(transform(explicit(c.instance, c.drain, c.source)));
    close(actual.dc!.voltage('d'), expected.dc!.voltage('d'));
    close(actual.dc!.current('VDD'), expected.dc!.current('VDD'), 1e-11);
  });

  it('keeps an omitted bulk tied to the external source, not its prime node', () => {
    const compiled = parse(deck('RS=30').replace('M1 d g 0 0 N', 'M1 d g 0 N')).compile();
    const mos = compiled.devices.find(d => d.name === 'M1')!;
    expect(mos.nodes[2]).toBe(compiled.nodeNames.indexOf('M1.source'));
    expect(mos.nodes[3]).toBe(-1);
  });
});
