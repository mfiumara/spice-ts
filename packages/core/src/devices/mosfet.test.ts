import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('MOSFET Level 1', () => {
  it('NMOS inverter: high input → low output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeLessThan(2);
  });

  it('NMOS inverter: low input → high output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 0
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(5, 0);
  });

  it('NMOS in cutoff has zero drain current', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 0.5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 1k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(5, 1);
  });
});
