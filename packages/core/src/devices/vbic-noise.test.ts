import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { VBIC, resolveVBICParams } from './vbic.js';

const fixture = readFileSync(new URL('../../../../benchmarks/corpus/corpus-f/fixtures/tests/vbic/noise_scale_test.cir', import.meta.url), 'utf8');

// ngspice-47 -b -r reference.raw <unchanged fixture>; binary raw densities.
const reference = [
  [0, 8.63202693484797e-7, 2.5702967020311176e-7],
  [25, 1.546234554371405e-7, 1.9039440028548363e-8],
  [50, 1.2110093542200478e-7, 1.455559122013996e-8],
  [75, 1.1301100295234057e-7, 1.446926726514407e-8],
  [100, 3.145908204470895e-8, 1.4358174709620236e-8],
  [125, 3.673491472962354e-9, 9.876198888975202e-9],
];

describe('VBIC noise (#1197)', () => {
  it('defaults to zero flicker and rejects invalid noise parameters', () => {
    expect(resolveVBICParams({}, 1)).toMatchObject({ KFN: 0, AFN: 1, BFN: 1 });
    for (const name of ['KFN', 'AFN', 'BFN']) {
      for (const value of [-1, NaN, Infinity]) {
        expect(() => resolveVBICParams({ [name]: value }, 1)).toThrow(`'${name}'`);
      }
    }
  });

  for (const polarity of [1, -1]) {
    it(`uses per-multiplier current, not per-area current, for AFN (${polarity})`, () => {
      const params = { KFN: 2e-12, AFN: 1.3 };
      const solution = Float64Array.from([1, 1, 0.65, 0.65, 0, 1, 0], v => polarity * v);
      const one = new VBIC('Q1', [0, 1, 2, 3, 4, 5, 6], params, polarity);
      const scaled = new VBIC('Q2', [0, 1, 2, 3, 4, 5, 6], params, polarity, 6, 3);
      const base = one.noiseOperatingPoint(solution, 0).find(s => s.positive === 3)!;
      const multiplied = scaled.noiseOperatingPoint(solution, 0).find(s => s.positive === 3)!;
      expect(multiplied.shotCurrent / base.shotCurrent).toBeCloseTo(6, 12);
      expect(multiplied.flickerCoefficient / base.flickerCoefficient).toBeCloseTo(3 * 2 ** 1.3, 12);
      const off = one.noiseOperatingPoint(new Float64Array(7), 0).find(s => s.positive === 3)!;
      expect(off.flickerCoefficient / (params.KFN * (1e-38 ** params.AFN))).toBeCloseTo(1, 12);
    });
  }

  it('applies BFN to flicker power, with separate shot and flicker integration', async () => {
    const deck = (coefficient: number) => `VBIC exponent
VCC cc 0 2
VIN in 0 0.65 AC 1
RB in b 100k
RC cc c 1k
Q1 c b 0 QV
.model QV NPN(LEVEL=4 KFN=${coefficient} AFN=1.3 BFN=1.4)
.noise v(c) VIN lin 2 10 100
.end`;
    const quiet = (await simulate(deck(0))).noise!;
    const noisy = (await simulate(deck(1e-10))).noise!;
    const power = noisy.outputNoiseDensity.map((density, i) =>
      density ** 2 - quiet.outputNoiseDensity[i] ** 2);
    expect(power[0] / power[1]).toBeCloseTo(10 ** 1.4, 8);
  });

  it('keeps differential semiconductor outputs explicitly unsupported', async () => {
    await expect(simulate(fixture.replace('v(vout) V2', 'v(vout,Q1_E) V2')))
      .rejects.toThrow('.noise differential voltage output only supports resistor noise');
  });

  it('matches the unchanged corpus-f noise_scale_test against ngspice-47', async () => {
    const noise = (await simulate(fixture)).noise!;
    expect(noise.frequencies).toHaveLength(126);
    for (const [index, output, input] of reference) {
      expect(noise.outputNoiseDensity[index] / output).toBeCloseTo(1, 5);
      expect(noise.inputNoiseDensity[index] / input).toBeCloseTo(1, 5);
    }
    expect(noise.integratedOutputNoise! / 0.0002486000039251267).toBeCloseTo(1, 5);
    expect(noise.integratedInputNoise! / 0.0001292645963700703).toBeCloseTo(1, 5);
  });
});
