import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parse } from '../parser/index.js';
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
    '.noise v(out) V1 dec 10 1 1Meg',
    '.noise v(out,ref) V1 lin 5 100 500',
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
