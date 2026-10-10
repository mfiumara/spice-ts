import { describe, expect, it } from 'vitest';
import { Circuit } from '../circuit.js';
import { InvalidCircuitError, ParseError } from '../errors.js';
import { parse } from '../parser/index.js';
import { SensitivityResult } from '../results.js';
import { simulate } from '../simulate.js';

const dcDivider = `DC sensitivity divider
V1 in 0 1
R1 in out 1k
R2 out 0 2k
.sens V(out)
.end
`;

const acRlc = `AC sensitivity RLC
V1 in 0 DC 0 AC 1
R1 in mid 100
L1 mid out 10m
C1 out 0 1u
R2 out 0 1k
.sens V(out) AC DEC 2 10 1k
.end
`;

const acCurrentRc = `AC current-source sensitivity RC
I1 0 out DC 0 AC 1m
R1 out 0 2k
C1 out 0 1u
.sens V(out) AC DEC 2 10 1k
.end
`;

describe('.sens analysis', () => {
  it('parses the bounded single-node DC and AC forms', () => {
    expect(parse(dcDivider).analyses.at(-1)).toEqual({
      type: 'sens',
      outputNode: 'out',
      mode: 'dc',
    });
    expect(parse(acRlc).analyses.at(-1)).toEqual({
      type: 'sens',
      outputNode: 'out',
      mode: 'ac',
      variation: 'dec',
      points: 2,
      startFreq: 10,
      stopFreq: 1000,
    });
  });

  it('returns ngspice-compatible DC primary-value sensitivities in deterministic order', async () => {
    const first = await simulate(dcDivider);
    const second = await simulate(dcDivider);

    expect(first.sensitivity).toBeInstanceOf(SensitivityResult);
    expect(first.sensitivity).toEqual(second.sensitivity);
    expect(first.sensitivity!.entries.map(entry => entry.device)).toEqual(['R1', 'R2', 'V1']);
    expect(first.sensitivity!.entries.map(entry => entry.parameter)).toEqual([
      'resistance', 'resistance', 'dc',
    ]);
    expect(first.sensitivity!.entries[0].dc).toBeCloseTo(-2.222222222e-4, 10);
    expect(first.sensitivity!.entries[1].dc).toBeCloseTo(1.111111111e-4, 10);
    expect(first.sensitivity!.entries[2].dc).toBeCloseTo(2 / 3, 8);
  });

  it('returns deterministic complex AC sensitivities for RLC primary values', async () => {
    const result = await simulate(acRlc);

    expect(result.sensitivity).toMatchObject({
      outputNode: 'out',
      mode: 'ac',
      frequencies: [10, 31.622776601683796, 100, 316.2277660168379, 1000],
    });
    expect(result.sensitivity!.entries.map(entry => entry.device)).toEqual([
      'C1', 'L1', 'R1', 'R2', 'V1',
    ]);
    for (const entry of result.sensitivity!.entries) {
      expect(entry.ac).toHaveLength(result.sensitivity!.frequencies.length);
      expect(entry.ac!.every(value => Number.isFinite(value.real) && Number.isFinite(value.imaginary)))
        .toBe(true);
    }
  });

  it('includes one AC-form current source magnitude in deterministic AC results', async () => {
    const first = await simulate(acCurrentRc);
    const second = await simulate(acCurrentRc);

    expect(first.sensitivity).toEqual(second.sensitivity);
    expect(first.sensitivity!.entries.map(entry => `${entry.device}.${entry.parameter}`)).toEqual([
      'C1.capacitance', 'I1.acMagnitude', 'R1.resistance',
    ]);
    const sourceSensitivity = first.sensitivity!.entries[1].ac!;
    expect(sourceSensitivity[0].real).toBeGreaterThan(1900);
    expect(sourceSensitivity.at(-1)!.imaginary).toBeLessThan(-100);
    expect(sourceSensitivity.every(value =>
      Number.isFinite(value.real) && Number.isFinite(value.imaginary))).toBe(true);
  });

  it('includes an active controlled-source gain in AC ordering', async () => {
    const result = await simulate(`active small-signal sensitivity
V1 in 0 DC 0 AC 1
G1 out 0 in 0 1m
R1 out 0 1k
.sens V(out) AC DEC 1 10 100
.end`);

    expect(result.sensitivity!.entries.map(entry => entry.device)).toEqual(['G1', 'R1', 'V1']);
    for (const value of result.sensitivity!.entries[0].ac!) {
      expect(value.real).toBeCloseTo(-1000, 5);
      expect(value.imaginary).toBeCloseTo(0, 10);
    }
  });

  it('rejects multiple non-zero AC excitations instead of differentiating only the first', async () => {
    const failure = simulate(`multiple AC sensitivity excitations
V1 in 0 DC 0 AC 1
V2 out 0 DC 0 AC 2
R1 in out 1k
R2 out 0 1k
.sens V(out) AC DEC 1 1 10
.end`);
    await expect(failure).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(failure).rejects.toThrow(
      new InvalidCircuitError('.sens AC supports at most one non-zero AC excitation; found V1, V2'),
    );
  });

  it('rejects a zero AC source before the active source instead of using the zero source', async () => {
    const failure = simulate(`zero AC source before active sensitivity excitation
V1 in 0 DC 0 AC 0
V2 out 0 DC 0 AC 2
R1 in out 1k
R2 out 0 1k
.sens V(out) AC DEC 1 1 10
.end`);
    await expect(failure).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(failure).rejects.toThrow(
      new InvalidCircuitError('.sens AC supports only one AC-form voltage source; found V1, V2'),
    );
  });

  it('rejects mixed voltage/current AC-form sources in deterministic name order', async () => {
    const failure = simulate(`mixed AC sensitivity excitations
V2 in 0 DC 0 AC 1
I1 0 out DC 0 AC 1m
R1 in out 1k
R2 out 0 1k
.sens V(out) AC DEC 1 1 10
.end`);
    await expect(failure).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(failure).rejects.toThrow(
      new InvalidCircuitError('.sens AC supports at most one non-zero AC excitation; found I1, V2'),
    );
  });

  it('rejects zero-plus-active AC-form current sources as ambiguous', async () => {
    const failure = simulate(`ambiguous current-source sensitivity excitation
I2 0 in DC 0 AC 1m
I1 0 out DC 0 AC 0
R1 in out 1k
R2 out 0 1k
.sens V(out) AC DEC 1 1 10
.end`);
    await expect(failure).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(failure).rejects.toThrow(
      new InvalidCircuitError('.sens AC supports only one AC-form independent source; found I1, I2'),
    );
  });

  it('has parser/programmatic API parity', async () => {
    const circuit = new Circuit();
    circuit.addVoltageSource('V1', 'in', '0', { dc: 1 });
    circuit.addResistor('R1', 'in', 'out', 1000);
    circuit.addResistor('R2', 'out', '0', 2000);
    circuit.addAnalysis('sens', { outputNode: 'out', mode: 'dc' });

    expect((await simulate(circuit)).sensitivity).toEqual((await simulate(dcDivider)).sensitivity);
    expect(circuit.toNetlist()).toContain('.sens v(out)');

    const acCircuit = parse(acRlc);
    const programmatic = new Circuit();
    programmatic.addVoltageSource('V1', 'in', '0', { type: 'ac', dc: 0, magnitude: 1, phase: 0 });
    programmatic.addResistor('R1', 'in', 'mid', 100);
    programmatic.addInductor('L1', 'mid', 'out', 10e-3);
    programmatic.addCapacitor('C1', 'out', '0', 1e-6);
    programmatic.addResistor('R2', 'out', '0', 1000);
    programmatic.addAnalysis('sens', {
      outputNode: 'out', mode: 'ac', variation: 'dec', points: 2,
      startFreq: 10, stopFreq: 1000,
    });
    expect((await simulate(programmatic)).sensitivity).toEqual((await simulate(acCircuit)).sensitivity);

    const acCurrentCircuit = new Circuit();
    acCurrentCircuit.addCurrentSource(
      'I1', '0', 'out', { type: 'ac', dc: 0, magnitude: 1e-3, phase: 0 },
    );
    acCurrentCircuit.addResistor('R1', 'out', '0', 2000);
    acCurrentCircuit.addCapacitor('C1', 'out', '0', 1e-6);
    acCurrentCircuit.addAnalysis('sens', {
      outputNode: 'out', mode: 'ac', variation: 'dec', points: 2,
      startFreq: 10, stopFreq: 1000,
    });
    expect((await simulate(acCurrentCircuit)).sensitivity)
      .toEqual((await simulate(acCurrentRc)).sensitivity);
  });

  it.each([
    '.sens V(out,ref)',
    '.sens I(V1)',
    '.sens V(out) AC LIN 3 1 10',
    '.sens V(out) TRAN 1u 1m',
    '.sens V(out) AC DEC 0 1 10',
  ])('rejects forms outside the bounded slice: %s', directive => {
    expect(() => parse(`unsupported sensitivity\n${directive}`)).toThrow(ParseError);
  });

  it('rejects stepped sensitivity in either directive order', () => {
    expect(() => parse(`${dcDivider}\n.step R1 list 1k 2k`)).toThrow(/step.*sens/i);
    expect(() => parse('stepped sensitivity\n.step R1 list 1k 2k\n.sens V(out)'))
      .toThrow(/step.*sens/i);
  });

  it('rejects unsupported nonlinear devices explicitly', async () => {
    await expect(simulate(`unsupported nonlinear sensitivity
V1 in 0 1
D1 in out DTEST
R1 out 0 1k
.model DTEST D(IS=1e-14)
.sens V(out)
.end`)).rejects.toThrow(/\.sens does not support.*D1/i);
  });

  it('rejects invalid programmatic forms and stepped sensitivity', () => {
    const circuit = new Circuit();
    expect(() => circuit.addAnalysis('sens', {
      outputNode: 'out', mode: 'ac', variation: 'lin', points: 2,
      startFreq: 1, stopFreq: 10,
    } as never)).toThrow(InvalidCircuitError);
    expect(() => circuit.addAnalysis('sens', {
      outputNode: 'out', mode: 'dc', variation: 'dec', points: 2,
      startFreq: 1, stopFreq: 10,
    } as never)).toThrow(InvalidCircuitError);

    circuit.addAnalysis('sens', { outputNode: 'out', mode: 'dc' });
    expect(() => circuit.addStep('R1', { values: [1000, 2000] }))
      .toThrow(/step.*sens/i);
  });

  it('rejects multiple sensitivity analyses rather than overwriting results', () => {
    expect(() => parse('multiple sensitivity\nR1 out 0 1k\n.sens V(out)\n.sens V(out)'))
      .toThrow(/multiple.*sens/i);
  });
});
