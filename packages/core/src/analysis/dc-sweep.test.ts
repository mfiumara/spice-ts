import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { solveDCSweep } from './dc-sweep.js';
import { resolveOptions } from '../types.js';
import type { DCSweepAnalysis } from '../types.js';

describe('DC Sweep', () => {
  it('sweeps a voltage divider', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const analysis: DCSweepAnalysis = {
      type: 'dc', source: 'V1', start: 0, stop: 5, step: 1,
    };

    const result = solveDCSweep(compiled, analysis, options);

    // 6 points: 0, 1, 2, 3, 4, 5
    expect(result.sweepValues.length).toBe(6);
    expect(result.sweepValues[0]).toBeCloseTo(0, 10);
    expect(result.sweepValues[5]).toBeCloseTo(5, 10);

    const v2 = result.voltage('2');
    expect(v2.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      const vsrc = i * 1; // start + i * step
      const expected = vsrc * 2000 / (1000 + 2000);
      expect(v2[i]).toBeCloseTo(expected, 6);
    }

    // Current through V1: I = -V1 / (R1 + R2)
    const iV1 = result.current('V1');
    expect(iV1.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      const vsrc = i * 1;
      expect(iV1[i]).toBeCloseTo(-vsrc / 3000, 9);
    }
  });
});
