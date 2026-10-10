import { describe, it, expect } from 'vitest';
import { simulate, parse, Circuit, SingularMatrixError } from './index.js';

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

  it('simulates with .include resolved via resolveInclude', async () => {
    const result = await simulate(
      `.include 'divider.lib'\n.op`,
      {
        resolveInclude: async (path) => {
          if (path === 'divider.lib') {
            return 'V1 1 0 DC 5\nR1 1 2 1k\nR2 2 0 2k';
          }
          throw new Error(`Unknown: ${path}`);
        },
      },
    );
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

  it('identifies the branch causing parallel ideal sources to be singular', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 1 });
    ckt.addVoltageSource('V2', '1', '0', { dc: 1 });
    ckt.addAnalysis('op');

    try {
      await simulate(ckt);
      expect.fail('expected parallel ideal voltage sources to be singular');
    } catch (error) {
      expect(error).toBeInstanceOf(SingularMatrixError);
      expect(error).toMatchObject({
        involvedNodes: [],
        involvedBranches: ['V2'],
        pivotIndex: 2,
      });
    }
  });
});
