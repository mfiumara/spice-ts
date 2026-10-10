import { describe, expect, it } from 'vitest';
import type { ModelParams } from '../types.js';
import {
  evaluateHFET1,
  resolveHFET1Instance,
  resolveHFET1Model,
} from './hfet1-model.js';

const fixtureModel: ModelParams = {
  name: 'adrv',
  type: 'NHFET',
  params: {
    LEVEL: 5,
    RD: 60,
    RS: 60,
    M: 2.57,
    LAMBDA: 0.17,
    VS: 1.5e5,
    MU: 0.385,
    VT0: 0.3,
    ETA: 1.32,
    SIGMA0: 0.04,
    VSIGMA: 0.1,
    VSIGMAT: 0.3,
    JS1S: 1e-12,
    JS1D: 1e-12,
    NMAX: 6e15,
  },
};

describe('ngspice HFET1 model', () => {
  it('matches the ngspice-47 forward-bias operating-point quantities', () => {
    const model = resolveHFET1Model(fixtureModel);
    const instance = resolveHFET1Instance({ L: 1e-6, W: 10e-6 });
    const point = evaluateHFET1(0, 2, model, instance);

    expect(point.drainCurrent).toBeCloseTo(1.21578e-8, 12);
    expect(point.gm).toBeCloseTo(3.66102e-7, 11);
    expect(point.gds).toBeCloseTo(1.61794e-8, 12);
    expect(point.gateDrainCurrent).toBeCloseTo(-8.81918e-9, 12);
    expect(point.gateDrainConductance).toBeCloseTo(-9.22615e-9, 12);
    expect(point.capGS).toBeCloseTo(9.58883e-16, 19);
    expect(point.capGD).toBeCloseTo(5.42055e-16, 19);
  });

  it.each([
    [{ ...fixtureModel, type: 'PHFET' }, "Unsupported Z-card model type: 'PHFET'"],
    [{ ...fixtureModel, type: 'NMF' }, "Unsupported Z-card model type: 'NMF'"],
    [{ ...fixtureModel, params: { ...fixtureModel.params, LEVEL: 6 } }, 'Unsupported NHFET model level: 6'],
    [{ ...fixtureModel, params: { ...fixtureModel.params, GATEMOD: 1 } }, "Unsupported NHFET level-5 model parameter: 'GATEMOD'"],
  ] as const)('rejects unsupported model contracts', (model, message) => {
    expect(() => resolveHFET1Model(model)).toThrow(message);
  });

  it('rejects unsupported Z-card instance parameters', () => {
    expect(() => resolveHFET1Instance({ L: 1e-6, W: 10e-6, M: 2 }))
      .toThrow("Unsupported NHFET level-5 instance parameter: 'M'");
  });
});
