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
    // ngspice-47 prints pole(1) = -5e8 + 5e8j, pole(2) = -5e8 - 5e8j.
    const [first, second] = result.poleZero!.poles;
    expect(relativeError(first.real, -5e8)).toBeLessThan(1e-12);
    expect(relativeError(first.imaginary, 5e8)).toBeLessThan(1e-12);
    expect(second).toEqual({ real: first.real, imaginary: -first.imaginary });
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

  it('rejects a voltage input shorted by a DC voltage source, as ngspice-47 does', async () => {
    // ngspice-47: "The input signal is shorted on the way to the output".
    await expect(simulate(`input shorted by a dc source
V1 in 0 0
R1 in out 1k
C1 out 0 1n
.pz in 0 out 0 vol pz`)).rejects.toThrow('.pz transfer is identically zero');
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
    '.pz in 0 out 0 cur',
    '.pz in 0 out 0 amp pz',
    '.pz in 0 out 0 cur both',
  ])('rejects malformed .pz forms: %s', directive => {
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

  it('accepts a programmatic .pz with differential input and output references', () => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: 'ref',
      outputPositive: 'out',
      outputNegative: 'oref',
      inputType: 'cur',
      mode: 'zer',
    })).not.toThrow();
  });

  it('rejects a programmatic .pz with an empty terminal name', () => {
    const circuit = new Circuit();

    expect(() => circuit.addAnalysis('pz', {
      inputPositive: 'in',
      inputNegative: '',
      outputPositive: 'out',
      outputNegative: '0',
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

// Stress circuits for the eigenvalue root-finder (#451). Expected values are
// `ngspice -b` (ngspice-47) output on the identical netlist, printed to 6-7
// significant digits, in ngspice's order.
type Root = { real: number; imaginary: number };
const root = (real: number, imaginary = 0): Root => ({ real, imaginary });

function expectNgspiceRoots(actual: readonly Root[], expected: readonly Root[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    const scale = Math.hypot(value.real, value.imaginary);
    const distance = Math.hypot(actual[index].real - value.real, actual[index].imaginary - value.imaginary);
    if (scale === 0) expect(actual[index]).toEqual({ real: 0, imaginary: 0 });
    // 1e-5 relative: just above ngspice's 6-significant-digit print rounding.
    else expect(distance / scale).toBeLessThan(1e-5);
  });
}

const CASCADE_FOUR = `four-stage cascade, current-input pole-zero
iin 1 0 ac
r1 1 0 1.019524e+9
l1 1 0 1H
gm2 2 0 1 0 1
r2 2 0 8.296965e+08
l2 2 0 1H
gm3 3 0 2 0 1
r3 3 0 8.652054e+07
l3 3 0 1H
gm4 4 0 3 0 1
r4 4 0 1.060594e+07
l4 4 0 1H
.pz 1 0 4 0 cur pz
.end`;

describe('.pz eigenvalue root-finder against ngspice-47 (#451)', () => {
  it('keeps every pole of a unilateral cascade and its four exact zeros at the origin', async () => {
    const { poleZero } = await simulate(CASCADE_FOUR);
    expectNgspiceRoots(poleZero!.poles, [root(-1.01952e9), root(-8.29696e8), root(-8.65205e7), root(-1.06059e7)]);
    expectNgspiceRoots(poleZero!.zeros, [root(0), root(0), root(0), root(0)]);
  });

  it('resolves a triple pole exactly', async () => {
    const { poleZero } = await simulate(`three-stage cascade with a triple pole
iin 1 0 ac
r1 1 0 1
l1 1 0 0.05H
gm2 2 0 1 0 1
r2 2 0 1
l2 2 0 0.05H
gm3 3 0 2 0 1
r3 3 0 1
l3 3 0 0.05H
.pz 1 0 3 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-20), root(-20), root(-20)]);
    expectNgspiceRoots(poleZero!.zeros, [root(0), root(0), root(0)]);
  });

  it('returns no spurious zeros for a relative-degree-4 RC ladder spanning six decades', async () => {
    const { poleZero } = await simulate(`rc ladder wide spread
r1 1 2 1k
c1 2 0 1u
r2 2 3 10k
c2 3 0 1n
r3 3 4 100k
c3 4 0 1p
r4 4 5 1meg
c4 5 0 10f
r0 1 0 1k
.pz 1 0 5 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-1.0111e8), root(-9.90033e6), root(-99998.6), root(-499.497)]);
    expect(poleZero!.zeros).toEqual([]);
  });

  it('handles henries next to picofarads and lists conjugate pairs like ngspice', async () => {
    const { poleZero } = await simulate(`mixed units L and C
r1 1 0 50
l1 1 2 1
c1 2 0 1p
r2 2 0 1meg
c2 1 3 10p
r3 3 0 1k
.pz 1 0 3 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-9.52381e7), root(-5.00025e5, 8.660399e5), root(-5.00025e5, -8.66040e5)]);
    expectNgspiceRoots(poleZero!.zeros, [root(-5e5, 8.660254e5), root(-5e5, -8.66025e5), root(0)]);
  });

  it('orders two complex pole pairs like ngspice', async () => {
    const { poleZero } = await simulate(`two complex pairs
r1 1 0 1k
l1 1 2 1m
c1 2 0 1n
r2 2 3 10
l2 3 4 10u
c2 4 0 10p
r3 4 0 1k
.pz 1 0 4 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [
      root(-5.00049e7, 8.718076e7), root(-5.00049e7, -8.71808e7),
      root(-995051, 999889.3), root(-995051, -999889),
    ]);
    expect(poleZero!.zeros).toEqual([]);
  });

  it('drops the non-dynamic mode of a capacitor across a voltage source', async () => {
    const { poleZero } = await simulate(`cap across vsource plus rc
v1 4 0 0
c0 4 0 1n
r1 1 0 1k
r2 1 2 1k
c1 2 0 1n
r3 2 4 1k
c2 1 2 2n
.pz 1 0 2 0 cur pz
.end`);
    expectNgspiceRoots(poleZero!.poles, [root(-2.36603e6), root(-633975)]);
    expectNgspiceRoots(poleZero!.zeros, [root(-5e5)]);
  });
});

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}
