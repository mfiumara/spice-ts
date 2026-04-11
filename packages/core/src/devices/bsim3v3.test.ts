import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('BSIM3v3 device', () => {
  it('NMOS in saturation produces positive drain current', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 1.0
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      RD 1 3 100
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeLessThan(1.8);
    expect(vout).toBeGreaterThan(0);
  });

  it('NMOS in cutoff: output near VDD', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.0
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(1.8, 1);
  });

  it('PMOS produces current with negative Vgs', async () => {
    const result = await simulate(`
      VDD 1 0 DC 1.8
      VIN 2 0 DC 0
      .model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
      RD 3 0 100
      M1 3 2 1 1 PMOD W=20u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('3');
    expect(vout).toBeGreaterThan(0.1);
  });

  it('BSIM3 CMOS inverter switches correctly', async () => {
    const result = await simulate(`
      VDD vdd 0 DC 1.8
      VIN in 0 DC 1.8
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 U0=400 TOX=4n)
      .model PMOD PMOS (LEVEL=49 VTH0=-0.5 U0=150 TOX=4n)
      MP out in vdd vdd PMOD W=20u L=0.18u
      MN out in 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    expect(vout).toBeLessThan(0.3);
  });

  it('body effect: bulk-source voltage shifts threshold', async () => {
    const r0 = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.7
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 0 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const r1 = await simulate(`
      VDD 1 0 DC 1.8
      VGS 2 0 DC 0.7
      VBS 4 0 DC -1
      .model NMOD NMOS (LEVEL=49 VTH0=0.5 K1=0.6 U0=400 TOX=4n)
      RD 1 3 1k
      M1 3 2 0 4 NMOD W=10u L=0.18u
      .op
      .end
    `);
    const v0 = r0.dc!.voltage('3');
    const v1 = r1.dc!.voltage('3');
    expect(v1).toBeGreaterThan(v0);
  });
});
