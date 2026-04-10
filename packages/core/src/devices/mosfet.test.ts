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

describe('MOSFET W/L aspect ratio', () => {
  it('W/L=10 drives 10x more current than W/L=1 in saturation', async () => {
    // In saturation: ID = KP * (W/L) / 2 * (VGS - VTO)^2
    // KP=100u, VTO=0.5, VGS=2 → VGS-VTO=1.5, (VGS-VTO)^2=2.25
    // W/L=10 → ID = 100e-6 * 10 / 2 * 2.25 = 1125 µA → Vout = 5 - 1.125*1k = 3.875 V
    // W/L=1  → ID = 100e-6 *  1 / 2 * 2.25 = 112.5 µA → Vout = 5 - 0.1125*1k = 4.888 V
    const netlistWide = `
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=10u L=1u
      .op
      .end
    `;
    const netlistNarrow = `
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=1u L=1u
      .op
      .end
    `;
    const [rWide, rNarrow] = await Promise.all([
      simulate(netlistWide),
      simulate(netlistNarrow),
    ]);
    const vWide   = rWide.dc!.voltage('out');
    const vNarrow = rNarrow.dc!.voltage('out');

    // Wide transistor pulls output lower (more current)
    expect(vWide).toBeLessThan(vNarrow - 0.5);
    // Narrow: near supply rail; wide: significantly below it
    expect(vNarrow).toBeGreaterThan(4.5);
    expect(vWide).toBeLessThan(4.5);
  });

  it('4-terminal MOSFET uses model name, not body node, for parameters', async () => {
    // M1 d g s body NMOD — body="0" must NOT be used as model name.
    // With correct model NMOD (KP=100u, VTO=0.5, VGS=2, W/L=1):
    //   ID = 100e-6 / 2 * 1.5^2 = 112.5 µA → Vout = 5 - 0.1125 = 4.8875 V
    // With wrong model (default KP=2e-5, VTO=1, VGS=2, W/L=1):
    //   ID = 2e-5/2 * 1^2 = 10 µA → Vout ≈ 4.99 V
    // The gap of ~0.1 V is a reliable distinguisher.
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    // Correct model: ~4.888 V; wrong model (body as model): ~4.99 V
    expect(vout).toBeLessThan(4.9);
    expect(vout).toBeGreaterThan(4.8);
  });

  it('parses W= L= instance parameters from netlist', async () => {
    // Same circuit as W/L=10 test, but instance params written inline
    // M1 out 2 0 0 NMOD W=10u L=1u should give same result as programmatic W/L=10
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=10u L=1u
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    // W/L=10: ID = 100e-6 * 10 / 2 * 1.5^2 ≈ 1125 µA → Vout ≈ 3.875 V
    expect(vout).toBeCloseTo(3.875, 0);
  });
});
