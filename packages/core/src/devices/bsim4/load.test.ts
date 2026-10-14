import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setupBsim4Instance, setupBsim4Model } from './setup.js';
import { preprocessBsim4 } from './temp.js';
import { evaluateBsim4 } from './load.js';

function fixture(type: 1 | -1 = 1, parameters: Record<string, number> = {}) {
  const model = setupBsim4Model({ type, ...parameters });
  const instance = setupBsim4Instance(model, { l: 1e-6, w: 10e-6 }, { d: 1, g: 2, s: 0, b: 0 });
  return { model, processed: preprocessBsim4(model, instance) };
}
describe('BSIM4 static channel', () => {
  const oracle = JSON.parse(readFileSync(new URL('../__fixtures__/bsim4/reference/reference.json', import.meta.url), 'utf8')) as {
    cases: Array<{ name: string; polarity: string; points: Array<{ vgs: number; vds: number; vbs: number; id: number; gm: number; gds: number; gmbs: number }> }>;
  };
  for (const reference of oracle.cases.filter(c => c.name.startsWith('minimal-'))) {
    it(`matches 108 ngspice-47 oracle points for ${reference.name}`, () => {
      const type = reference.polarity === 'n' ? 1 : -1;
      const model = setupBsim4Model({ type });
      const instance = setupBsim4Instance(model, { l: 0.15e-6, w: 0.65e-6 }, { d: 1, g: 2, s: 0, b: 3 });
      const processed = preprocessBsim4(model, instance);
      for (const point of reference.points) {
        const op = evaluateBsim4(processed, model.given, { vgs: type * point.vgs, vds: type * point.vds, vbs: type * point.vbs });
        for (const [key, expected] of [['ids', point.id], ['gm', point.gm], ['gds', point.gds], ['gmbs', point.gmbs]] as const) {
          expect(Math.abs(op[key] - expected) / Math.max(Math.abs(expected), 1e-18), `${reference.name} ${key} ${JSON.stringify(point)}`).toBeLessThan(1e-8);
        }
      }
    });
  }
  const parameterSets: Array<Record<string, number>> = [
    {}, { lambda: 2e-10, vtl: 2e5, xn: 4 },
    { alpha0: 0.1, beta0: 0.1, pdits: 0.1, pditsd: 0.2, pditsl: 1e4, fprout: 0.2,
      dvtp0: 1e-8, dvtp1: 0.2, dvtp2: 0.01, dvtp3: 0.1, dvtp4: 0.2, dvtp5: 0.001 },
  ];
  for (const type of [1, -1] as const) for (const [index, parameters] of parameterSets.entries()) {
    it(`finite analytic derivatives for polarity ${type}, parameter set ${index}`, () => {
      const { model, processed } = fixture(type, parameters);
      const bias = { vgs: 1.4, vds: 2, vbs: -0.2 };
      const op = evaluateBsim4(processed, model.given, bias);
      expect(op.ids).toBeGreaterThan(0);
      expect(op.gm).toBeGreaterThan(0);
      for (const [voltage, derivative] of [['vgs', 'gm'], ['vds', 'gds'], ['vbs', 'gmbs']] as const) {
        const h = 1e-5;
        const hi = evaluateBsim4(processed, model.given, { ...bias, [voltage]: bias[voltage] + h });
        const lo = evaluateBsim4(processed, model.given, { ...bias, [voltage]: bias[voltage] - h });
        const fd = (hi.ids - lo.ids) / (2 * h);
        expect(Math.abs(fd - op[derivative]) / Math.max(Math.abs(fd), 1e-12)).toBeLessThan(1e-5);
        if (op.isub > 0) {
          const subKey = { gm: 'gbgs', gds: 'gbds', gmbs: 'gbbs' }[derivative] as 'gbgs' | 'gbds' | 'gbbs';
          const subFd = (hi.isub - lo.isub) / (2 * h);
          expect(Math.abs(subFd - op[subKey]) / Math.max(Math.abs(subFd), 1e-12)).toBeLessThan(1e-5);
        }
      }
    });
  }
  it('reverses the channel, but keeps physical junction identities', () => {
    const { model, processed } = fixture();
    const forward = evaluateBsim4(processed, model.given, { vgs: 1.4, vds: 0.7, vbs: -0.2 });
    const reverse = evaluateBsim4(processed, model.given, { vgs: 0.7, vds: -0.7, vbs: -0.9 });
    expect(reverse.mode).toBe(-1);
    expect(reverse.ids).toBeCloseTo(forward.ids, 13);
    expect(reverse.gm).toBeCloseTo(forward.gm, 13);
  });
});
