import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const twoToneFixture = readFileSync(new URL(
  '../../../../benchmarks/distortion/two-tone-linear-lowpass.cir',
  import.meta.url,
), 'utf8');
const diodeFixture = readFileSync(new URL(
  '../../../../benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir',
  import.meta.url,
), 'utf8');

describe('bounded .disto analysis', () => {
  it('solves the unchanged classic nonlinear diode fixture', async () => {
    expect(createHash('sha256').update(diodeFixture).digest('hex'))
      .toBe('912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8');

    const result = await simulate(diodeFixture);

    expect(result.distortion?.frequencies).toHaveLength(101);
    expect(result.distortion?.products).toEqual(['f1+f2', 'f1-f2', '2f1-f2']);
    expectComplexParity(result.distortion!.voltage('2', 'f1+f2')[0], {
      real: 6.845350252530698e-8,
      imaginary: -1.132991157211438e-13,
    });
    expectComplexParity(result.distortion!.voltage('2', 'f1-f2')[0], {
      real: 6.845350252542094e-8,
      imaginary: -5.963111353751071e-15,
    });
    expectComplexParity(result.distortion!.voltage('2', '2f1-f2')[0], {
      real: -7.827394766197276e-11,
      imaginary: 8.52495833193369e-17,
    });
  });

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
    expect(result.distortion?.products).toEqual([2, 3]);
  });

  it('returns all three ngspice two-tone products for the exact public DEC fixture', async () => {
    expect(parse(twoToneFixture.split('\n').slice(1).join('\n')).analyses).toContainEqual({
      type: 'disto',
      variation: 'dec',
      points: 10,
      startFreq: 1e3,
      stopFreq: 1e6,
      f2OverF1: 0.9,
    });

    const result = await simulate(twoToneFixture);
    expect(result.distortion?.f2OverF1).toBe(0.9);
    expect(result.distortion?.products).toEqual(['f1+f2', 'f1-f2', '2f1-f2']);
    for (const product of ['f1+f2', 'f1-f2', '2f1-f2'] as const) {
      expect(result.distortion?.voltage('2', product)).toEqual(
        Array.from({ length: 31 }, () => ({ real: 0, imaginary: 0 })),
      );
      expect(result.distortion?.current('V1', product)).toHaveLength(31);
    }
    expect(() => result.distortion?.voltage('2', 2))
      .toThrow('Distortion product 2 is unavailable for this analysis');
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

  it('preserves a bounded two-tone ratio through the programmatic builder', () => {
    const circuit = new Circuit();
    circuit.addAnalysis('disto', {
      variation: 'dec', points: 10, startFreq: 1e3, stopFreq: 1e6, f2OverF1: 0.9,
    });

    expect(circuit.analyses).toContainEqual({
      type: 'disto', variation: 'dec', points: 10,
      startFreq: 1e3, stopFreq: 1e6, f2OverF1: 0.9,
    });
    expect(circuit.toNetlist()).toContain('.disto dec 10 1000 1000000 0.9');
  });

  it.each([
    ['.disto lin 10 1k 1Meg', "Unsupported .disto sweep; expected '.disto dec points start stop'"],
    ['.disto oct 10 1k 1Meg', "Unsupported .disto sweep; expected '.disto dec points start stop'"],
    ['.disto dec 10 1k 1Meg 0', 'Invalid .disto f2overf1; expected a value greater than 0 and less than 1'],
    ['.disto dec 10 1k 1Meg 1', 'Invalid .disto f2overf1; expected a value greater than 0 and less than 1'],
    ['.disto dec 10 1k 1Meg 0.9 extra', "Unsupported .disto sweep; expected '.disto dec points start stop [f2overf1]'"],
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

  it('rejects a non-zero second tone without a two-tone command explicitly', async () => {
    await expect(simulate(`Two-tone source\nV1 1 0 DC 0 DISTOF1 1 DISTOF2 0.1\nR1 1 0 1k\n.disto dec 10 1k 1Meg`))
      .rejects.toThrow("Non-zero DISTOF2 on source 'V1' requires .disto f2overf1");
  });

  it('requires exactly one valid F2 excitation for a two-tone command', async () => {
    await expect(simulate('Missing F2\nV1 1 0 DISTOF1 1\nR1 1 0 1k\n.disto dec 10 1k 1Meg 0.9'))
      .rejects.toThrow('.disto two-tone requires exactly one non-zero DISTOF2 excitation; found 0');
    await expect(simulate('Invalid F2\nV1 1 0 DISTOF1 1 DISTOF2 -1\nR1 1 0 1k\n.disto dec 10 1k 1Meg 0.9'))
      .rejects.toThrow("Invalid DISTOF2 excitation on source 'V1'");
    await expect(simulate('Multiple F2\nV1 1 0 DISTOF1 1 DISTOF2 1\nI1 1 0 DISTOF2 1\nR1 1 0 1k\n.disto dec 10 1k 1Meg 0.9'))
      .rejects.toThrow('.disto two-tone requires exactly one non-zero DISTOF2 excitation; found V1, I1');
  });

  it('returns nonlinear second- and third-harmonic diode products', async () => {
    const result = await simulate(`Single-tone diode distortion
V1 in 0 DC 5 DISTOF1 0.01
D1 in out DM
R1 out 0 1k
.model DM D IS=1e-14 TT=0.1n CJO=2p
.disto dec 1 1k 1k`);

    expect(result.distortion?.products).toEqual([2, 3]);
    expect(result.distortion?.frequencies).toEqual([1000]);
    // ngspice-47 batch run of the byte-identical deck.
    expectComplexParity(result.distortion!.voltage('out', 2)[0], {
      real: 3.4226751262641196e-8,
      imaginary: -5.963111353742677e-14,
    });
    expectComplexParity(result.distortion!.voltage('out', 3)[0], {
      real: -2.60913158871938e-11,
      imaginary: 7.749962119917151e-17,
    });
  });

  it('matches ngspice diode harmonics with reactive loading across a DEC sweep', async () => {
    const result = await simulate(`Single-tone diode distortion with reactive load
V1 in 0 DC 0.6 DISTOF1 0.01
D1 in out DM
R1 out 0 100
C1 out 0 1n
.model DM D IS=1e-14 TT=1n CJO=5p
.disto dec 2 1k 1e8
.end`);

    expect(result.distortion?.frequencies).toHaveLength(11);
    // ngspice-47 batch run of the byte-identical deck, first and last DEC points.
    expectComplexParity(result.distortion!.voltage('out', 2)[0], {
      real: 1.3557635040997078e-4,
      imaginary: -8.685236100923503e-8,
    });
    expectComplexParity(result.distortion!.voltage('out', 2)[10], {
      real: 3.306342655299164e-6,
      imaginary: -2.388191246910102e-6,
    });
    expectComplexParity(result.distortion!.voltage('out', 3)[0], {
      real: 1.6793269377960955e-6,
      imaginary: 2.9851196750823144e-9,
    });
    expectComplexParity(result.distortion!.voltage('out', 3)[10], {
      real: 1.9748489286944552e-7,
      imaginary: -9.731815597724925e-8,
    });
  });

  it.each([
    ['non-default model field', '', 'N=2', "model parameter N"],
    ['instance geometry', 'AREA=2', '', 'default instance geometry'],
    ['series resistance', '', 'RS=1', 'series resistance'],
  ])('rejects unsupported diode %s explicitly', async (
    _label, instanceField, modelField, message,
  ) => {
    await expect(simulate(`Unsupported diode distortion
V1 in 0 DC 5 DISTOF1 0.01
D1 in out DM ${instanceField}
R1 out 0 1k
.model DM D IS=1e-14 ${modelField}
.disto dec 1 1k 1k`)).rejects.toThrow(message);
  });

  it('rejects nonlinear devices outside the bounded diode slice', async () => {
    const netlist = `BJT distortion
V1 c 0 DC 5 DISTOF1 1
V2 b 0 DC 0.7
Q1 c b 0 QM
.model QM NPN
.disto dec 10 1k 1Meg`;
    await expect(simulate(netlist)).rejects.toThrow(InvalidCircuitError);
    await expect(simulate(netlist)).rejects.toThrow(
      '.disto supports only independent sources, ideal R, L, C devices, and bounded diodes; found Q1 (BJT)',
    );
  });

  it('rejects linear devices outside the ideal RLC/source slice', async () => {
    await expect(simulate(`Controlled-source distortion
V1 in 0 DC 0 DISTOF1 1
E1 out 0 in 0 2
R1 out 0 1k
.disto dec 10 1k 1Meg`)).rejects.toThrow(
      '.disto supports only independent sources, ideal R, L, C devices, and bounded diodes; found E1 (VCVS)',
    );
  });

  it('rejects missing or multiple active single-tone excitations', async () => {
    await expect(simulate('No tone\nV1 1 0 DC 0\nR1 1 0 1k\n.disto dec 10 1k 1Meg'))
      .rejects.toThrow('.disto requires exactly one non-zero DISTOF1 excitation; found 0');
    await expect(simulate('Two tones\nV1 1 0 DC 0 DISTOF1 1\nV2 2 0 DC 0 DISTOF1 1\nR1 1 0 1k\nR2 2 0 1k\n.disto dec 10 1k 1Meg'))
      .rejects.toThrow('.disto requires exactly one non-zero DISTOF1 excitation; found V1, V2');
  });
});

function expectComplexParity(
  actual: { real: number; imaginary: number },
  expected: { real: number; imaginary: number },
): void {
  const error = Math.hypot(
    actual.real - expected.real,
    actual.imaginary - expected.imaginary,
  );
  expect(error / Math.max(Math.hypot(expected.real, expected.imaginary), 1e-15))
    .toBeLessThan(0.005);
}
