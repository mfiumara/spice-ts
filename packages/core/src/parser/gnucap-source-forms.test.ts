import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CurrentSource } from '../devices/current-source.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

const fixtures = {
  dcEqualsAc: {
    path: '../../../../benchmarks/corpus/corpus-e/fixtures/tests/opamp-ol.ckt',
    sha256: '92e47652dbecdbd2c971cce3c047fc0b8e4a0406a7d2c953dffce299c60b183c',
    card: 'vin 1 0 dc=0 ac=.5',
  },
  pulseAc: {
    path: '../../../../benchmarks/corpus/corpus-e/fixtures/tests/d_cap.1.ckt',
    sha256: '2c0864497272439baa44213381271915107ccd9f8c47354df2e4b9c3028a1608',
    card: 'v1 1 0 dc pulse(0 1 0 .01 .01 1k 1k) ac 1',
  },
  unparenthesizedPwl: {
    path: '../../../../benchmarks/corpus/corpus-e/fixtures/tests/oscillator.1.ckt',
    sha256: '020684099d172ec7cc2a6fe3d57792ef51b3d9162f41f83ed486704062d6d702',
    card: 'i1 1 0 pwl 0 5 .1 0',
  },
} as const;

function unchangedCard(fixture: typeof fixtures[keyof typeof fixtures]): string {
  const bytes = readFileSync(resolve(import.meta.dirname, fixture.path));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
  expect(bytes.toString('utf8').split(/\r?\n/)).toContain(fixture.card);
  return fixture.card;
}

describe('Gnucap independent-source value forms', () => {
  it('parses dc=<value> with a coexisting AC excitation from the pinned fixture', () => {
    const card = unchangedCard(fixtures.dcEqualsAc);
    const source = parse(`Gnucap dc= source\n${card}`).compile().devices[0];

    expect(source).toBeInstanceOf(VoltageSource);
    expect((source as VoltageSource).waveform).toEqual({
      type: 'ac', dc: 0, magnitude: 0.5, phase: 0,
    });
  });

  it('executes dc=<value> and AC terms from the same unchanged source card', async () => {
    const card = unchangedCard(fixtures.dcEqualsAc);
    const result = await simulate(`Gnucap dc= source\n${card}\nr1 1 0 1\n.op\n.ac lin 1 1k 1k`);

    expect(result.dc!.voltage('1')).toBeCloseTo(0, 12);
    expect(result.ac!.voltage('1')[0].magnitude).toBeCloseTo(0.5, 12);
  });

  it('parses the combined DC, PULSE, and AC fixture source without dropping a term', () => {
    const card = unchangedCard(fixtures.pulseAc);
    const source = parse(`Gnucap pulse/AC source\n${card}`).compile().devices[0];

    expect(source).toBeInstanceOf(VoltageSource);
    expect((source as VoltageSource).waveform).toEqual({
      type: 'pulse',
      v1: 0,
      v2: 1,
      delay: 0,
      rise: 0.01,
      fall: 0.01,
      width: 1000,
      period: 1000,
      ac: { magnitude: 1, phase: 0 },
    });
  });

  it('executes the transient and AC terms from the same unchanged PULSE source card', async () => {
    const card = unchangedCard(fixtures.pulseAc);
    const result = await simulate(
      `Gnucap pulse/AC source\n${card}\nr1 1 0 1\n.op\n.ac lin 1 1k 1k\n.tran .01 .1`,
    );

    expect(result.dc!.voltage('1')).toBeCloseTo(0, 12);
    expect(result.ac!.voltage('1')[0].magnitude).toBeCloseTo(1, 12);
    expect(result.transient!.voltage('1').at(-1)).toBeCloseTo(1, 12);
  });

  it('parses the unparenthesized PWL source from the pinned fixture', () => {
    const card = unchangedCard(fixtures.unparenthesizedPwl);
    const source = parse(`Gnucap PWL source\n${card}`).compile().devices[0];

    expect(source).toBeInstanceOf(CurrentSource);
    expect((source as CurrentSource).waveform).toEqual({
      type: 'pwl',
      points: [{ time: 0, value: 5 }, { time: 0.1, value: 0 }],
    });
  });

  it('executes the unchanged unparenthesized PWL source card', async () => {
    const card = unchangedCard(fixtures.unparenthesizedPwl);
    const result = await simulate(`Gnucap PWL source\n${card}\nr1 1 0 1\n.tran .05 .1`);
    const voltage = result.transient!.voltage('1');

    expect(voltage[0]).toBeCloseTo(-5, 12);
    expect(voltage.at(-1)).toBeCloseTo(0, 12);
  });

  it.each([
    ['V1 1 0 DC=', /Cannot parse number/],
    ['V1 1 0 DC PULSE(0 1 0 .01 .01 1 1) AC 1 extra', /Cannot parse number/],
    ['I1 1 0 PWL 0 5 .1', /PWL.*complete time\/value pairs/i],
    ['I1 1 0 PWL(0 5 .1 0) R=1u', /Unsupported PWL source parameters/],
  ])('keeps malformed source diagnostics strict for %s', (card, diagnostic) => {
    try {
      parse(`Malformed Gnucap source\n${card}`);
      expect.fail('expected malformed source to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({ line: 2, context: card });
      expect((error as Error).message).toMatch(diagnostic);
    }
  });
});
