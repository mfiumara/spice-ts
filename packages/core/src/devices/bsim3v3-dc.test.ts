import { describe, it, expect } from 'vitest';
import { evaluateDC } from './bsim3v3-dc.js';
import { computeBsim3Size, resolveBsim3Model } from './bsim3v3-params.js';

// Qualitative behaviour of the ported b3ld.c evaluator; numeric parity with
// ngspice-47 is checked in bsim3v3-ngspice-parity.test.ts.
const model = resolveBsim3Model({ VTH0: 0.5, K1: 0.6, U0: 400, TOX: 4e-9, VSAT: 1.5e5 }, 1);
const size = computeBsim3Size(model, { W: 10e-6, L: 0.18e-6 });
const dc = (vgs: number, vds: number, vbs = 0) => ({ ...evaluateDC(model, size, vgs, vds, vbs) });

describe('evaluateDC (b3ld.c port)', () => {
  it('conducts only subthreshold current well below threshold', () => {
    const r = dc(0.0, 1.0);
    expect(r.Ids).toBeGreaterThan(0);
    expect(r.Ids).toBeLessThan(1e-7);
  });

  it('produces positive current and conductances in saturation', () => {
    const r = dc(1.0, 1.8);
    expect(r.Ids).toBeGreaterThan(1e-4);
    expect(r.gm).toBeGreaterThan(0);
    expect(r.gds).toBeGreaterThan(0);
  });

  it('has zero current at Vds = 0 and a much larger gds in the linear region', () => {
    expect(dc(1.0, 0).Ids).toBe(0);
    expect(dc(1.0, 0.05).gds).toBeGreaterThan(dc(1.0, 1.8).gds * 5);
  });

  it('body effect: negative Vbs raises the threshold', () => {
    expect(dc(0.8, 1.0, -1.0).von).toBeGreaterThan(dc(0.8, 1.0, 0).von);
    expect(dc(0.8, 1.0, -1.0).Ids).toBeLessThan(dc(0.8, 1.0, 0).Ids);
    expect(dc(1.0, 1.0, -0.5).gmbs).toBeGreaterThan(0);
  });

  it('analytic gm, gds and gmbs match central differences', () => {
    const h = 1e-6;
    for (const [vgs, vds, vbs] of [[0.3, 0.5, 0], [1.0, 0.1, -0.3], [1.5, 1.8, -0.9]]) {
      const r = dc(vgs, vds, vbs);
      const gm = (dc(vgs + h, vds, vbs).Ids - dc(vgs - h, vds, vbs).Ids) / (2 * h);
      const gds = (dc(vgs, vds + h, vbs).Ids - dc(vgs, vds - h, vbs).Ids) / (2 * h);
      const gmbs = (dc(vgs, vds, vbs + h).Ids - dc(vgs, vds, vbs - h).Ids) / (2 * h);
      expect(Math.abs(r.gm - gm)).toBeLessThan(1e-4 * Math.abs(gm) + 1e-12);
      expect(Math.abs(r.gds - gds)).toBeLessThan(1e-4 * Math.abs(gds) + 1e-12);
      expect(Math.abs(r.gmbs - gmbs)).toBeLessThan(1e-4 * Math.abs(gmbs) + 1e-12);
    }
  });

  it('Ids is continuous across Vdsat', () => {
    // From Vds = 0.1 V, where Ids is already meaningful: no more than a 15%
    // change per 10 mV step.
    let previous = dc(1.0, 0.1).Ids;
    for (let vds = 0.11; vds <= 1.5; vds += 0.01) {
      const current = dc(1.0, vds).Ids;
      expect(Math.abs(current - previous) / current).toBeLessThan(0.15);
      previous = current;
    }
  });
});
