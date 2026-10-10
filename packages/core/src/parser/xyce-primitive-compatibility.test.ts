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

  it('advances inductor-transient to its unsupported TIMEINT field', () => {
    expect(() => parse(fixture('INDUCTOR/inductor.cir')))
      .toThrow(/Unsupported \.options TIMEINT field: 'newbpstepping'/);
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

  it('advances capacitor-rc-oscillator past TIMEINT to its source syntax gap', () => {
    expect(() => parse(fixture('CAPACITOR/rc_osc.cir')))
      .toThrow(/Cannot parse number: 'v1'/);
  });

  it('accepts the bounded level-1 NJF fixture', () => {
    expect(() => parse(fixture('NJFET_DC/njfet.cir')).compile()).not.toThrow();
  });

  it('keeps the level-2 NJF fixture explicitly unsupported', () => {
    expect(() => parse(fixture('NJFET_DC/njfet-2109.cir')).compile())
      .toThrow(/Unsupported NJF model level: 2/);
  });

  it('keeps title-less API snippets behind an explicit parser', () => {
    expect(parseTitleless('R1 in 0 1k\n.op').compile().devices).toHaveLength(1);
  });
});
