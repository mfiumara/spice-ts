import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { solveDCSweep } from './dc-sweep.js';
import { resolveOptions } from '../types.js';
import type { DCSweepAnalysis } from '../types.js';
import { simulate } from '../simulate.js';

describe('DC Sweep', () => {
  it('sweeps a voltage divider', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const analysis: DCSweepAnalysis = {
      type: 'dc', source: 'V1', start: 0, stop: 5, step: 1,
    };

    const result = solveDCSweep(compiled, analysis, options);

    // 6 points: 0, 1, 2, 3, 4, 5
    expect(result.sweepValues.length).toBe(6);
    expect(result.sweepValues[0]).toBeCloseTo(0, 10);
    expect(result.sweepValues[5]).toBeCloseTo(5, 10);

    const v2 = result.voltage('2');
    expect(v2.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      const vsrc = i * 1; // start + i * step
      const expected = vsrc * 2000 / (1000 + 2000);
      expect(v2[i]).toBeCloseTo(expected, 6);
    }

    // Current through V1: I = -V1 / (R1 + R2)
    const iV1 = result.current('V1');
    expect(iV1.length).toBe(6);
    for (let i = 0; i < 6; i++) {
      const vsrc = i * 1;
      expect(iV1[i]).toBeCloseTo(-vsrc / 3000, 9);
    }
  });

  it('sweeps diode I-V curve', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addDiode('D1', '2', '0');

    const compiled = ckt.compile();
    const options = resolveOptions();
    const analysis: DCSweepAnalysis = {
      type: 'dc', source: 'V1', start: -1, stop: 1, step: 0.1,
    };

    const result = solveDCSweep(compiled, analysis, options);

    // 21 points: -1.0, -0.9, ..., 0.9, 1.0
    expect(result.sweepValues.length).toBe(21);

    // At V1 = -1V, diode is reverse biased: current magnitude near zero
    const iV1 = result.current('V1');
    expect(Math.abs(iV1[0])).toBeLessThan(1e-6);

    // At V1 = 1V, diode is forward biased: significant current flows
    expect(Math.abs(iV1[20])).toBeGreaterThan(1e-4);

    // Current should monotonically increase across sweep
    for (let i = 1; i < 21; i++) {
      expect(-iV1[i]).toBeGreaterThanOrEqual(-iV1[i - 1] - 1e-12);
    }
  });

  it('sweeps a current source', () => {
    const ckt = new Circuit();
    ckt.addCurrentSource('I1', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '0', 1000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const analysis: DCSweepAnalysis = {
      type: 'dc', source: 'I1', start: 0, stop: 0.001, step: 0.0001,
    };

    const result = solveDCSweep(compiled, analysis, options);

    // 11 points: 0, 0.1m, 0.2m, ..., 1.0m
    expect(result.sweepValues.length).toBe(11);

    const v1 = result.voltage('1');
    expect(v1.length).toBe(11);
    for (let i = 0; i < 11; i++) {
      const current = analysis.start + i * analysis.step;
      // Positive source current flows from node 1 to ground.
      expect(v1[i]).toBeCloseTo(-current * 1000, 6);
    }
  });

  it('resolves the sweep source case-insensitively and preserves its name', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vinput', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '0', 1000);

    const result = solveDCSweep(ckt.compile(), {
      type: 'dc', source: 'vINPUT', start: 0, stop: 1, step: 1,
    }, resolveOptions());

    expect([...result.current('Vinput')]).toEqual([0, -0.001]);
    expect(() => result.current('vINPUT')).toThrow('Unknown branch: vINPUT');
  });

  it('resolves a mixed-case current-source sweep', () => {
    const ckt = new Circuit();
    ckt.addCurrentSource('Ibias', '1', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '0', 1000);

    const result = solveDCSweep(ckt.compile(), {
      type: 'dc', source: 'iBIAS', start: 0, stop: 0.001, step: 0.001,
    }, resolveOptions());

    expect([...result.voltage('1')]).toEqual([0, -1]);
  });

  it('throws on unknown sweep source', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '0', 1000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const analysis: DCSweepAnalysis = {
      type: 'dc', source: 'V99', start: 0, stop: 5, step: 1,
    };

    expect(() => solveDCSweep(compiled, analysis, options)).toThrow(
      "DC sweep source 'V99' not found",
    );
  });

  it('rejects case-insensitively ambiguous sweep sources deterministically', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('Vinput', '1', '0', { dc: 0 });
    ckt.addVoltageSource('vINPUT', '2', '0', { dc: 0 });
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addResistor('R2', '2', '0', 1000);

    expect(() => solveDCSweep(ckt.compile(), {
      type: 'dc', source: 'VINPUT', start: 0, stop: 1, step: 1,
    }, resolveOptions())).toThrow(
      "DC sweep source 'VINPUT' is ambiguous; matches: 'Vinput', 'vINPUT'",
    );
  });
});

describe('DC Sweep via simulate()', () => {
  it('runs DC sweep from netlist string', async () => {
    const result = await simulate(`
      V1 1 0 DC 0
      R1 1 2 1k
      R2 2 0 2k
      .dc V1 0 5 1
      .end
    `);

    expect(result.dcSweep).toBeDefined();
    const sweep = result.dcSweep!;
    expect(sweep.sweepValues.length).toBe(6);

    const v2 = sweep.voltage('2');
    for (let i = 0; i < 6; i++) {
      const vsrc = i;
      expect(v2[i]).toBeCloseTo(vsrc * 2000 / 3000, 6);
    }
  });

  it('runs the vbic-fo 707-point grid with the primary source varying fastest', async () => {
    const textResult = await simulate(`
      Vinner inner 0 DC 0
      Vouter outer 0 DC 0
      R1 inner outer 1k
      .dc Vinner 0 5 50m Vouter 700m 1 50m
      .end
    `);

    const circuit = new Circuit();
    circuit.addVoltageSource('Vinner', 'inner', '0', { dc: 0 });
    circuit.addVoltageSource('Vouter', 'outer', '0', { dc: 0 });
    circuit.addResistor('R1', 'inner', 'outer', 1000);
    circuit.addAnalysis('dc', {
      source: 'Vinner', start: 0, stop: 5, step: 0.05,
      secondary: { source: 'Vouter', start: 0.7, stop: 1, step: 0.05 },
    });
    const programmaticResult = await simulate(circuit);

    const text = textResult.dcSweep!;
    const programmatic = programmaticResult.dcSweep!;
    expect(text.sweepValues).toHaveLength(707);
    expect(text.secondarySweepValues).toHaveLength(707);
    expect([...text.sweepValues]).toEqual([...programmatic.sweepValues]);
    expect([...text.secondarySweepValues!]).toEqual([...programmatic.secondarySweepValues!]);
    expect(text.sweepValues[0]).toBe(0);
    expect(text.sweepValues[100]).toBe(5);
    expect(text.sweepValues[101]).toBe(0);
    expect(text.secondarySweepValues![0]).toBeCloseTo(0.7, 15);
    expect(text.secondarySweepValues![100]).toBeCloseTo(0.7, 15);
    expect(text.secondarySweepValues![101]).toBeCloseTo(0.75, 15);
    expect(text.secondarySweepValues![706]).toBeCloseTo(1, 15);
    expect([...text.voltage('inner')]).toEqual([...text.sweepValues]);
    expect([...text.voltage('outer')]).toEqual([...text.secondarySweepValues!]);
  });
});
