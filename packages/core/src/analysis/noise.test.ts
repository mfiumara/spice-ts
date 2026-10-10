import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, ParseError } from '../errors.js';
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

  const mosfetFixture = `
    VDD vdd 0 DC 5
    Vgate gate 0 DC 2 AC 1
    Rload vdd out 2k
    M1 out gate 0 0 NMOD W=10u L=1u
    .model NMOD NMOS (LEVEL=1 VTO=0.7 KP=200u LAMBDA=0.02 KF=1e-25 AF=1)
    .noise v(out) Vgate dec 3 10 10k
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

  it.each([
    ['lin', 5, 10, 10_000, 5, 2.703131156357947e-7, 5.386271250478095e-8, 7.099001808395031e-5, 1.41455028024496e-5],
    ['dec', 3, 10, 10_000, 10, 2.703131156357946e-7, 5.386271250478093e-8, 7.099001808395027e-5, 1.414550280244959e-5],
    ['oct', 3, 10, 10_000, 30, 2.997883785551307e-7, 5.973596659714284e-8, 6.991504265477001e-5, 1.393130271691006e-5],
  ] as const)('matches ngspice-47 MOS1 thermal plus KF/AF noise for %s', async (
    variation, points, start, stop, count, outputLast, inputLast, outputTotal, inputTotal,
  ) => {
    const deck = mosfetFixture.replace('dec 3 10 10k', `${variation} ${points} ${start} ${stop}`);
    expect(parse(deck).analyses[0]).toMatchObject({ variation, points, startFreq: start, stopFreq: stop });

    const result = await simulate(deck);
    const noise = result.noise!;
    expect(noise.frequencies).toHaveLength(count);
    expect(noise.outputNoiseDensity[0]).toBeCloseTo(8.540277088953039e-6, 11);
    expect(noise.inputNoiseDensity[0]).toBeCloseTo(1.701739438249188e-6, 11);
    expect(noise.outputNoiseDensity.at(-1)).toBeCloseTo(outputLast, 11);
    expect(noise.inputNoiseDensity.at(-1)).toBeCloseTo(inputLast, 11);
    expect(noise.integratedOutputNoise).toBeCloseTo(outputTotal, 10);
    expect(noise.integratedInputNoise).toBeCloseTo(inputTotal, 10);
  });

  it.each([
    ['unsupported model level', 'LEVEL=2', /only supports MOSFET level 1/i],
    ['unsupported noisy parasitic resistance', 'LEVEL=1 RD=10', /does not support MOSFET model parameter 'RD'/i],
    ['unsupported noise selector', 'LEVEL=1 NLEV=1', /only supports MOSFET NLEV=2/i],
  ])('rejects %s explicitly', async (_name, modelParameters, expected) => {
    const deck = mosfetFixture.replace(
      'LEVEL=1 VTO=0.7 KP=200u LAMBDA=0.02 KF=1e-25 AF=1',
      `${modelParameters} VTO=0.7 KP=200u LAMBDA=0.02 KF=1e-25 AF=1`,
    );
    await expect(simulate(deck)).rejects.toThrow(expected);
  });

  it('omits integrated totals when ngspice does not create an integrated-noise plot', async () => {
    const result = await simulate(fixture.replace('lin 5 100 500', 'dec 3 100 100'));

    expect(result.noise!.frequencies).toEqual([100]);
    expect(result.noise!.integratedOutputNoise).toBeUndefined();
    expect(result.noise!.integratedInputNoise).toBeUndefined();
  });

  it.each([
    ['diode', 'D1', `
      Vbias in 0 DC 1 AC 1
      R1 in out 1k
      D1 out 0 Dmod
      .model Dmod D
      .noise v(out) Vbias dec 3 100 10k
    `],
    ['BJT', 'Q1', `
      Vbias vcc 0 DC 5 AC 1
      Rbase vcc base 100k
      Rload vcc out 1k
      Q1 out base 0 Qmod
      .model Qmod NPN
      .noise v(out) Vbias dec 3 100 10k
    `],
    ['MOSFET', 'M1', `
      Vbias drain 0 DC 1 AC 1
      Vgate gate 0 DC 2
      M1 drain gate 0 0 Mmod
      .model Mmod NMOS (LEVEL=49 VTH0=1 U0=400 TOX=4n)
      .noise v(drain) Vbias dec 3 100 10k
    `],
  ])('explicitly rejects unsupported %s noise for %s', async (kind, name, deck) => {
    try {
      await simulate(deck);
      expect.unreachable(`expected ${kind} noise to be rejected`);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCircuitError);
      expect((error as Error).message).toContain(
        `.noise does not support ${kind} noise for '${name}'`,
      );
    }
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
