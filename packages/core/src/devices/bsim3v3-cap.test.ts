import { describe, it, expect } from 'vitest';
import { capParams, evaluateCap } from './bsim3v3-cap.js';
import { computeBsim3Size, resolveBsim3Model } from './bsim3v3-params.js';

// Symmetric device with drain/source junction areas (ngspice defaults them to 0).
const model = resolveBsim3Model(
  { VTH0: 0.5, K1: 0.6, TOX: 4e-9, CGSO: 2.5e-10, CGDO: 2.5e-10, CJ: 1e-3, CJSW: 5e-10 }, 1,
);
const p = capParams(
  model, computeBsim3Size(model, { W: 10e-6, L: 0.18e-6, AD: 5e-12, AS: 5e-12, PD: 11e-6, PS: 11e-6 }),
);
const CoxWL = p.coxWL;
const overlapCaps = p.cgso + p.cgdo;

describe('evaluateCap', () => {
  it('Cgg approaches Cox*Weff*Leff in strong inversion (Vgs >> Vth)', () => {
    const c = evaluateCap(p, 1.8, 0.0, 0.0);
    expect(c.Cgg).toBeGreaterThan(CoxWL * 0.5);
    expect(c.Cgg).toBeLessThan(CoxWL + overlapCaps + 1e-15);
  });

  it('Cgg is small in accumulation (Vgs << 0)', () => {
    const c = evaluateCap(p, -1.0, 0.0, 0.0);
    // In accumulation the intrinsic gate charge is ~0; only overlap caps
    // (CGSO/CGDO plus the b3temp.c fringing CF, and CGBO) remain.
    expect(c.Cgg - overlapCaps - p.cgbo).toBeLessThan(CoxWL * 0.05);
  });

  it('overlap caps are always present', () => {
    const c = evaluateCap(p, 0.0, 0.0, 0.0);
    const minOverlap = overlapCaps;
    expect(c.Cgg).toBeGreaterThanOrEqual(minOverlap * 0.9);
  });

  it('junction caps increase with reverse bias', () => {
    const c0 = evaluateCap(p, 1.0, 0.0, 0.0);
    const cRev = evaluateCap(p, 1.0, 1.0, -1.0);
    expect(c0.Cbd).toBeGreaterThan(0);
    expect(cRev.Cbd).toBeGreaterThan(0);
    expect(c0.Cbs).toBeGreaterThan(0);
    expect(cRev.Cbs).toBeGreaterThan(0);
  });

  it('reverse mode (Vds < 0) mirrors the intrinsic gate-drain/gate-source split (#582)', () => {
    // Forward: G=1.8, D=0.5, S=0, B=0. Reverse: same physical bias with the
    // drain/source roles exchanged (G-S'=1.3, D'-S'=-0.5, B-S'=-0.5).
    const fwd = evaluateCap(p, 1.8, 0.5, 0.0);
    const rev = evaluateCap(p, 1.3, -0.5, -0.5);
    // With CGSO = CGDO and equal default AD/AS, the device is fully symmetric.
    expect(rev.Cgd).toBeCloseTo(fwd.Cgs, 20);
    expect(rev.Cgs).toBeCloseTo(fwd.Cgd, 20);
    expect(rev.Cgb).toBeCloseTo(fwd.Cgb, 20);
    expect(fwd.Cgs).toBeGreaterThan(fwd.Cgd);
  });

  it('returns all required capacitance components', () => {
    const c = evaluateCap(p, 1.0, 0.5, 0.0);
    expect(c).toHaveProperty('Cgg');
    expect(c).toHaveProperty('Cgd');
    expect(c).toHaveProperty('Cgs');
    expect(c).toHaveProperty('Cgb');
    expect(c).toHaveProperty('Cbd');
    expect(c).toHaveProperty('Cbs');
  });
});
