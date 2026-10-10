import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { parseTitleless as parse } from '../parser/index.js';
import { DistortionResult } from '../results.js';
import { simulate } from '../simulate.js';
import { Circuit } from '../circuit.js';

const fixture = readFileSync(new URL(
  '../../../../benchmarks/distortion/linear-lowpass.cir',
  import.meta.url,
), 'utf8');

describe('bounded .disto analysis', () => {
  it('parses the exact public single-tone DEC fixture', () => {
    expect(parse(fixture.split('\n').slice(1).join('\n')).analyses).toContainEqual({
      type: 'disto',
      variation: 'dec',
      points: 10,
      startFreq: 1e3,
      stopFreq: 1e6,
    });
  });

  it('returns deterministic typed second- and third-harmonic zero results', async () => {
    const result = await simulate(fixture);

    expect(result.distortion).toBeInstanceOf(DistortionResult);
    expect(result.distortion?.frequencies).toHaveLength(31);
    expect(result.distortion?.frequencies[0]).toBe(1e3);
    expect(result.distortion?.frequencies.at(-1)).toBe(1e6);
    expect(result.distortion?.voltage('2', 2)).toEqual(
      Array.from({ length: 31 }, () => ({ real: 0, imaginary: 0 })),
    );
    expect(result.distortion?.voltage('2', 3)).toEqual(
      Array.from({ length: 31 }, () => ({ real: 0, imaginary: 0 })),
    );
    expect(result.distortion?.current('V1', 2)).toHaveLength(31);
  });

  it('stops a DEC sweep at a non-integral-decade upper bound', async () => {
    const result = await simulate(`Non-integral DEC bound
V1 1 0 DC 0 DISTOF1 1
R1 1 0 1k
.disto dec 10 1k 1.8k`);

    expect(result.distortion?.frequencies).toEqual([
      1000,
      1000 * Math.pow(10, 1 / 10),
      1000 * Math.pow(10, 2 / 10),
    ]);
    expect(result.distortion?.frequencies.every(frequency => frequency <= 1800)).toBe(true);
  });

  it.each([
    ['scientific notation', '1e1', 10, 11],
    ['fractional value', '10.5', 11, 12],
  ])('uses ngspice numeric semantics for a %s DEC point count', async (
    _label, pointToken, points, frequencyCount,
  ) => {
    const netlist = `V1 1 0 DC 0 DISTOF1 1\nR1 1 0 1k\n.disto dec ${pointToken} 1k 10k`;
    expect(parse(netlist).analyses).toContainEqual({
      type: 'disto', variation: 'dec', points, startFreq: 1e3, stopFreq: 1e4,
    });

    const result = await simulate(`Point count semantics\n${netlist}`);
    expect(result.distortion?.frequencies).toHaveLength(frequencyCount);
  });

  it.each(['voltage', 'current'] as const)(
    'preserves distortion terms for a programmatic DC %s source',
    async (kind) => {
      const circuit = new Circuit();
      const waveform = {
        dc: 0,
        distortionF1: { magnitude: 1, phase: 15 },
        distortionF2: { magnitude: 0, phase: 0 },
      };
      if (kind === 'voltage') circuit.addVoltageSource('V1', 'in', '0', waveform);
      else circuit.addCurrentSource('I1', 'in', '0', waveform);
      circuit.addResistor('R1', 'in', '0', 1e3);
      circuit.addAnalysis('disto', {
        variation: 'dec', points: 10, startFreq: 1e3, stopFreq: 1e4,
      });

      const result = await simulate(circuit);
      expect(result.distortion?.frequencies).toHaveLength(11);
    },
  );

  it.each([
    ['.disto dec 10 1k 1Meg 0.9', 'Two-tone .disto is not supported; omit f2overf1'],
    ['.disto lin 10 1k 1Meg', "Unsupported .disto sweep; expected '.disto dec points start stop'"],
    ['.disto oct 10 1k 1Meg', "Unsupported .disto sweep; expected '.disto dec points start stop'"],
    ['.disto dec 0 1k 1Meg', 'Invalid .disto dec sweep'],
    ['.disto dec 10 0 1Meg', 'Invalid .disto dec sweep'],
    ['.disto dec 10 1Meg 1k', 'Invalid .disto dec sweep'],
  ])('rejects unsupported or invalid command form: %s', (directive, message) => {
    expect(() => parse(directive)).toThrow(message);
  });

  it('rejects stepped distortion in either directive order', () => {
    const device = 'V1 1 0 DC 0 DISTOF1 1\nR1 1 0 1k';
    expect(() => parse(`${device}\n.step param R1 list 1k 2k\n.disto dec 10 1k 1Meg`))
      .toThrow('.step cannot be combined with .disto');
    expect(() => parse(`${device}\n.disto dec 10 1k 1Meg\n.step param R1 list 1k 2k`))
      .toThrow('.step cannot be combined with .disto');
  });

  it('rejects stepped distortion in either programmatic builder order', () => {
    const distoFirst = new Circuit();
    distoFirst.addAnalysis('disto', {
      variation: 'dec', points: 10, startFreq: 1e3, stopFreq: 1e6,
    });
    expect(() => distoFirst.addStep('R1', { values: [1e3, 2e3] }))
      .toThrow('.step cannot be combined with .disto');

    const stepFirst = new Circuit();
    stepFirst.addStep('R1', { values: [1e3, 2e3] });
    expect(() => stepFirst.addAnalysis('disto', {
      variation: 'dec', points: 10, startFreq: 1e3, stopFreq: 1e6,
    })).toThrow('.step cannot be combined with .disto');
  });

  it('rejects multiple distortion analyses', () => {
    expect(() => parse('.disto dec 10 1k 1Meg\n.disto dec 10 1k 1Meg'))
      .toThrow('Multiple .disto analyses are not supported');
  });

  it('rejects a non-zero second tone explicitly', async () => {
    await expect(simulate(`Two-tone source\nV1 1 0 DC 0 DISTOF1 1 DISTOF2 0.1\nR1 1 0 1k\n.disto dec 10 1k 1Meg`))
      .rejects.toThrow("Two-tone .disto is not supported; source 'V1' has non-zero DISTOF2");
  });

  it('rejects semiconductor nonlinear distortion explicitly', async () => {
    await expect(simulate(`Diode distortion\nV1 1 0 DC 0 DISTOF1 1\nD1 1 0 DM\n.model DM D\n.disto dec 10 1k 1Meg`))
      .rejects.toThrow(InvalidCircuitError);
    await expect(simulate(`Diode distortion\nV1 1 0 DC 0 DISTOF1 1\nD1 1 0 DM\n.model DM D\n.disto dec 10 1k 1Meg`))
      .rejects.toThrow(".disto supports only independent sources and ideal R, L, C devices; found D1 (Diode)");
  });

  it('rejects linear devices outside the ideal RLC/source slice', async () => {
    await expect(simulate(`Controlled-source distortion
V1 in 0 DC 0 DISTOF1 1
E1 out 0 in 0 2
R1 out 0 1k
.disto dec 10 1k 1Meg`)).rejects.toThrow(
      '.disto supports only independent sources and ideal R, L, C devices; found E1 (VCVS)',
    );
  });

  it('rejects missing or multiple active single-tone excitations', async () => {
    await expect(simulate('No tone\nV1 1 0 DC 0\nR1 1 0 1k\n.disto dec 10 1k 1Meg'))
      .rejects.toThrow('.disto requires exactly one non-zero DISTOF1 excitation; found 0');
    await expect(simulate('Two tones\nV1 1 0 DC 0 DISTOF1 1\nV2 2 0 DC 0 DISTOF1 1\nR1 1 0 1k\nR2 2 0 1k\n.disto dec 10 1k 1Meg'))
      .rejects.toThrow('.disto requires exactly one non-zero DISTOF1 excitation; found V1, V2');
  });
});
