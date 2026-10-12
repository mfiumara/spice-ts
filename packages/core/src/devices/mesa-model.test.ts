import { describe, expect, it } from 'vitest';
import type { ModelParams } from '../types.js';
import {
  evaluateMESA, mesaInstanceState, resolveMESAInstance, resolveMESAModel,
} from './mesa-model.js';

// The ngspice/mesa-oscillator `driver` model without its external RD/RS,
// so the terminal currents below are the intrinsic MESA level-2 device.
const intrinsicDriver: ModelParams = {
  name: 'driver',
  type: 'NMF',
  params: {
    LEVEL: 2, N: 1.44, VS: 1.9e5, MU: 0.25, D: 1e-7, VTO: 0.15, M: 2,
    LAMBDA: 0.15, SIGMA0: 0.02, VSIGMAT: 0.5,
  },
};

// ngspice-47 `op` at TEMP=TNOM=27 C for `z1 d g 0 driver l=0.7u w=20u`:
// [vgs, vds, i(vd), i(vg), @z1[gm], @z1[gds], @z1[ggs], @z1[ggd]].
// Reproduce with benchmarks/results/issue-340/ngspice-op-points.cir.
const NGSPICE_47_OP_POINTS: ReadonlyArray<readonly number[]> = [
  [-0.5, -0.4, 4.192025e-08, 8.687125e-10, 9.328718e-07, 2.503714e-08, 2.761456e-10, 7.394770e-10],
  [-0.5, 0.0, -7.08686e-10, 1.417373e-09, 0, 1.702126e-10, 2.761456e-10, 2.761456e-10],
  [-0.5, 0.05, -8.27087e-10, 1.531745e-09, 9.003362e-11, 1.941000e-11, 2.761456e-10, 1.968929e-10],
  [-0.5, 0.5, -2.73759e-09, 3.440366e-09, 1.320773e-10, 3.497716e-12, 2.761456e-10, -1.43585e-09],
  [-0.5, 1.6, -3.03728e-08, 3.107029e-08, 2.493941e-10, 6.339614e-12, 2.761456e-10, -3.23843e-08],
  [0.0, -0.4, 1.996479e-04, -4.68308e-06, 1.491419e-03, 7.684476e-05, 3.285744e-09, 1.257356e-04],
  [0.0, 0.05, -2.73628e-07, 1.052770e-10, 5.873744e-06, 1.278175e-06, 3.285744e-09, 1.270957e-09],
  [0.0, 0.5, -3.96697e-07, 7.086863e-10, 8.425685e-06, 2.255640e-07, 3.285744e-09, 2.761456e-10],
  [0.0, 1.6, -7.37433e-07, 1.074265e-08, 1.516207e-05, 3.909498e-07, 3.285744e-09, -9.80332e-09],
  [0.1, -0.4, 4.340612e-04, -6.86392e-05, 1.902149e-03, 1.561087e-04, 4.049039e-08, 1.842847e-03],
  [0.1, 0.05, -2.11044e-06, -1.74701e-09, 4.035558e-05, 9.526272e-06, 4.049039e-08, 1.099080e-08],
  [0.1, 0.5, -2.98268e-06, -9.16307e-10, 5.652256e-05, 1.557333e-06, 4.049039e-08, 3.975418e-10],
  [0.3, -0.4, 1.556400e-02, -1.47448e-02, 2.638139e-03, 4.606072e-04, 8.579262e-06, 3.958718e-01],
  [0.3, 0.0, 3.195240e-07, -6.39048e-07, 0, 1.241050e-03, 8.579262e-06, 8.579262e-06],
  [0.3, 0.05, -4.50705e-05, -4.02978e-07, 4.415424e-04, 4.799572e-04, 8.579262e-06, 2.241351e-06],
  [0.3, 0.5, -7.66349e-05, -3.19270e-07, 9.276720e-04, 3.052374e-05, 8.579262e-06, 5.406772e-10],
  [0.3, 1.6, -1.13953e-04, -3.13985e-07, 1.253101e-03, 3.843698e-05, 8.579262e-06, -4.22399e-09],
  [0.6, 0.05, 7.728644e-05, -1.26877e-03, 4.735219e-04, 3.351107e-03, 2.700983e-02, 7.055139e-03],
  [0.6, 0.5, -5.98162e-04, -1.00600e-03, 2.391732e-03, 2.091550e-04, 2.700983e-02, 4.049039e-08],
  [0.6, 1.6, -7.58248e-04, -1.00599e-03, 2.881290e-03, 1.346857e-04, 2.700983e-02, -1.43585e-09],
  [0.9, 0.5, -1.50193e-03, -3.16734e+00, 3.670555e-03, 7.135073e-04, 8.503936e+01, 1.257356e-04],
];

function expectRelative(actual: number, expected: number, label: string): void {
  // ngspice prints six (negative) or seven significant digits: allow half a
  // unit in the last printed place of a six-digit mantissa.
  const tolerance = Math.max(Math.abs(expected) * 5.01e-6, 1e-21);
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

describe('ngspice MESA level-2 (NMF) model', () => {
  const model = resolveMESAModel(intrinsicDriver);
  const instance = resolveMESAInstance({ L: 0.7e-6, W: 20e-6 });
  const state = mesaInstanceState(model, instance);

  it.each(NGSPICE_47_OP_POINTS)(
    'matches ngspice-47 terminal currents and conductances at vgs=%d vds=%d',
    (vgs, vds, iVd, iVg, gm, gds, ggs, ggd) => {
      const point = evaluateMESA(vgs, vgs - vds, state);
      // Source currents are measured into the + terminal of VD/VG.
      expectRelative(-(point.drainCurrent - point.gateDrainCurrent), iVd, 'i(vd)');
      expectRelative(-(point.gateSourceCurrent + point.gateDrainCurrent), iVg, 'i(vg)');
      expectRelative(point.gm, gm, 'gm');
      expectRelative(point.gds, gds, 'gds');
      expectRelative(point.gateSourceConductance, ggs, 'ggs');
      expectRelative(point.gateDrainConductance, ggd, 'ggd');
    },
  );

  it('applies the ngspice-47 NMF defaults for omitted level-2 parameters', () => {
    const defaults = resolveMESAModel({ name: 'm', type: 'NMF', params: {} });
    expect(defaults).toMatchObject({
      LEVEL: 2, VTO: -1.26, D: 0.12e-6, ND: 2e23, LAMBDA: 0.045, VS: 1.5e5,
      ETA: 1.73, M: 2.5, MC: 3, ALPHA: 0, SIGMA0: 0.081, VSIGMAT: 1.01,
      VSIGMA: 0.1, MU: 0.23, THETA: 0, DELTA: 5, TC: 0, RD: 0, RS: 0,
      RDI: 0, RSI: 0, ASTAR: 4e4, GGR: 40, DEL: 0.04, N: 1, ZETA: 1, AG: 0,
    });
    expect(defaults.PHIB).toBeCloseTo(0.5, 15);
    expect(resolveMESAInstance()).toEqual({ L: 1e-6, W: 20e-6, TS: 300.15, TD: 300.15 });
    // mesaparam.c: TS/TD are given in Celsius.
    expect(resolveMESAInstance({ TS: 400, TD: 100 })).toMatchObject({ TS: 673.15, TD: 373.15 });
  });

  it('rejects fields outside the supported NMF level-2/3 contract instead of ignoring them', () => {
    expect(() => resolveMESAModel({ name: 'm', type: 'NMF', params: { LEVEL: 4 } }))
      .toThrow('Unsupported NMF model level: 4');
    expect(() => resolveMESAModel({ name: 'm', type: 'PMF', params: {} }))
      .toThrow("Unsupported MESA model type: 'PMF'");
    for (const name of ['KS', 'VSG', 'IS']) {
      expect(() => resolveMESAModel({ name: 'm', type: 'NMF', params: { LEVEL: 2, [name]: 1 } }))
        .toThrow(`Unsupported NMF level-2 model parameter: '${name}'`);
    }
    expect(() => resolveMESAInstance({ M: 2 }))
      .toThrow("Unsupported NMF MESA instance parameter: 'M'");
    expect(() => resolveMESAInstance({ L: 0 }))
      .toThrow('NMF MESA instance L and W must be positive');
  });
});
