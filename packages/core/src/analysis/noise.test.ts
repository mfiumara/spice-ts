import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parseTitleless as parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

describe('.noise analysis', () => {
  const fixture = `
    V1 in 0 AC 1
    Rsource in n1 1k
    Eamp out 0 n1 0 10
    Rload out 0 10k
    .noise v(out) V1 lin 5 100 500
  `;

  it('parses the bounded ngspice-compatible linear form', () => {
    expect(parse(fixture).analyses).toEqual([{
      type: 'noise',
      outputNode: 'out',
      inputSource: 'V1',
      variation: 'lin',
      points: 5,
      startFreq: 100,
      stopFreq: 500,
    }]);
  });

  it('returns structured output- and input-referred resistor noise spectra', async () => {
    const result = await simulate(fixture);

    expect(result.noise).toBeDefined();
    expect(result.noise!.frequencies).toEqual([100, 200, 300, 400, 500]);
    expect(result.noise!.outputNode).toBe('out');
    expect(result.noise!.inputSource).toBe('V1');
    expect(result.noise!.outputNoiseDensity).toHaveLength(5);
    expect(result.noise!.inputNoiseDensity).toHaveLength(5);

    const ngspice47Output = 4.07137153e-8;
    const ngspice47Input = 4.07137153e-9;
    for (let i = 0; i < result.noise!.frequencies.length; i++) {
      expect(Math.abs(result.noise!.outputNoiseDensity[i] - ngspice47Output) / ngspice47Output)
        .toBeLessThan(2e-6);
      expect(Math.abs(result.noise!.inputNoiseDensity[i] - ngspice47Input) / ngspice47Input)
        .toBeLessThan(2e-6);
    }
  });

  it.each([
    ['dec', 3, 100, 10_000, [100, 215.44346900318834, 464.15888336127796, 1_000, 2_154.4346900318837, 4_641.588833612778, 10_000]],
    ['oct', 3, 100, 800, [100, 125.99210498948732, 158.74010519681994, 200, 251.98420997897463, 317.4802103936399, 400, 503.96841995794927, 634.9604207872798, 800]],
  ] as const)('matches the ngspice %s frequency grid', async (
    variation, points, startFreq, stopFreq, frequencies,
  ) => {
    const deck = fixture.replace('lin 5 100 500', `${variation} ${points} ${startFreq} ${stopFreq}`);

    expect(parse(deck).analyses[0]).toMatchObject({ variation, points, startFreq, stopFreq });
    const result = await simulate(deck);

    expect(result.noise!.frequencies).toHaveLength(frequencies.length);
    result.noise!.frequencies.forEach((frequency, index) => {
      expect(Math.abs(frequency - frequencies[index]) / frequencies[index]).toBeLessThan(1e-14);
    });
  });

  it('treats the logarithmic stop frequency as an upper bound without adding an off-grid endpoint', async () => {
    const result = await simulate(fixture.replace('lin 5 100 500', 'dec 3 100 500'));

    expect(result.noise!.frequencies).toHaveLength(3);
    expect(result.noise!.frequencies.at(-1)).toBeLessThanOrEqual(500);
  });

  it('matches ngspice stop-frequency tolerance at a logarithmic grid boundary', async () => {
    const result = await simulate(fixture.replace('lin 5 100 500', 'dec 1000 100 100.15'));

    expect(result.noise!.frequencies).toHaveLength(2);
    expect(result.noise!.frequencies[1]).toBeCloseTo(100.23052380778997, 12);
  });

  it.each([
    ['dec', 3, 100, 10_000, 4.050963523633458e-6, 4.050963523633458e-7],
    ['oct', 3, 100, 800, 1.077183656197215e-6, 1.077183656197215e-7],
  ] as const)('returns deterministic integrated totals for an ngspice %s sweep', async (
    variation, points, startFreq, stopFreq, outputTotal, inputTotal,
  ) => {
    const deck = fixture.replace('lin 5 100 500', `${variation} ${points} ${startFreq} ${stopFreq}`);

    const result = await simulate(deck);
    const repeated = await simulate(deck);

    expect(Math.abs(result.noise!.integratedOutputNoise! - outputTotal) / outputTotal)
      .toBeLessThan(2e-6);
    expect(Math.abs(result.noise!.integratedInputNoise! - inputTotal) / inputTotal)
      .toBeLessThan(2e-6);
    expect(repeated.noise!.integratedOutputNoise).toBe(result.noise!.integratedOutputNoise);
    expect(repeated.noise!.integratedInputNoise).toBe(result.noise!.integratedInputNoise);
  });

  it('matches ngspice log-log integration for frequency-dependent resistor noise', async () => {
    const result = await simulate(`
      V1 in 0 AC 1
      R1 in out 1k
      C1 out 0 1u
      .noise v(out) V1 dec 10 10 100k
    `);

    const ngspice47OutputTotal = 6.296943753110260e-8;
    const ngspice47InputTotal = 1.444117572560201e-6;
    expect(Math.abs(result.noise!.integratedOutputNoise! - ngspice47OutputTotal)
      / ngspice47OutputTotal).toBeLessThan(2e-6);
    expect(Math.abs(result.noise!.integratedInputNoise! - ngspice47InputTotal)
      / ngspice47InputTotal).toBeLessThan(2e-6);
  });

  it('omits integrated totals when ngspice does not create an integrated-noise plot', async () => {
    const result = await simulate(fixture.replace('lin 5 100 500', 'dec 3 100 100'));

    expect(result.noise!.frequencies).toEqual([100]);
    expect(result.noise!.integratedOutputNoise).toBeUndefined();
    expect(result.noise!.integratedInputNoise).toBeUndefined();
  });

  it.each([
    '.noise v(out,ref) V1 lin 5 100 500',
    '.noise i(V1) V1 dec 10 1 1Meg',
    '.noise v(out) V1 log 10 1 1Meg',
  ])('rejects noise forms outside the first bounded slice: %s', netlist => {
    expect(() => parse(netlist)).toThrow();
  });

  it('rejects .step combined with .noise instead of returning empty step results', () => {
    const deck = [
      'V1 in 0 AC 1',
      'Rsource in out 1k',
      '.noise v(out) V1 lin 5 100 500',
      '.step param Rsource list 1k 2k',
    ].join('\n');

    try {
      parse(deck);
      expect.unreachable('expected .step + .noise to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({
        line: 4,
        context: '.step param Rsource list 1k 2k',
      });
      expect((error as Error).message).toContain('.step cannot be combined with .noise');
    }
  });
});
