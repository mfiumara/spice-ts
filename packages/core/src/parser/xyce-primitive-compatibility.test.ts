import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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

  it('advances diode-sidewall-dc to explicit unsupported instance geometry', () => {
    expect(() => parse(fixture('DIODE/diode_with_sidewall.cir')))
      .toThrow(/Unsupported diode parameters: 'PJ=0.5'/);
  });

  it('advances inductor-transient from its title to an explicit unsupported option', () => {
    expect(() => parse(fixture('INDUCTOR/inductor.cir')))
      .toThrow(/Unsupported \.options field: 'timeint'/);
  });

  for (const [id, path] of [
    ['njfet-2109-dc', 'NJFET_DC/njfet-2109.cir'],
    ['njfet-stepped-dc', 'NJFET_DC/njfet.cir'],
  ] as const) {
    it(`advances ${id} from its title to an explicit unsupported JFET card`, () => {
      expect(() => parse(fixture(path))).toThrow(/Unsupported device card: 'J'/);
    });
  }

  it('keeps title-less API snippets behind an explicit parser', () => {
    expect(parseTitleless('R1 in 0 1k\n.op').compile().devices).toHaveLength(1);
  });
});
