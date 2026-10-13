import { describe, expect, it } from 'vitest';
import type { StampContext } from './device.js';
import { MOSFET } from './mosfet.js';

/**
 * Issue #878: ngspice-47 mos1load.c MODEINITPRED. The first load of every
 * transient timepoint is linearised at vgs/vds/vbs extrapolated from the two
 * accepted points, v(n) + x * (v(n) - v(n-1)) with x = dt / dt(n), not at the
 * Newton iterate; later loads use the iterate. After the operating point, with
 * one accepted point, the prediction is that point.
 *
 * NMOS, VTO = 0.5, KP*W/L = 1.2e-4, LAMBDA = 0, drain at 2.5 V: saturated for
 * every gate voltage used here, so the stamped gm is 1.2e-4 * (vgs - 0.5).
 */
const BETA = 1.2e-4;
const D = 0;
const G = 1;

function context(vD: number, vG: number, dt: number): StampContext & { gm(): number } {
  const conductance = new Map<string, number>();
  const voltages = [vD, vG];
  return {
    stampG: (row, col, value) => conductance.set(`${row},${col}`, (conductance.get(`${row},${col}`) ?? 0) + value),
    stampB: () => {},
    stampC: () => {},
    getVoltage: node => (node >= 0 ? voltages[node] : 0),
    getCurrent: () => 0,
    time: 0,
    dt,
    numNodes: 2,
    sourceScale: 1,
    useDcSourceValue: false,
    gm: () => conductance.get(`${D},${G}`) ?? 0,
  };
}

function gmAt(mosfet: MOSFET, vD: number, vG: number, dt: number): number {
  const ctx = context(vD, vG, dt);
  mosfet.stamp(ctx);
  return ctx.gm();
}

describe('MOS1 transient predictor (mos1load.c MODEINITPRED, #878)', () => {
  it('linearises the first iterate of each timepoint at the extrapolated terminal voltages', () => {
    const mosfet = new MOSFET('M1', [D, G, -1, -1], {
      VTO: 0.5, KP: 120e-6, LAMBDA: 0, W: 1e-6, L: 1e-6, polarity: 1,
    });

    // Operating point at vgs = 1.0 V.
    mosfet.acceptTransientStep(context(2.5, 1.0, 0));
    // First step: only one accepted point, so the first iterate is that point
    // whatever the iterate holds; the next load reads the iterate.
    mosfet.beginTransientNewton(1e-11, Float64Array.of(2.5, 1.0));
    expect(gmAt(mosfet, 0, 0, 1e-11)).toBeCloseTo(BETA * 0.5, 15);
    expect(gmAt(mosfet, 2.5, 0.6, 1e-11)).toBeCloseTo(BETA * 0.1, 15);

    // Accepted at vgs = 1.2 V after a 10 ps step; the next 20 ps step
    // extrapolates vgs = 1.2 + 2 * (1.2 - 1.0) = 1.6 V.
    mosfet.acceptTransientStep(context(2.5, 1.2, 1e-11));
    mosfet.beginTransientNewton(2e-11, Float64Array.of(2.5, 1.2));
    expect(gmAt(mosfet, 0, 0, 2e-11)).toBeCloseTo(BETA * 1.1, 15);
    expect(gmAt(mosfet, 2.5, 1.2, 2e-11)).toBeCloseTo(BETA * 0.7, 15);

    // A retry at 5 ps predicts again from the same accepted points:
    // vgs = 1.2 + 0.5 * 0.2 = 1.3 V.
    mosfet.beginTransientNewton(5e-12, Float64Array.of(2.5, 1.2));
    expect(gmAt(mosfet, 0, 0, 5e-12)).toBeCloseTo(BETA * 0.8, 15);
  });

  it('restarts the history after a transient reset', () => {
    const mosfet = new MOSFET('M1', [D, G, -1, -1], {
      VTO: 0.5, KP: 120e-6, LAMBDA: 0, W: 1e-6, L: 1e-6, polarity: 1,
    });
    mosfet.acceptTransientStep(context(2.5, 1.0, 0));
    mosfet.beginTransientNewton(1e-11, Float64Array.of(2.5, 1.0));
    gmAt(mosfet, 2.5, 1.2, 1e-11);
    mosfet.acceptTransientStep(context(2.5, 1.2, 1e-11));

    mosfet.resetTransient();
    mosfet.acceptTransientStep(context(2.5, 0.9, 0));
    mosfet.beginTransientNewton(1e-11, Float64Array.of(2.5, 0.9));
    // One accepted point again: no extrapolation from the run before the reset.
    expect(gmAt(mosfet, 0, 0, 1e-11)).toBeCloseTo(BETA * 0.4, 15);
  });
});
