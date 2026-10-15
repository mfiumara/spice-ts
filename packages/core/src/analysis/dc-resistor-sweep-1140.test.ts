import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { Resistor } from '../devices/resistor.js';
import { resolveOptions } from '../types.js';
import { solveDCSweep } from './dc-sweep.js';

const divider = `Resistor sweep
V1 in 0 6
R1 in out 1k
R2 out 0 2k
`;

describe('ngspice resistor DC sweep (#1140)', () => {
  it('runs the unchanged corpus-g resInner fixture', async () => {
    const bytes = readFileSync(new URL(
      '../../../../benchmarks/corpus/corpus-g/fixtures/POWERNODE/resInner.cir', import.meta.url,
    ), 'utf8');
    const sweep = (await simulate(bytes)).dcSweep!;
    expect([...sweep.sweepValues]).toEqual([1000]);
    expect(sweep.current('vconnect0000')[0]).toBeCloseTo(1 / 1009, 12);
    expect(sweep.current('vconnect0001')[0]).toBeCloseTo(-1 / 1009, 12);
  });

  it('sweeps a resistor nominal resistance case-insensitively from a netlist', async () => {
    const result = await simulate(`${divider}.dc r2 1k 3k 1k\n.end`);
    const sweep = result.dcSweep!;
    expect([...sweep.sweepValues]).toEqual([1000, 2000, 3000]);
    for (const [i, resistance] of sweep.sweepValues.entries()) {
      expect(sweep.voltage('out')[i]).toBeCloseTo(6 * resistance / (1000 + resistance), 12);
      expect(sweep.current('V1')[i]).toBeCloseTo(-6 / (1000 + resistance), 12);
    }
  });

  it('sweeps two resistors with the primary dimension varying fastest', async () => {
    const result = await simulate(`${divider}.dc R2 1k 3k 1k R1 1k 2k 1k\n.end`);
    const sweep = result.dcSweep!;
    expect([...sweep.sweepValues]).toEqual([1000, 2000, 3000, 1000, 2000, 3000]);
    expect([...sweep.secondarySweepValues!]).toEqual([1000, 1000, 1000, 2000, 2000, 2000]);
    for (const [i, resistance] of sweep.sweepValues.entries()) {
      expect(sweep.voltage('out')[i]).toBeCloseTo(
        6 * resistance / (sweep.secondarySweepValues![i] + resistance), 12,
      );
    }
  });

  it('supports a secondary resistor with a primary voltage source', async () => {
    const result = await simulate(`${divider}.dc V1 0 6 3 R2 1k 3k 1k\n.end`);
    const sweep = result.dcSweep!;
    expect(sweep.sweepValues).toHaveLength(9);
    for (const [i, voltage] of sweep.sweepValues.entries()) {
      const resistance = sweep.secondarySweepValues![i];
      expect(sweep.voltage('out')[i]).toBeCloseTo(voltage * resistance / (1000 + resistance), 12);
    }
  });

  it('restores nominal resistance and temperature-adjusted conductance after success or failure', () => {
    const compiled = parse(`${divider.replace('R2 out 0 2k', 'R2 out 0 2k tc1=0.01 dtemp=10 m=2 scale=3')}.end`).compile();
    const resistor = compiled.devices.find(device => device.name === 'R2') as Resistor;
    const before = [resistor.getParameter(), resistor.resistance, resistor.conductance];
    const analysis = { type: 'dc' as const, source: 'R2', start: 1000, stop: 3000, step: 1000 };
    const sweep = solveDCSweep(compiled, analysis, resolveOptions());
    for (const [i, nominal] of sweep.sweepValues.entries()) {
      const resistance = nominal * 1.1 * 3 / 2;
      expect(sweep.voltage('out')[i]).toBeCloseTo(6 * resistance / (1000 + resistance), 12);
    }
    expect([resistor.getParameter(), resistor.resistance, resistor.conductance]).toEqual(before);
    const setParameter = resistor.setParameter.bind(resistor);
    vi.spyOn(resistor, 'setParameter').mockImplementationOnce(value => {
      setParameter(value);
      throw new Error('sweep update failed');
    });
    expect(() => solveDCSweep(compiled, analysis, resolveOptions())).toThrow('sweep update failed');
    expect([resistor.getParameter(), resistor.resistance, resistor.conductance]).toEqual(before);
  });

  it('retains the unknown-target diagnostic for a missing resistor', () => {
    const compiled = parse(`${divider}.end`).compile();
    expect(() => solveDCSweep(compiled, {
      type: 'dc', source: 'R99', start: 1000, stop: 3000, step: 1000,
    }, resolveOptions())).toThrow("DC sweep source 'R99' not found");
  });
});
