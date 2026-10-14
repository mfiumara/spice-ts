import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { Resistor } from './resistor.js';

// ngspice-47 `ngspice -b -r` on these exact decks (SPICE_ASCIIRAWFILE=1).
// mos2set.c makes prime nodes independently of mos2temp.c's given flags:
// explicit RD/RS=0 with nonzero RSH/squares leaves an open terminal.
const cases = [
  { name: 'direct', model: 'RD=50 RS=30 RSH=500', instance: 'NRD=2 NRS=3 M=2',
    voltage: 3.959157296986889, current: -1.040842703013111e-3,
    ac: [-9.353850417473404e-1, 5.086919295641509e-3], resistors: 2 },
  { name: 'sheet', model: 'RSH=50', instance: 'NRD=2 NRS=3 M=2',
    voltage: 4.026154838000959, current: -9.738451619990407e-4,
    ac: [-8.496161053030189e-1, 4.694737985842775e-3], resistors: 2 },
  { name: 'default-squares', model: 'RSH=50', instance: '',
    voltage: 4.479941507434456, current: -5.200584925655436e-4,
    ac: [-4.697393902799968e-1, 1.288971663008140e-3], resistors: 2 },
  { name: 'zero', model: 'RD=0 RS=0 RSH=0', instance: '',
    voltage: 4.463949137685076, current: -5.360508623149238e-4,
    ac: [-4.913295353986756e-1, 1.282098473037714e-3], resistors: 0 },
  { name: 'zero-squares', model: 'RSH=50', instance: 'NRD=0 NRS=0',
    voltage: 4.463949137685076, current: -5.360508623149238e-4,
    ac: [-4.913295353986756e-1, 1.282098473037714e-3], resistors: 0 },
  { name: 'open-drain', model: 'RD=0 RS=30 RSH=50', instance: 'NRD=2 NRS=3',
    voltage: 5, current: 0, ac: [0, 0], resistors: 1 },
  { name: 'open-source', model: 'RD=50 RS=0 RSH=50', instance: 'NRD=2 NRS=3',
    voltage: 4.999999993169182, current: -6.830817689262858e-12,
    ac: [-2.716840490255283e-5, 6.264885403697427e-5], resistors: 1 },
];
const deck = (name: string, model: string, instance: string) => `MOS2 series reference ${name}
VDD vdd 0 5
VG g 0 DC 3 AC 1
RL vdd d 1k
M1 d g 0 0 N W=10u L=2u ${instance}
.MODEL N NMOS (LEVEL=2 VTO=0.8 KP=50u GAMMA=0.5 PHI=0.6 LAMBDA=0.02 TOX=25n CGSO=1n CGDO=1n CBD=1p CBS=1p ${model})
.OP
.AC LIN 1 1MEG 1MEG
.END
`;
const close = (actual: number, expected: number, floor = 1e-9) =>
  expect(Math.abs(actual - expected)).toBeLessThan(2e-4 * Math.abs(expected) + floor);

describe('MOS2 series prime terminals (#982)', () => {
  it.each(cases)('$name matches ngspice-47 operating point and supply current', async c => {
    const result = await simulate(deck(c.name, c.model, c.instance));
    close(result.dc!.voltage('d'), c.voltage);
    close(result.dc!.current('VDD'), c.current, 1e-11);
  });

  it.each(cases)('$name matches ngspice-47 AC drain voltage', async c => {
    const result = await simulate(deck(c.name, c.model, c.instance));
    const point = result.ac!.voltage('d')[0];
    // Uniform ngspice default VNTOL floor, including near-zero open-terminal responses.
    const phase = point.phase * Math.PI / 180;
    close(point.magnitude * Math.cos(phase), c.ac[0], 1e-6);
    close(point.magnitude * Math.sin(phase), c.ac[1], 1e-6);
  });

  it.each(cases)('$name creates only the required linear series resistors', c => {
    const compiled = parse(deck(c.name, c.model, c.instance)).compile();
    const resistors = compiled.devices.filter(d => d instanceof Resistor && d.name.startsWith('M1.'));
    expect(resistors).toHaveLength(c.resistors);
  });

  it('matches ngspice-47 transient voltage and supply current behind RD/RS', async () => {
    const input = deck('direct', 'RD=50 RS=30 RSH=500', 'NRD=2 NRS=3 M=2')
      .replace('VG g 0 DC 3 AC 1', 'VG g 0 PULSE(0 3 2n 1n 1n 3n 8n)')
      .replace('.OP\n.AC LIN 1 1MEG 1MEG', '.TRAN 0.05n 10n');
    const result = (await simulate(input)).transient!;
    const samples = [
      [0, 4.999999994979996], [2e-9, 4.99999999498001],
      [2.5e-9, 5.0182792531992115], [3e-9, 4.780334625426376],
      [4e-9, 4.1963878689350915], [6.5e-9, 4.2086154561284195],
      [8e-9, 4.866543614257182], [10e-9, 4.989565822193103],
    ];
    const interpolate = (values: readonly number[], at: number) => {
      for (let i = 1; i < result.time.length; i++) {
        if (result.time[i] >= at) {
          const f = (at - result.time[i - 1]) / (result.time[i] - result.time[i - 1]);
          return values[i - 1] + f * (values[i] - values[i - 1]);
        }
      }
      throw new Error('reference time outside the transient grid');
    };
    for (const [at, voltage] of samples) {
      // Default Newton/time integration tolerances; no per-sample tuning.
      expect(Math.abs(interpolate(result.voltage('d'), at) - voltage)).toBeLessThan(1e-3);
      expect(Math.abs(interpolate(result.current('VDD'), at) - (voltage - 5) / 1000)).toBeLessThan(1e-6);
    }
  });

  it('stamps transient charges behind the prime nodes like explicit external resistors', async () => {
    const intrinsic = `MOS2 transient explicit reference
VDD vdd 0 5
VG g 0 PULSE(0 3 2n 1n 1n 3n 8n)
RL vdd d 1k
RD d dp 25
RS sp 0 15
M1 dp g sp 0 N W=10u L=2u M=2
.MODEL N NMOS (LEVEL=2 VTO=0.8 KP=50u GAMMA=0.5 PHI=0.6 LAMBDA=0.02 TOX=25n CGSO=1n CGDO=1n CBD=1p CBS=1p)
.TRAN 0.05n 10n
.END`;
    const series = intrinsic.replace('RD d dp 25\nRS sp 0 15\n', '')
      .replace('M1 dp g sp 0', 'M1 d g 0 0').replace('CBS=1p)', 'CBS=1p RD=50 RS=30 RSH=500)');
    const actual = (await simulate(series)).transient!;
    const expected = (await simulate(intrinsic)).transient!;
    expect(actual.time).toEqual(expected.time);
    for (const node of ['d', 'g']) expect(actual.voltage(node)).toEqual(expected.voltage(node));
    expect(actual.current('VDD')).toEqual(expected.current('VDD'));
  });
});
