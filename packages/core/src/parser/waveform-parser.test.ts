import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CurrentSource } from '../devices/current-source.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';
import { parse } from './index.js';
import { parseSourceWaveform } from './waveform-parser.js';

describe('independent-source waveform grammar', () => {
  it.each([
    ['voltage', 'V1', VoltageSource],
    ['current', 'I1', CurrentSource],
  ] as const)('defaults an AC-only %s source magnitude and phase', (_kind, name, Source) => {
    const source = parse(`AC-only source\n${name} in 0 AC\n.ac lin 1 1k 1k`).compile()
      .devices.find(device => device.name === name);

    expect(source).toBeInstanceOf(Source);
    expect((source as VoltageSource | CurrentSource).waveform).toEqual({
      type: 'ac', dc: 0, magnitude: 1, phase: 0,
    });
  });

  it.each([
    ['V1 in 0 AC nope', 'V1 in 0 AC nope'],
    ['I1 in 0 AC 1 nope', 'I1 in 0 AC 1 nope'],
  ])('reports malformed AC source values as structured parse errors', (card, context) => {
    try {
      parse(`Malformed AC source\n${card}`);
      expect.fail('expected malformed AC source to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect(error).toMatchObject({ line: 2, context });
      expect((error as Error).message).toMatch(/Cannot parse number/);
      expect((error as Error).message).not.toMatch(/TypeError|reading 'trim'/);
    }
  });

  it('parses a transient SIN waveform after an explicit DC value', () => {
    expect(parseSourceWaveform(
      ['V1', 'in', '0', 'DC', '1.5', 'SIN', '(', '2', '3', '4k', '5u', '6', '7', ')'],
      3,
    )).toEqual({
      type: 'sin',
      dc: 1.5,
      offset: 2,
      amplitude: 3,
      frequency: 4e3,
      delay: 5e-6,
      damping: 6,
      phase: 7,
    });
  });

  it("accepts ngspice's SINE alias", () => {
    expect(parseSourceWaveform(
      ['V1', 'in', '0', 'dc', '0', 'sine', '(', '0', '0.3', '440', '0', '0', ')'],
      3,
    )).toEqual({
      type: 'sin',
      dc: 0,
      offset: 0,
      amplitude: 0.3,
      frequency: 440,
      delay: 0,
      damping: 0,
      phase: undefined,
    });
  });

  it('preserves standalone DC, PULSE, and PWL semantics', () => {
    expect(parseSourceWaveform(['V1', '1', '0', 'DC', '5'], 3)).toEqual({ type: 'dc', value: 5 });
    expect(parseSourceWaveform(
      ['V1', '1', '0', 'PULSE', '(', '0', '5', '1n', '2n', '3n', '4n', '5n', ')'],
      3,
    )).toEqual({
      type: 'pulse', v1: 0, v2: 5, delay: 1e-9, rise: 2e-9, fall: 3e-9,
      width: 4e-9, period: 5e-9,
    });
    expect(parseSourceWaveform(
      ['V1', '1', '0', 'PWL', '(', '0', '0', '1u', '1', ')'],
      3,
    )).toEqual({ type: 'pwl', points: [{ time: 0, value: 0 }, { time: 1e-6, value: 1 }] });
  });

  it('uses explicit DC for .op and the SIN waveform for .tran', async () => {
    const result = await simulate(`
      V1 in 0 DC 1.5 SIN(2 3 1k 0 0 0)
      R1 in 0 1k
      .op
      .tran 50u 250u
      .end
    `);

    // ngspice-47: `ngspice -b composed-dc-sin.cir` reports v(in)=1.5 V
    // for .op, then 2 V at t=0 and 5 V at t=250 us for .tran.
    expect(result.dc!.voltage('in')).toBeCloseTo(1.5, 12);
    expect(result.transient!.voltage('in')[0]).toBeCloseTo(2, 12);
    expect(result.transient!.voltage('in').at(-1)).toBeCloseTo(5, 12);
  });
});

describe('jimi-fuzz source regression', () => {
  it('compiles the exact public fixture input as a 440 Hz sine excitation', () => {
    const fixture = readFileSync(resolve(
      import.meta.dirname,
      '../../../../benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir',
    ), 'utf8');
    const source = parse(fixture).compile().devices.find(device => device.name === 'V_V2');

    expect(source).toBeInstanceOf(VoltageSource);
    expect((source as VoltageSource).waveform).toEqual({
      type: 'sin',
      dc: 0,
      offset: 0,
      amplitude: 0.3,
      frequency: 440,
      delay: 0,
      damping: 0,
      phase: undefined,
    });
    expect((source as VoltageSource).getVoltageAtTime(1 / (4 * 440))).toBeCloseTo(0.3, 12);
  });
});
