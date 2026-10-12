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

function interpolate(time: readonly number[], values: readonly number[], t: number): number {
  let lo = 0;
  while (lo < time.length - 2 && time[lo + 1] < t) lo++;
  const f = (t - time[lo]) / (time[lo + 1] - time[lo]);
  return values[lo] + f * (values[lo + 1] - values[lo]);
}

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

  it('MES level 1 inverse mode (vds < 0) matches ngspice-47 (authored-mes-inverse.cir)', async () => {
    // .dc vds -2 2 0.02 vgs -1 0.4 0.2: point = 201 * vgsIndex + vdsIndex.
    // vds <= -1 is the saturated inverse branch (-vds >= 3/ALPHA), -1 < vds < 0
    // the linear inverse branch; the vds > 0 points are normal mode.
    // [point, vds, ngspice-47 i(vds)]
    const reference: [number, number, number][] = [
      [25, -1.5, 0.007656660456], [50, -1, 0.004277784096], [75, -0.5, 0.001450863567],
      [95, -0.1, 9.529436353e-05], [150, 1, -1.751350735e-04],
      [628, -1.5, 0.1015236433], [653, -1, 0.008115802663], [678, -0.5, 0.003984270302],
      [698, -0.1, 0.0006489076815], [753, 1, -2.163980772e-03],
      [1502, -0.1, 0.001661416597], [1607, 2, -7.120755717e-03],
    ];
    const sweep = (await simulate(fixture('authored-mes-inverse.cir'))).dcSweep!;
    const vds = [...sweep.sweepValues];
    const ids = [...sweep.current('vds')];
    expect(ids).toHaveLength(1608);
    for (const [index, drive, expected] of reference) {
      expect(vds[index]).toBeCloseTo(drive, 9);
      expect(Math.abs(ids[index] - expected), `point ${index}: ${ids[index]} vs ${expected}`)
        .toBeLessThanOrEqual(5e-4 * Math.abs(expected) + 1e-12);
    }
  });

  it('MES level 1 gate charge in transient matches ngspice-47 (authored-mes-tran.cir)', async () => {
    // [time, ngspice-47 v(d), ngspice-47 v(gi)] at ngspice output timepoints;
    // spice-ts is linearly interpolated (its accepted timepoints differ).
    const reference: [number, number, number][] = [
      [2e-09, 2.394013547, -0.320055715], [2.525e-09, 0.3865663456, -0.08356769049],
      [3.025e-09, 0.2535828696, -0.008299032411], [4.025e-09, 0.2424055003, -7.459715325e-05],
      [6.025e-09, 0.2423058631, -5.996026779e-09], [8.005e-09, 0.7982544102, -1.882243794],
      [9.025e-09, 2.568212677, -1.978321736], [1.0025e-08, 2.911751773, -1.995570786],
      [1.2025e-08, 2.996307182, -1.999814669], [1.5025e-08, 0.2535814704, -0.008298020694],
      [2e-08, 0.7852313565, -1.876078688], [2.5e-08, 2.999213913, -1.999960549],
      [2.9025e-08, 0.2423067501, -6.701485771e-07],
    ];
    const tran = (await simulate(fixture('authored-mes-tran.cir'))).transient!;
    const time = [...tran.time];
    const vd = [...tran.voltage('d')];
    const vgi = [...tran.voltage('gi')];
    for (const [t, drain, gate] of reference) {
      // Edges move ~1 mV per ps of timestep placement; 2.5 mV is < 0.1 % of
      // the 3 V swing (benchmark worst over all 638 points: 0.18 % of peak).
      expect(Math.abs(interpolate(time, vd, t) - drain), `v(d) at ${t}`).toBeLessThanOrEqual(2.5e-3);
      expect(Math.abs(interpolate(time, vgi, t) - gate), `v(gi) at ${t}`).toBeLessThanOrEqual(2.5e-3);
    }
    // After the gate step, v(gi) relaxes through RG = 50 ohm into the Statz
    // gate charge: the 4.025 ns -> 6.025 ns decay is set by qgs/qgd alone.
    const decay = (t0: number, t1: number) =>
      Math.log(interpolate(time, vgi, t0) / interpolate(time, vgi, t1));
    const ngspiceDecay = Math.log(-7.459715325e-05 / -5.996026779e-09);
    expect(Math.abs(decay(4.025e-9, 6.025e-9) / ngspiceDecay - 1)).toBeLessThanOrEqual(0.01);
    // Without CGS/CGD the gate node follows the source through RG with no
    // memory, so the charge path is what produces that tail.
    const chargeless = (await simulate(fixture('authored-mes-tran.cir').replace('cgs=1p cgd=0.3p', 'cgs=0 cgd=0')))
      .transient!;
    expect(Math.abs(interpolate([...chargeless.time], [...chargeless.voltage('gi')], 4.025e-9)))
      .toBeLessThan(1e-9);
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
