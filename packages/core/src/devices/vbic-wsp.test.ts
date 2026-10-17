import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { simulate } from '../simulate.js';
import type { StampContext } from './device.js';
import { VBIC, resolveVBICParams } from './vbic.js';

const deck = readFileSync('../../benchmarks/vbic-wsp/wsp.cir', 'utf8');

describe('VBIC WSP substrate-parasitic weighting (#1294)', () => {
  it('defaults to one and accepts the closed unit interval', () => {
    expect(resolveVBICParams({}, 1).WSP).toBe(1);
    for (const WSP of [0, 0.3, 1]) expect(resolveVBICParams({ WSP }, 1).WSP).toBe(WSP);
  });

  it('rejects nonfinite and out-of-domain WSP with a typed error', () => {
    for (const WSP of [-0.01, 1.01, NaN, Infinity, -Infinity]) {
      expect(() => resolveVBICParams({ WSP }, 1)).toThrow(InvalidCircuitError);
      expect(() => resolveVBICParams({ WSP }, 1)).toThrow("Invalid bounded VBIC DC model parameter: 'WSP'");
    }
  });

  for (const WSP of [0, 0.3, 1]) {
    for (const polarity of [1, -1]) {
      it(`matches independent transport, Jacobian, AC and transient charge at WSP=${WSP}, polarity=${polarity}`, () => {
        // Local nodes CX CI BX BI EI BP SI. Vbep != Vbci detects wrong mixing.
        const v = [0, 0, 0.3, 0.2, 0, 0, 0.1].map(x => x * polarity);
        const g = Array.from({ length: 7 }, () => new Float64Array(7));
        const caps = Array.from({ length: 7 }, () => new Float64Array(7));
        const b = new Float64Array(7);
        const ctx: StampContext = {
          stampG: (r, col, x) => { g[r][col] += x; }, stampB: (r, x) => { b[r] += x; },
          stampC: (r, col, x) => { caps[r][col] += x; },
          getVoltage: n => v[n], getCurrent: () => 0, time: 0, dt: 0, numNodes: 7,
          sourceScale: 1, useDcSourceValue: false, gmin: 0,
        };
        const device = new VBIC('Q', [0, 1, 2, 3, 4, 5, 6], {
          WSP, ISP: 1e-12, NFP: 1.2, IKP: 1e-8, TR: 1e-9,
          IS: 1e-30, IBCI: 0, IBEI: 0, RBI: 1e30,
        }, polarity);
        for (let i = 0; i < 8; i++) {
          g.forEach(row => row.fill(0)); b.fill(0); device.stamp(ctx);
        }
        const nvt = 1.2 * 1.380662e-23 * 300.15 / 1.602189e-19;
        const ifp = 1e-12 * (WSP * Math.expm1(0.3 / nvt) + (1 - WSP) * Math.expm1(0.2 / nvt));
        const irp = 1e-12 * Math.expm1(0.1 / nvt);
        const root = Math.sqrt(1 + 4 * ifp / 1e-8);
        const qbp = (1 + root) / 2;
        const current = (ifp - irp) / qbp;
        const actual = -(g[6].reduce((sum, x, col) => sum + x * v[col], 0) - b[6]) * polarity;
        const error = Math.abs(actual - current);
        expect(error).toBeLessThan(1e-20);
        for (const [col, voltage, weight] of [[2, 0.3, WSP], [3, 0.2, 1 - WSP]]) {
          const derivative = 1e-12 * weight * Math.exp(voltage / nvt) / nvt;
          const slope = derivative * (1 / qbp - (ifp - irp) / (qbp * qbp * root * 1e-8));
          expect(Math.abs(g[6][col] + slope)).toBeLessThan(1e-18);
          device.stampDynamic(ctx);
          expect(Math.abs(caps[2][col] - 1e-9 * derivative)).toBeLessThan(1e-28);
          caps.forEach(row => row.fill(0));
        }
        device.resetTransient(); v.fill(0); device.acceptTransientStep(ctx);
        v[2] = 0.3 * polarity; v[3] = 0.2 * polarity; v[6] = 0.1 * polarity;
        g.forEach(row => row.fill(0)); b.fill(0);
        device.stampTransientCharge(ctx, { method: 'euler', dt: 1 });
        const charge = (g[2].reduce((sum, x, col) => sum + x * v[col], 0) - b[2]) * polarity;
        expect(Math.abs(charge - 1e-9 * ifp)).toBeLessThan(1e-28);
        console.info(`WSP=${WSP} polarity=${polarity} hand current absolute error ${error}`);
      });
    }
  }

  it('runs the byte-identical ngspice OP/DC/AC probe', async () => {
    const result = await simulate(deck);
    expect(result.dcSweep!.sweepValues).toHaveLength(3);
    expect(result.ac!.frequencies).toHaveLength(3);
  });
});
