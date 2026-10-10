import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Circuit } from '../circuit.js';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parse } from '../parser/index.js';
import { PoleZeroResult } from '../results.js';
import { simulate } from '../simulate.js';

const fixture = (name: string): string => readFileSync(
  new URL(`../../../../benchmarks/pole-zero/${name}`, import.meta.url),
  'utf8',
);

const passiveFixture = fixture('passive-rlc.cir');
const voltageFixture = fixture('passive-rlc-voltage.cir');
const activeFixture = fixture('active-four-stage.cir');

describe('.pz analysis', () => {
  it('parses the bounded single-ended current-input form', () => {
    expect(parse(passiveFixture).poleZeroAnalyses).toEqual([{
      type: 'pz',
      inputPositive: '1',
      inputNegative: '0',
      outputPositive: '2',
      outputNegative: '0',
      inputType: 'cur',
      mode: 'pz',
    }]);
  });

  it('parses the bounded grounded voltage-input form', () => {
    expect(parse(voltageFixture).poleZeroAnalyses).toEqual([{
      type: 'pz',
      inputPositive: '1',
      inputNegative: '0',
      outputPositive: '2',
      outputNegative: '0',
      inputType: 'vol',
      mode: 'pz',
    }]);
  });

  it('matches ngspice 47 for the passive RLC fixture', async () => {
    const result = await simulate(passiveFixture);

    expect(result.poleZero).toBeInstanceOf(PoleZeroResult);
    expect(result.poleZero).toMatchObject({
      inputPositive: '1',
      inputNegative: '0',
      outputPositive: '2',
      outputNegative: '0',
    });
    expect(result.poleZero!.poles).toHaveLength(2);
    expect(result.poleZero!.zeros).toHaveLength(2);
    expect(result.poleZero!.poles).toEqual([
      { real: -499999999.99999994, imaginary: -499999999.99999994 },
      { real: -499999999.99999994, imaginary: 499999999.99999994 },
    ]);
    expect(result.poleZero!.zeros).toEqual([
      { real: 0, imaginary: 0 },
      { real: 0, imaginary: 0 },
    ]);
  });

  it('matches ngspice 47 for the passive grounded voltage-input fixture', async () => {
    const result = await simulate(voltageFixture);

    expect(result.poleZero).toBeDefined();
    expect(result.poleZero!.poles).toHaveLength(2);
    expect(result.poleZero!.zeros).toHaveLength(2);
    expect(relativeError(result.poleZero!.poles[0].real, -1e9)).toBeLessThan(1e-12);
    expect(result.poleZero!.poles[0].imaginary).toBe(0);
    expect(result.poleZero!.poles[1]).toEqual({ real: 0, imaginary: 0 });
    expect(result.poleZero!.zeros).toEqual([
      { real: 0, imaginary: 0 },
      { real: 0, imaginary: 0 },
    ]);
  });

  it('executes voltage-input poles-only mode without returning zeros', async () => {
    const result = await simulate(voltageFixture.replace('vol pz', 'vol pol'));

    expect(result.poleZero!.poles).toHaveLength(2);
    expect(result.poleZero!.zeros).toEqual([]);
  });

  it('rejects non-passive devices in the voltage-input slice', async () => {
    await expect(simulate(`unsupported voltage-input device
V1 in 0 0
R1 in out 1k
C1 out 0 1n
.pz in 0 out 0 vol pz`)).rejects.toThrow(
      '.pz vol supports only ideal R, L, C devices; found V1 (VoltageSource)',
    );
  });

  it('matches ngspice 47 for the active four-stage small-signal fixture', async () => {
    const result = await simulate(activeFixture);
    const expected = [-1.019524e9, -8.296965e8, -8.652054e7, -1.060594e7];

    expect(result.poleZero).toBeDefined();
    expect(result.poleZero!.zeros).toEqual([]);
    expect(result.poleZero!.poles).toHaveLength(expected.length);
    result.poleZero!.poles.forEach((pole, index) => {
      expect(relativeError(pole.real, expected[index])).toBeLessThan(1e-6);
      expect(pole.imaginary).toBe(0);
    });
  });

  it('returns deterministic pole and zero ordering', async () => {
    const first = await simulate(activeFixture);
    const second = await simulate(activeFixture);

    expect(second.poleZero).toEqual(first.poleZero);
    expect(first.poleZero!.poles.map(pole => pole.real)).toEqual(
      [...first.poleZero!.poles.map(pole => pole.real)].sort((a, b) => a - b),
    );
  });

  it.each([
    '.pz in ref out 0 cur pz',
    '.pz in 0 out ref cur pz',
    '.pz in ref out 0 vol pz',
    '.pz in 0 out ref vol pz',
    '.pz in 0 out 0 cur zer',
    '.pz in 0 out 0 vol zer',
    '.pz in 0 out 0 cur',
  ])('rejects .pz forms outside the bounded slice: %s', directive => {
    expect(() => parse(`unsupported pz form\n${directive}`)).toThrow(ParseError);
  });

  it('rejects an unknown terminal with a typed circuit error', async () => {
    await expect(simulate('unknown pz node\nR1 in 0 1k\n.pz missing 0 in 0 cur pol'))
      .rejects.toBeInstanceOf(InvalidCircuitError);
  });

  it('rejects .step combined with .pz instead of returning empty step results', () => {
    expect(() => parse(`${voltageFixture}\n.step param R1 list 1k 2k`))
      .toThrow(ParseError);
  });

  it('preserves the dynamic-order ceiling for voltage input', async () => {
    const devices = Array.from(
      { length: 13 },
      (_, index) => `R${index + 1} n${index + 1} 0 1k\nC${index + 1} n${index + 1} 0 1n`,
    ).join('\n');

    await expect(simulate(`voltage-input order ceiling
${devices}
.pz n1 0 n13 0 vol pol`)).rejects.toThrow(
      '.pz dynamic order 13 exceeds bounded limit 12',
    );
  });

  it('rejects a programmatic .pz with a non-ground input reference', () => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: 'ref',
      outputPositive: 'out',
      outputNegative: '0',
      inputType: 'cur',
      mode: 'pz',
    })).toThrow(InvalidCircuitError);
  });

  it('rejects a programmatic .pz with a non-ground output reference', () => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: '0',
      outputPositive: 'out',
      outputNegative: 'ref',
      inputType: 'cur',
      mode: 'pz',
    })).toThrow(InvalidCircuitError);
  });

  it('accepts the bounded voltage-input form programmatically', () => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: '0',
      outputPositive: 'out',
      outputNegative: '0',
      inputType: 'vol',
      mode: 'pol',
    })).not.toThrow();
  });

  it.each([
    { inputType: 'wat' },
    {},
  ])('rejects a programmatic .pz with invalid or missing inputType: $inputType', params => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: '0',
      outputPositive: 'out',
      outputNegative: '0',
      mode: 'pz',
      ...params,
    } as never)).toThrow(InvalidCircuitError);
  });

  it('rejects a programmatic .step combined with .pz', () => {
    const circuit = parse(passiveFixture);

    expect(() => circuit.addStep('R1', { values: [1000, 2000] }))
      .toThrow(InvalidCircuitError);
  });
});

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}
