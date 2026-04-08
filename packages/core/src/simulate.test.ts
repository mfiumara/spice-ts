import { describe, it, expect } from 'vitest';
import { simulate, parse, Circuit } from './index.js';

describe('simulate (end-to-end)', () => {
  it('simulates a voltage divider from netlist string', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `);

    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('1')).toBeCloseTo(5, 6);
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });

  it('simulates from programmatic Circuit', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1e3);
    ckt.addResistor('R2', '2', '0', 2e3);
    ckt.addAnalysis('op');

    const result = await simulate(ckt);

    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });

  it('returns warnings array', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .end
    `);

    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
