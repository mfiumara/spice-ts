import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/index.js';
import { simulate } from '../../simulate.js';
import { UnsupportedModelParameterError } from '../../errors.js';
import { BSIM4 } from './device.js';
import { setupBsim4Instance, setupBsim4Model } from './setup.js';
import { preprocessBsim4 } from './temp.js';
import { evaluateBsim4 } from './load.js';

interface ReferenceCase {
  name: string;
  deck: string;
  native: { '@m1[gbs]': number; '@m1[gbd]': number; 'i(vb)': number };
  warnings: string[];
}
const reference = JSON.parse(readFileSync(new URL(
  '../../../../../benchmarks/bsim4-validation-3/paramchk-reference.json', import.meta.url,
), 'utf8')) as { cases: ReferenceCase[] };
function relative(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-18);
}

describe('BSIM4 PARAMCHK junction correction domain', () => {
  for (const row of reference.cases) {
    if (row.warnings.length > 0) {
      it(`rejects native correction domain ${row.name} at integrated compile and simulate`, async () => {
        expect(() => parse(row.deck).compile()).toThrow(UnsupportedModelParameterError);
        await expect(simulate(row.deck)).rejects.toThrow(UnsupportedModelParameterError);
      });
    } else {
      it(`matches native conductance and junction-gmin current for ${row.name}`, async () => {
        const device = parse(row.deck).compile().devices.find(d => d.name === 'M1') as BSIM4;
        const op = device.evaluate({ vgs: 1, vds: 0.5, vbs: 0.02 }, 1e-12);
        expect(relative(op.gbs, row.native['@m1[gbs]'])).toBeLessThan(1e-8);
        expect(relative(op.gbd, row.native['@m1[gbd]'])).toBeLessThan(1e-8);
        const result = await simulate(row.deck);
        // Netlist gmin is junction-only, with no extra node-ground current (#1068).
        const delta = result.dc!.current('Vb') - row.native['i(vb)'];
        expect(Math.abs(delta)).toBeLessThan(1e-24);
      });
    }
  }
  it('retains the reviewer source repro native reference, not the internal cbs equivalent', () => {
    const row = reference.cases.find(r => r.name === 'source')!;
    expect(relative(row.native['@m1[gbs]'], 8.922063566058626e-11)).toBeLessThan(1e-12);
    expect(relative(row.native['i(vb)'], 2.3202450146045394e-13)).toBeLessThan(1e-12);
  });
  for (const parameter of ['njs', 'njd']) for (const value of [-0.05, 0, 0.05]) {
    it(`rejects ${parameter}=${value} before preprocessing an invalid junction`, () => {
      const model = setupBsim4Model({ [parameter]: value });
      const instance = setupBsim4Instance(model, { l: 1e-6, w: 2e-6 }, { d: 1, g: 2, s: 0, b: 3 });
      expect(() => preprocessBsim4(model, instance)).toThrow(UnsupportedModelParameterError);
    });
  }
  for (const parameter of ['njs', 'njd']) {
    it(`guards the direct static load boundary for ${parameter}`, () => {
      const model = setupBsim4Model({ paramchk: 0, [parameter]: 0.05 });
      const instance = setupBsim4Instance(model, { l: 1e-6, w: 2e-6 }, { d: 1, g: 2, s: 0, b: 3 });
      const processed = preprocessBsim4(model, instance);
      const checked = { ...processed, model: { ...processed.model, paramchk: 1 } };
      expect(() => evaluateBsim4(checked, model.given, { vgs: 1, vds: 0.5, vbs: 0.02 }))
        .toThrow(UnsupportedModelParameterError);
    });
  }
});
