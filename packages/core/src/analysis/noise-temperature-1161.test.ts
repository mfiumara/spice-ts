import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { InvalidCircuitError } from '../errors.js';

const k = 1.380649e-23;
const q = 1.602176634e-19;
const kelvin = 400.15;
const expectRelative = (actual: number, expected: number) => {
  expect(Math.abs(actual / expected - 1)).toBeLessThan(1e-6);
};

describe('non-nominal .noise temperature (#1161)', () => {
  it.each(['.options TEMP=127', '.temp 127'])('evaluates 4kTR at 400.15 K with %s', async temperature => {
    const result = await simulate(`resistor noise temperature
V1 in 0 AC 1
R1 in out 1k
${temperature}
.noise v(out) V1 dec 1 1k 1k
.end`);
    expectRelative(result.noise!.outputNoiseDensity[0] ** 2, 4 * k * kelvin * 1000);
    expectRelative(result.noise!.inputNoiseDensity[0] ** 2, 4 * k * kelvin * 1000);
  });

  it('evaluates diode shot noise at its temperature-adjusted bias current', async () => {
    // A forced junction current makes the analytic shot density independent of IS(T).
    const result = await simulate(`diode noise temperature
I1 0 out DC 1m AC 1
D1 out 0 DM
.model DM D(IS=1e-14)
.options TEMP=127
.noise v(out) I1 dec 1 1k 1k
.end`);
    expectRelative(result.noise!.inputNoiseDensity[0] ** 2, 2 * q * 1e-3);
  });

  it('evaluates BJT collector shot noise at its temperature-adjusted bias current', async () => {
    // Fix VBE and force IC; the ideal base supply shorts the base shot source.
    const result = await simulate(`bjt noise temperature
VB base 0 DC 0.4
I1 0 out DC 1m AC 1
Q1 out base 0 QM
.model QM NPN(IS=1e-14 BF=100 VAF=100 XTI=3 XTB=1.5 EG=1.11)
.options TEMP=127
.noise v(out) I1 dec 1 1k 1k
.end`);
    expectRelative(result.noise!.inputNoiseDensity[0] ** 2, 2 * q * 1e-3);
  });

  it('keeps non-temperature-aware MOS1 noise behind a typed error', async () => {
    await expect(simulate(`mos noise temperature
V1 gate 0 DC 2 AC 1
VDD drain 0 DC 5
M1 drain gate 0 0 MM W=10u L=1u
.model MM NMOS(LEVEL=1 VTO=0.7 KP=200u)
.options TEMP=127
.noise v(drain) V1 dec 1 1k 1k
.end`)).rejects.toMatchObject({
      name: new InvalidCircuitError('').name,
      message: expect.stringContaining('.noise does not support MOSFET noise at TEMP=127 C'),
    });
  });
});
