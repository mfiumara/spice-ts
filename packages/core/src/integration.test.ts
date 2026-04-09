import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../../fixtures/circuits', name), 'utf-8');
}

describe('Integration tests', () => {
  describe('Voltage divider', () => {
    it('produces correct node voltages', async () => {
      const result = await simulate(loadFixture('voltage-divider.cir'));
      expect(result.dc!.voltage('1')).toBeCloseTo(10, 6);
      expect(result.dc!.voltage('2')).toBeCloseTo(5, 6);
    });
  });

  describe('RC lowpass', () => {
    it('shows exponential charging', async () => {
      const result = await simulate(loadFixture('rc-lowpass.cir'));
      const t = result.transient!.time;
      const v = result.transient!.voltage('2');

      // τ = RC = 1k * 100n = 100µs
      const tau = 100e-6;
      const idxTau = t.findIndex(ti => ti >= tau);
      expect(v[idxTau]).toBeCloseTo(5 * (1 - Math.exp(-1)), 0);
    });
  });

  describe('RL circuit', () => {
    it('current ramps up with L/R time constant', async () => {
      const result = await simulate(loadFixture('rl-circuit.cir'));
      const t = result.transient!.time;
      const vNode = result.transient!.voltage('2');

      // τ = L/R = 10mH/100Ω = 0.1ms
      const tau = 10e-3 / 100;
      const idxTau = t.findIndex(ti => ti >= tau);
      expect(vNode[idxTau]).toBeCloseTo(5 * Math.exp(-1), 0);
    });
  });

  describe('Diode rectifier', () => {
    it('rectifies sinusoidal input', async () => {
      const result = await simulate(loadFixture('diode-rectifier.cir'), {
        integrationMethod: 'euler',
      });
      const v = result.transient!.voltage('2');

      const minV = Math.min(...v);
      expect(minV).toBeGreaterThan(-0.1);

      const maxV = Math.max(...v);
      expect(maxV).toBeGreaterThan(4);
    });
  });
});
