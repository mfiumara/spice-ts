import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { readFileSync } from 'node:fs';
import { VBIC } from './vbic.js';
import type { StampContext } from './device.js';

describe('bounded VBIC transient', () => {
  for (const polarity of [1, -1]) {
    it(`integrates junction, diffusion and TD states (${polarity > 0 ? 'NPN' : 'PNP'})`, async () => {
      const result = await simulate(`VBIC step
VCC cc 0 ${polarity * 2}
VIN in 0 PWL(0 ${polarity * 0.6} 1n ${polarity * 0.6} 1.1n ${polarity * 0.65})
RB in b 100
RC cc c 1k
Q1 c b 0 0 QV
.model QV ${polarity > 0 ? 'NPN' : 'PNP'}(LEVEL=4 CJE=1p CJC=0.5p CJEP=0.2p CJCP=0.3p TF=20p TR=10p TD=100p)
.tran 10p 5n
.end`);
      const tran = result.transient!;
      expect(tran.time[tran.time.length - 1]).toBeCloseTo(5e-9, 16);
      const collector = tran.voltage('c');
      expect(collector.every(Number.isFinite)).toBe(true);
      expect(polarity * (collector[0] - collector[collector.length - 1])).toBeGreaterThan(0.003);
      // ngspice-47 NPN deck with .print tran v(c) v(b); PNP uses the
      // analytic sign symmetry, NOT a claimed ngspice PNP match (TRIAGE-1167).
      // Includes the TD-network overshoot, not just the settled DC value.
      const reference = [
        [1.055e-9, 2.001390, 0.6037106],
        [1.195e-9, 2.015240, 0.6259669],
        [1.495e-9, 2.018034, 0.6433121],
        [2.005e-9, 2.007224, 0.6482575],
        [5e-9, 1.992116, 0.6499615],
      ];
      for (const [time, vc, vb] of reference) {
        const upper = tran.time.findIndex(t => t >= time);
        const lower = Math.max(0, upper - 1);
        const weight = upper === lower ? 0 : (time - tran.time[lower]) / (tran.time[upper] - tran.time[lower]);
        for (const [node, expected] of [['c', vc], ['b', vb]] as const) {
          const values = tran.voltage(node);
          const actual = polarity * (values[lower] + weight * (values[upper] - values[lower]));
          expect(Math.abs(actual - expected)).toBeLessThan(2e-4);
        }
      }
    });
  }

  it('completes the unchanged corpus-f differential amplifier', async () => {
    const deck = readFileSync('../../benchmarks/corpus/corpus-f/fixtures/tests/vbic/diffamp.cir', 'utf8');
    const result = await simulate(deck);
    expect(result.transient!.time.at(-1)).toBe(1e-6);
    expect(result.transient!.voltage('e1_p').every(Number.isFinite)).toBe(true);
    expect(result.ac).toBeDefined();
  }, 30_000); // Coverage-instrumented CI exceeds Vitest's default 5 s budget.

  for (const polarity of [1, -1]) {
    for (const method of ['euler', 'trapezoidal', 'gear2'] as const) {
      it(`conserves electrical charge and advances TD with ${method}, polarity ${polarity}`, () => {
        const device = new VBIC('Q', Array.from({ length: 9 }, (_, i) => i), {
          CJE: 1e-12, CJC: 2e-12, CJEP: 3e-12, CJCP: 4e-12,
          QCO: 1e-12, TF: 1e-10, TR: 2e-10, TD: 3e-10,
        }, polarity);
        const voltage = [0.2, 0.3, 0.1, 0.15, 0, 0.05, 0.2, 0.01, 0.02].map(v => polarity * v);
        const g = Array.from({ length: 9 }, () => new Float64Array(9));
        const b = new Float64Array(9);
        const ctx: StampContext = {
          stampG: (r, c, v) => { g[r][c] += v; },
          stampB: (r, v) => { b[r] += v; }, stampC: () => {},
          getVoltage: n => voltage[n], getCurrent: () => 0,
          time: 0, dt: 0, numNodes: 9, sourceScale: 1, useDcSourceValue: false,
        };
        device.acceptTransientStep(ctx);
        device.stampTransientCharge(ctx, { method: 'euler', dt: 1e-10 });
        device.acceptTransientStep(ctx);
        g.forEach(row => row.fill(0));
        b.fill(0);
        voltage[7] += polarity * 0.003;
        voltage[8] += polarity * 0.004;
        device.stampTransientCharge(ctx, { method, dt: 1e-10, prevDt: 1e-10 });
        for (let column = 0; column < 9; column++) {
          expect(Math.abs(g.slice(0, 7).reduce((sum, row) => sum + row[column], 0))).toBeLessThan(1e-12);
        }
        expect(Math.abs(b.slice(0, 7).reduce((sum, v) => sum + v, 0))).toBeLessThan(1e-12);
        // Constant-step integration after bootstrap, with zero prior current.
        const factor = method === 'trapezoidal' ? 2 : method === 'gear2' ? 1.5 : 1;
        expect(g[7][7]).toBeCloseTo(3 * factor, 12);
        expect(g[8][8]).toBeCloseTo(factor, 12);
        device.acceptTransientStep(ctx);
        b.fill(0);
        device.stampAcceptedChargeCurrent(ctx);
        expect(b[7]).toBeCloseTo(-polarity * 0.009 * factor, 12);
        expect(b[8]).toBeCloseTo(-polarity * 0.004 * factor, 12);
        device.resetTransient();
        b.fill(0);
        device.stampAcceptedChargeCurrent(ctx);
        expect(Array.from(b).every(v => v === 0)).toBe(true);
      });
    }
  }
});
