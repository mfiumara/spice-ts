import { describe, it, expect } from 'vitest';
import {
  BSIM3v3_DEFAULTS,
  computeDerived,
  type BSIM3v3ModelParams,
} from './bsim3v3-params.js';

describe('BSIM3v3 params', () => {
  it('provides sensible defaults for a 0.18µm process', () => {
    expect(BSIM3v3_DEFAULTS.VTH0).toBeCloseTo(0.5, 2);
    expect(BSIM3v3_DEFAULTS.TOX).toBeCloseTo(4e-9, 12);
    expect(BSIM3v3_DEFAULTS.U0).toBeCloseTo(400, 0);
    expect(BSIM3v3_DEFAULTS.VSAT).toBeCloseTo(1.5e5, 0);
  });

  it('computes Leff and Weff from L, W, LINT, WINT', () => {
    const params: BSIM3v3ModelParams = {
      ...BSIM3v3_DEFAULTS,
      LINT: 20e-9,
      WINT: 10e-9,
    };
    const inst = { W: 1e-6, L: 0.18e-6 };
    const d = computeDerived(params, inst);
    expect(d.Leff).toBeCloseTo(0.18e-6 - 2 * 20e-9, 12);
    expect(d.Weff).toBeCloseTo(1e-6 - 2 * 10e-9, 12);
  });

  it('computes Cox from TOX', () => {
    const params = { ...BSIM3v3_DEFAULTS, TOX: 4e-9 };
    const inst = { W: 1e-6, L: 0.18e-6 };
    const d = computeDerived(params, inst);
    expect(d.Cox).toBeCloseTo(3.9 * 8.854e-12 / 4e-9, 4);
  });

  it('guards against zero or negative Leff', () => {
    const params = { ...BSIM3v3_DEFAULTS, LINT: 0.2e-6 };
    const inst = { W: 1e-6, L: 0.18e-6 };
    const d = computeDerived(params, inst);
    expect(d.Leff).toBeGreaterThan(0);
  });

  it('computes phi_s from NCH', () => {
    const params = { ...BSIM3v3_DEFAULTS, NCH: 1.7e17 };
    const inst = { W: 1e-6, L: 0.18e-6 };
    const d = computeDerived(params, inst);
    const expected = 2 * 0.02585 * Math.log(1.7e17 / 1.45e10);
    expect(d.phi_s).toBeCloseTo(expected, 4);
  });
});
