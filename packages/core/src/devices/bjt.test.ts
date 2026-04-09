import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('BJT Ebers-Moll', () => {
  it('NPN common-emitter amplifier has correct bias point', async () => {
    const result = await simulate(`
      VCC 1 0 DC 12
      .model QMOD NPN(BF=100 IS=1e-14)
      RB 1 2 100k
      RC 1 3 1k
      Q1 3 2 0 QMOD
      .op
      .end
    `);

    const vb = result.dc!.voltage('2');
    const vc = result.dc!.voltage('3');

    expect(vb).toBeGreaterThan(0.55);
    expect(vb).toBeLessThan(0.8);
    expect(vc).toBeGreaterThan(0);
    expect(vc).toBeLessThan(12);
  });

  it('NPN in cutoff has collector at VCC', async () => {
    const result = await simulate(`
      VCC 1 0 DC 5
      .model QMOD NPN(BF=100 IS=1e-14)
      RC 1 2 1k
      Q1 2 0 0 QMOD
      .op
      .end
    `);

    const vc = result.dc!.voltage('2');
    expect(vc).toBeCloseTo(5, 0);
  });
});
