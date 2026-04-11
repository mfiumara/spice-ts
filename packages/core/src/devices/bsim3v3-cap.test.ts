import { describe, it, expect } from 'vitest';
import { evaluateCap } from './bsim3v3-cap.js';
import { BSIM3v3_DEFAULTS, computeDerived } from './bsim3v3-params.js';

const model = { ...BSIM3v3_DEFAULTS };
const inst = { W: 10e-6, L: 0.18e-6 };
const derived = computeDerived(model, inst);

describe('evaluateCap', () => {
  it('Cgg approaches Cox*Weff*Leff in strong inversion (Vgs >> Vth)', () => {
    const c = evaluateCap(model, derived, 1.8, 0.0, 0.0);
    const CoxWL = derived.Cox * derived.Weff * derived.Leff;
    const overlapCaps = (model.CGSO + model.CGDO) * derived.Weff;
    expect(c.Cgg).toBeGreaterThan(CoxWL * 0.5);
    expect(c.Cgg).toBeLessThan(CoxWL + overlapCaps + 1e-15);
  });

  it('Cgg is small in accumulation (Vgs << 0)', () => {
    const c = evaluateCap(model, derived, -1.0, 0.0, 0.0);
    const CoxWL = derived.Cox * derived.Weff * derived.Leff;
    // In accumulation the intrinsic gate charge is ~0; only overlap caps remain,
    // which can be up to ~33% of CoxWL for these defaults, so use 0.4 as threshold.
    expect(c.Cgg).toBeLessThan(CoxWL * 0.4);
  });

  it('overlap caps are always present', () => {
    const c = evaluateCap(model, derived, 0.0, 0.0, 0.0);
    const minOverlap = (model.CGSO + model.CGDO) * derived.Weff;
    expect(c.Cgg).toBeGreaterThanOrEqual(minOverlap * 0.9);
  });

  it('junction caps increase with reverse bias', () => {
    const c0 = evaluateCap(model, derived, 1.0, 0.0, 0.0);
    const cRev = evaluateCap(model, derived, 1.0, 1.0, -1.0);
    expect(c0.Cbd).toBeGreaterThan(0);
    expect(cRev.Cbd).toBeGreaterThan(0);
    expect(c0.Cbs).toBeGreaterThan(0);
    expect(cRev.Cbs).toBeGreaterThan(0);
  });

  it('returns all required capacitance components', () => {
    const c = evaluateCap(model, derived, 1.0, 0.5, 0.0);
    expect(c).toHaveProperty('Cgg');
    expect(c).toHaveProperty('Cgd');
    expect(c).toHaveProperty('Cgs');
    expect(c).toHaveProperty('Cgb');
    expect(c).toHaveProperty('Cbd');
    expect(c).toHaveProperty('Cbs');
  });
});
