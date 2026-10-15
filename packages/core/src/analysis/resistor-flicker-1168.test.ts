import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

const relative = (actual: number, expected: number) => {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(1e-6);
};

const deck = (instance: string, model: string) => `resistor flicker noise
I1 0 out DC 10m AC 1
R1 out 0 100 RM ${instance}
.model RM R(KF=1e-16 ${model})
.temp 25
.noise v(out) I1 dec 1 1k 100k
.end`;

describe('ngspice-47 resistor flicker noise (#1168)', () => {
  it.each([
    ['', '', 1, 1, 1, 1],
    ['M=2 L=1u W=10u', 'AF=1.1 DLR=0.01u DW=0.01u', 2, 1.1, 1, 0.98e-6 * 9.98e-6],
    ['L=2u', 'W=4u AF=1.5 LF=0.5 WF=1.2 EF=0.7', 1, 1.5, 0.7, (2e-6 ** 0.5) * (4e-6 ** 1.2)],
    ['', 'L=2u W=4u LF=0.5 WF=1.2 EF=0.7', 1, 1, 0.7, 1],
  ] as const)('matches analytic density for %s / %s', async (instance, model, m, af, ef, area) => {
    const noise = (await simulate(deck(instance, model))).noise!;
    expect(noise.frequencies.length).toBeGreaterThanOrEqual(2);
    noise.frequencies.forEach((frequency, i) => {
      const thermal = 4 * 1.380649e-23 * 298.15 * m / 100;
      const flicker = m * 1e-16 * ((0.01 / m) ** af) / (area * (frequency ** ef));
      relative(noise.inputNoiseDensity[i] ** 2, thermal + flicker);
      relative(noise.outputNoiseDensity[i] ** 2, (thermal + flicker) * ((100 / m) ** 2));
    });
  });

  it('makes M=2 equivalent to two independently biased parallel instances', async () => {
    const single = (await simulate(deck('M=2 L=1u W=10u', 'AF=1.1'))).noise!;
    const parallel = (await simulate(deck('L=1u W=10u', 'AF=1.1')
      .replace('.model RM', 'R2 out 0 100 RM L=1u W=10u\n.model RM'))).noise!;
    single.outputNoiseDensity.forEach((density, i) => relative(density, parallel.outputNoiseDensity[i]));
  });

  it.each([
    ['L=1u', 'DLR=1u'], ['W=1u', 'DW=1u'], ['M=0', ''], ['', 'KF=-1'],
  ])('rejects unsupported flicker parameters %s / %s with a typed error', async (instance, model) => {
    await expect(simulate(deck(instance, model))).rejects.toMatchObject({ name: 'InvalidCircuitError' });
  });

  it('keeps noisy=0 noiseless even with flicker enabled', async () => {
    const noise = (await simulate(deck('NOISY=0', 'AF=1.1'))).noise!;
    expect([...noise.outputNoiseDensity]).toEqual([0, 0, 0]);
  });

  it('uses DC bias and conductance for flicker with temperature, SCALE and a separate AC resistance', async () => {
    const noise = (await simulate(`temperature and AC resistor noise
V1 in 0 DC -1 AC 1
R1 in out 100 RM SCALE=2 AC=300 TEMP=77
R2 out 0 100 NOISY=0
.model RM R(KF=1e-10 AF=1.3 TC1=0.01 TNOM=27)
.noise v(out) V1 dec 1 1k 100k
.end`)).noise!;
    // Rdc=300, Rac=900, DC current=-1/400, AC gain=0.1 and noise transimpedance=90.
    noise.frequencies.forEach((frequency, i) => {
      const density = 4 * 1.380649e-23 * 350.15 / 300
        + 1e-10 * ((1 / 400) ** 1.3) / frequency;
      relative(noise.outputNoiseDensity[i] ** 2, density * (90 ** 2));
      relative(noise.inputNoiseDensity[i] ** 2, density * (900 ** 2));
    });
  });
});
