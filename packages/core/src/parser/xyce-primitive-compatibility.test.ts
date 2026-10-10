import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse, parseTitleless } from './index.js';

const xyceFixtureRoot = resolve(
  import.meta.dirname,
  '../../../../benchmarks/corpus/xyce/fixtures',
);

function fixture(path: string): string {
  return readFileSync(resolve(xyceFixtureRoot, path), 'utf8');
}

const titleOnlyParseFailures = [
  ['resistor-dc', 'RESISTOR/resistor.cir'],
  ['resistor-level3-zero', 'RESISTOR/resistor_lv3.cir'],
  ['resistor-negative', 'RESISTOR/resistor_neg.cir'],
  ['vccs-dc', 'VCCS/vccs.cir'],
  ['vcvs-dc', 'VCVS/vcvs.cir'],
] as const;

describe('Xyce primitive parser compatibility', () => {
  const deviceShapedTitles = [
    'Rtitle in 0 1k',
    'Ctitle in 0 1u',
    'Ltitle in 0 1m',
    'Ktitle L1 L2 0.9',
    'Vtitle in 0 1',
    'Ititle in 0 1m',
    'Dtitle in 0 DMOD',
    'Qtitle c b e QMOD',
    'Mtitle d g s MMOD',
    'Xtitle in out divider',
    'Etitle out 0 in 0 1',
    'Gtitle out 0 in 0 1m',
    'Htitle out 0 V1 1',
    'Ftitle out 0 V1 1',
  ] as const;

  it.each(deviceShapedTitles)(
    'always treats the first physical line as a title: %s',
    title => {
      const compiled = parse(`${title}\nV1 in 0 1\nRload in 0 1k\n.op`).compile();

      expect(compiled.devices.map(device => device.name)).toEqual(['V1', 'Rload']);
    },
  );

  for (const [id, path] of titleOnlyParseFailures) {
    it(`accepts the standard SPICE title line in ${id}`, () => {
      expect(() => parse(fixture(path))).not.toThrow();
    });
  }

  it('matches ngspice-47 for diode-sidewall-dc instance geometry', async () => {
    const result = await simulate(fixture('DIODE/diode_with_sidewall.cir'));
    const current = result.dcSweep!.current('VMON');

    // ngspice-47, `ngspice -b diode_with_sidewall.cir`, after omitting the
    // Xyce-only N(D1:Cd) print expression: I(VMON)=1.638152e-1 A at VIN=1 V.
    expect(Math.abs(current.at(-1)! - 1.638152e-1) / 1.638152e-1)
      .toBeLessThan(0.004);
  });

  it('keeps unsupported diode instance fields explicit', () => {
    expect(() => parse('title\nD1 1 0 DMOD TEMP=50\n.model DMOD D'))
      .toThrow(/Unsupported diode parameter: 'TEMP=50'/);
  });

  it('accepts disabled NEWBPSTEPPING in the unchanged inductor fixture', () => {
    const input = readFileSync(resolve(xyceFixtureRoot, 'INDUCTOR/inductor.cir'));

    expect(createHash('sha256').update(input).digest('hex'))
      .toBe('a0a869d9fe3b04d3bbdc8abf9e8a89a9302a54ac5be9c97f446f06834a248b35');
    expect(() => parse(input.toString('utf8'))).not.toThrow();
  });

  it('keeps capacitor3 NEWLTE explicitly unsupported', () => {
    expect(() => parse(fixture('CAPACITOR/capacitor3.cir')))
      .toThrow(/Unsupported \.options TIMEINT field: 'newlte'/);
  });

  for (const [id, path] of [
    ['capacitor-rc-transient', 'CAPACITOR/capacitor.cir'],
    ['diode-transient', 'DIODE/diode.cir'],
    ['rlc-transient', 'RLC/rlc.cir'],
  ] as const) {
    it(`parses the supported TIMEINT fields in ${id}`, () => {
      expect(() => parse(fixture(path))).not.toThrow();
    });
  }

  it('parses the capacitor-rc-oscillator unparenthesized SIN source', () => {
    expect(() => parse(fixture('CAPACITOR/rc_osc.cir'))).not.toThrow();
  });

  for (const [id, path, points] of [
    ['capacitor-rc-oscillator', 'CAPACITOR/rc_osc.cir', 1780],
    ['diode-transient', 'DIODE/diode.cir', 101],
    ['rlc-transient', 'RLC/rlc.cir', 1002],
  ] as const) {
    it(`simulates unchanged ${id} with braced V/I output expressions`, async () => {
      const result = await simulate(fixture(path));

      expect(result.transient?.time).toHaveLength(points);
    });
  }

  it('matches Xyce breakdown-temperature endpoints in the unchanged diode fixture', async () => {
    const result = await simulate(fixture('DIODE/Level2_Temp_Dep_Breakdown.cir'));

    expect(result.steps!.map(step => [step.paramName, step.paramValue])).toEqual([
      ['TEMP', -55],
      ['TEMP', 25],
      ['TEMP', 72],
    ]);
    // Xyce_Regression gold output at t=0 and t=1 s for each TEMP step.
    const xyceEndpoints = [
      [7.15520836, 7.19459705],
      [7.22037320, 7.27880797],
      [7.25488881, 7.32593348],
    ];
    for (const [index, step] of result.steps!.entries()) {
      const voltage = step.transient!.voltage('2');
      expect(voltage[0]).toBeCloseTo(xyceEndpoints[index][0], 5);
      expect(voltage.at(-1)).toBeCloseTo(xyceEndpoints[index][1], 5);
    }
  });

  it('simulates the unchanged bounded level-1 NJF fixture', async () => {
    const result = await simulate(fixture('NJFET_DC/njfet.cir'));

    expect(result.steps).toHaveLength(4);
    expect([...result.steps![0]!.dcSweep!.sweepValues]).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(result.steps![0]!.dcSweep!.current('Vidmon')).toHaveLength(16);
  });

  for (const [id, path, points, output] of [
    ['nmos-level1-dc', 'NMOS1_DC/nmos1.cir', 19, { kind: 'voltage', name: '3' }],
    ['pmos-level1-dc', 'PMOS1_DC/pmos1.cir', 6, { kind: 'current', name: 'VMON' }],
    ['npn-dc', 'NPN_DC/npn1.cir', 13, { kind: 'current', name: 'VMON1' }],
    ['pnp-dc', 'PNP_DC/pnp1.cir', 6, { kind: 'current', name: 'VMON3' }],
  ] as const) {
    it(`simulates unchanged ${id} output vectors despite brace notation in comments`, async () => {
      const result = await simulate(fixture(path));
      const sweep = result.dcSweep!;

      expect(sweep.sweepValues).toHaveLength(points);
      expect(sweep[output.kind](output.name)).toHaveLength(points);
    });
  }

  it('accepts the bounded level-2 NJF fixture', () => {
    expect(() => parse(fixture('NJFET_DC/njfet-2109.cir')).compile()).not.toThrow();
  });

  it('keeps title-less API snippets behind an explicit parser', () => {
    expect(parseTitleless('R1 in 0 1k\n.op').compile().devices).toHaveLength(1);
  });
});
