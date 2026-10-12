import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';
import { resolveZModel } from './devices/z-device.js';

/**
 * Issue #500: the corpus-f MESFET/HFET decks (byte-identical ngspice
 * `tests/hfet`, `tests/mes`, `tests/mesa` decks) and project-authored decks
 * for the paths they do not reach, against ngspice-47 on the same bytes.
 * Reference values: `ngspice -b` with `wrdata` (numdgt=15) on the fixture
 * plus a run/wrdata control block; see benchmarks/mesfet-hfet-500/compare.ts,
 * which compares every point.
 */
const fixture = (name: string): string => readFileSync(
  new URL(`../../../benchmarks/mesfet-hfet-500/fixtures/${name}`, import.meta.url), 'utf8');

type Probe = { kind: 'dc-current'; source: string } | { kind: 'dc-voltage'; node: string } | { kind: 'ac-voltage'; node: string };

// [point index, ngspice-47 value]; AC values are |V|.
const CASES: [string, string, Probe, [number, number][]][] = [
  ['HFET1 RDI/RSI accepted (tests/hfet/id_vgs.cir)', 'hfet-id_vgs.cir', { kind: 'dc-current', source: 'vds' },
    [[0, 3.772774081e-11], [25, -0.0001459646571], [50, -0.0001687468672], [75, -0.0001892773869], [100, -0.0002108007504]]],
  ['HFET1 nonzero RDI/RSI (authored)', 'authored-hfet-rsi.cir', { kind: 'dc-current', source: 'vds' },
    [[0, 0], [51, 2.935844333e-11], [102, 4.309590973e-11], [153, 4.744608088e-11], [203, -0.0008649254136]]],
  ['MES level 1 with AREA (tests/mes/subth.cir)', 'mes-subth.cir', { kind: 'dc-current', source: 'vids' },
    [[0, 3.114000031e-12], [15, 2.364000451e-12], [30, 1.614000027e-12], [45, 0.0001261383832], [60, 0.0004575371475]]],
  ['MESA level 2 gate resistance RG (tests/mesa/mesa13.cir)', 'mesa-mesa13.cir', { kind: 'dc-current', source: 'vig' },
    [[0, -4.970431182e-07], [17, -9.591920874e-08], [34, -1.582315502e-08], [51, -1.734858447e-09], [68, 0.0007324694118]]],
  ['MESA level 2 instance TS/TD (tests/mesa/mesa15.cir)', 'mesa-mesa15.cir', { kind: 'dc-current', source: 'vids' },
    [[0, 0.004124855858], [15, 0.001998695306], [30, 0.0008608955067], [45, 0.0004903921407], [60, 0.000493913286]]],
  ['MESA level 3 (tests/mesa/mesa21.cir)', 'mesa-mesa21.cir', { kind: 'dc-current', source: 'vids' },
    [[0, 9.264650927e-08], [101, 0.00944403007], [202, 0.02044538513], [303, 0.03611904619], [404, 0.05677727533]]],
  ['MESA level 2 RI/RF (tests/mesa/mesinv.cir)', 'mesa-mesinv.cir', { kind: 'dc-voltage', node: '70' },
    [[0, 0.5924319821], [25, 0.5884606884], [50, 0.5340240361], [75, 0.2858431665], [100, 0.4818486062]]],
  ['MESA level 2 DELFO/FLO/TF/LAMBDAHF dispersion (tests/mesa/mesgout.cir)', 'mesa-mesgout.cir', { kind: 'ac-voltage', node: '3' },
    [[0, 0.0008965907949], [22, 0.0009242703586], [45, 0.001796858372], [68, 0.001796864509], [90, 0.001796864509]]],
  ['MESA level 2 small signal without the ALPHA gm term (authored)', 'authored-mesa-alpha-ac.cir', { kind: 'ac-voltage', node: 'd' },
    [[0, 3.068056055], [20, 3.068056055], [40, 3.068056034], [60, 3.067846627], [80, 2.080467902]]],
  ['NMF without LEVEL is MES level 1, small signal (authored)', 'authored-mes-ac.cir', { kind: 'ac-voltage', node: 'd' },
    [[0, 1.171165708], [12, 1.170803939], [25, 1.058926153], [38, 0.3157134518], [50, 0.09249653189]]],
];

describe('issue #500: NMF/NHFET Z-card levels vs ngspice-47', () => {
  it.each(CASES)('%s', async (_label, name, probe, reference) => {
    const result = await simulate(fixture(name));
    const values = probe.kind === 'dc-current'
      ? [...result.dcSweep!.current(probe.source)]
      : probe.kind === 'dc-voltage'
        ? [...result.dcSweep!.voltage(probe.node)]
        : result.ac!.voltage(probe.node).map(point => point.magnitude);
    const peak = Math.max(...reference.map(([, value]) => Math.abs(value)));
    for (const [index, expected] of reference) {
      // Newton converges each point to RELTOL = 1e-3 in both engines; the
      // floor covers sub-picoampere leakage beside a large peak.
      const tolerance = 5e-4 * Math.abs(expected) + 1e-6 * peak;
      expect(Math.abs(values[index] - expected), `point ${index}: ${values[index]} vs ${expected}`)
        .toBeLessThanOrEqual(tolerance);
    }
  }, 60_000);

  it('makes the mesgout output conductance frequency dependent (LAMBDA=0 below FL, LAMBDAHF above)', async () => {
    const dispersive = (await simulate(fixture('mesa-mesgout.cir'))).ac!.voltage('3');
    const flat = (await simulate(fixture('mesa-mesgout.cir').replace('+ delfo=5', '+ delfo=0'))).ac!.voltage('3');
    expect(dispersive[0].magnitude / dispersive[90].magnitude).toBeCloseTo(0.0008965907949 / 0.001796864509, 6);
    expect(flat[90].magnitude).toBeCloseTo(flat[0].magnitude, 12);
  });

  it('selects the Z-card family by LEVEL as ngspice INPdomodel does', () => {
    const kind = (type: string, LEVEL?: number) => resolveZModel({
      name: 'm', type, params: LEVEL === undefined ? {} : { LEVEL },
    }).kind;
    expect(kind('NMF')).toBe('mes');
    expect(kind('NMF', 1)).toBe('mes');
    expect(kind('NHFET')).toBe('mes');
    expect(kind('NMF', 2)).toBe('mesa');
    expect(kind('NMF', 3)).toBe('mesa');
    expect(kind('NHFET', 5)).toBe('hfet');
    expect(() => kind('NMF', 4)).toThrow('Unsupported NMF model level: 4');
    expect(() => kind('NHFET', 6)).toThrow('Unsupported NHFET model level: 6');
  });

  it('rejects instance parameters a family does not define', async () => {
    const deck = (instance: string, model: string) => [
      'z params', 'vd d 0 1', 'vg g 0 0', `z1 d g 0 m ${instance}`, `.model m ${model}`, '.op', '.end',
    ].join('\n');
    await expect(simulate(deck('l=1u', 'nmf level=1'))).rejects.toThrow("Unsupported NMF level-1 instance parameter: 'L'");
    await expect(simulate(deck('area=2', 'nmf level=2'))).rejects.toThrow("Unsupported NMF MESA instance parameter: 'AREA'");
    await expect(simulate(deck('ts=100', 'nhfet level=5'))).rejects.toThrow("Unsupported NHFET level-5 instance parameter: 'TS'");
  });
});
