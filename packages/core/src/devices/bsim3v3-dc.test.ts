import { describe, it, expect } from 'vitest';
import { evaluateDC } from './bsim3v3-dc.js';
import { BSIM3v3_DEFAULTS, computeDerived } from './bsim3v3-params.js';

const model = { ...BSIM3v3_DEFAULTS };
const inst = { W: 10e-6, L: 0.18e-6 };
const derived = computeDerived(model, inst);

describe('evaluateDC', () => {
  it('returns zero current in cutoff (Vgs < Vth)', () => {
    const r = evaluateDC(model, derived, 0.0, 1.0, 0.0);
    expect(r.Ids).toBeCloseTo(0, 8);
    expect(r.gm).toBeCloseTo(0, 8);
    expect(r.gds).toBeCloseTo(0, 8);
  });

  it('produces positive current in saturation (Vgs > Vth, Vds > Vdsat)', () => {
    const r = evaluateDC(model, derived, 1.0, 1.8, 0.0);
    expect(r.Ids).toBeGreaterThan(0);
    expect(r.gm).toBeGreaterThan(0);
    expect(r.gds).toBeGreaterThan(0);
  });

  it('produces current in linear region (small Vds)', () => {
    const r = evaluateDC(model, derived, 1.0, 0.05, 0.0);
    expect(r.Ids).toBeGreaterThan(0);
    const rSat = evaluateDC(model, derived, 1.0, 1.8, 0.0);
    expect(r.gds).toBeGreaterThan(rSat.gds * 5);
  });

  it('Ids increases with Vgs (transconductance positive)', () => {
    const r1 = evaluateDC(model, derived, 0.8, 1.0, 0.0);
    const r2 = evaluateDC(model, derived, 1.2, 1.0, 0.0);
    expect(r2.Ids).toBeGreaterThan(r1.Ids);
  });

  it('subthreshold: Ids is small but nonzero for Vgs slightly below Vth', () => {
    const r = evaluateDC(model, derived, 0.3, 1.0, 0.0);
    expect(r.Ids).toBeGreaterThan(0);
    expect(r.Ids).toBeLessThan(1e-6);
  });

  it('body effect: negative Vbs increases threshold (reduces Ids)', () => {
    const r0 = evaluateDC(model, derived, 0.8, 1.0, 0.0);
    const rNeg = evaluateDC(model, derived, 0.8, 1.0, -1.0);
    expect(rNeg.Ids).toBeLessThan(r0.Ids);
  });

  it('gmbs is nonzero when device is on', () => {
    const r = evaluateDC(model, derived, 1.0, 1.0, -0.5);
    expect(r.gmbs).not.toBeCloseTo(0, 10);
  });

  it('Ids is continuous at Vdsat boundary', () => {
    // Start at Vds=0.1 where Ids is already meaningful; the near-zero region
    // has large relative changes that aren't discontinuities.
    const Vgs = 1.0;
    const points: number[] = [];
    for (let vds = 0.1; vds <= 1.5; vds += 0.01) {
      points.push(evaluateDC(model, derived, Vgs, vds, 0.0).Ids);
    }
    for (let i = 1; i < points.length; i++) {
      const ratio = Math.abs(points[i] - points[i - 1]) / (Math.abs(points[i]) + 1e-15);
      expect(ratio).toBeLessThan(0.15); // no more than 15% jump per 10mV step
    }
  });

  it('gm is continuous at Vth boundary', () => {
    const points: number[] = [];
    for (let vgs = 0.0; vgs <= 1.5; vgs += 0.01) {
      points.push(evaluateDC(model, derived, vgs, 1.0, 0.0).gm);
    }
    for (let i = 1; i < points.length; i++) {
      const jump = Math.abs(points[i] - points[i - 1]);
      expect(jump).toBeLessThan(5e-3);
    }
  });
});
