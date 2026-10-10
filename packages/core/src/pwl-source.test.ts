import { describe, expect, it } from 'vitest';
import { createTransientSim } from './analysis/transient-driver.js';
import { CurrentSource } from './devices/current-source.js';
import { VoltageSource } from './devices/voltage-source.js';
import { parseTitleless as parse } from './parser/index.js';

const PWL_NETLIST = `
V1 in 0 PWL(0 0 1u 1 2u 1 2u -1 3u 0)
R1 in 0 1k
.tran 0.25u 4u
.end
`;

const PWL = {
  type: 'pwl' as const,
  points: [
    { time: 0, value: 0 },
    { time: 1e-6, value: 1 },
    { time: 2e-6, value: 1 },
    { time: 2e-6, value: -1 },
    { time: 3e-6, value: 0 },
  ],
};

describe('ngspice PWL source parity', () => {
  it('parses ordered time/value pairs from an identical ngspice netlist', () => {
    const [source] = parse(PWL_NETLIST).compile().devices;

    expect(source).toBeInstanceOf(VoltageSource);
    expect((source as VoltageSource).waveform).toEqual(PWL);
  });

  it('holds endpoints, interpolates linearly, and takes the last value at duplicate times', () => {
    const source = new VoltageSource('V1', [0, -1], 0, PWL);

    expect(source.getVoltageAtTime(-1e-6)).toBe(0);
    expect(source.getVoltageAtTime(0.5e-6)).toBeCloseTo(0.5, 12);
    expect(source.getVoltageAtTime(1.5e-6)).toBe(1);
    expect(source.getVoltageAtTime(2e-6)).toBe(-1);
    expect(source.getVoltageAtTime(2.5e-6)).toBeCloseTo(-0.5, 12);
    expect(source.getVoltageAtTime(4e-6)).toBe(0);
  });

  it('uses the same PWL semantics for current sources', () => {
    const source = new CurrentSource('I1', [0, -1], PWL);

    expect(source.getCurrentAtTime(0.5e-6)).toBeCloseTo(0.5, 12);
    expect(source.getCurrentAtTime(2e-6)).toBe(-1);
    expect(source.getCurrentAtTime(2.5e-6)).toBeCloseTo(-0.5, 12);
  });

  it('collects each PWL corner as a transient breakpoint', async () => {
    const sim = await createTransientSim(PWL_NETLIST);
    const breakpoints = (sim as unknown as { breakpointTimes(): readonly number[] }).breakpointTimes();

    expect(breakpoints).toEqual([1e-6, 2e-6, 3e-6]);

    const steps = sim.advanceUntil(3e-6);
    for (const [time, expected] of [[1e-6, 1], [2e-6, -1], [3e-6, 0]] as const) {
      const step = steps.find(candidate => Math.abs(candidate.time - time) <= 1e-14);
      expect(step?.voltages.get('in')).toBeCloseTo(expected, 12);
    }
  });

  it('rejects malformed PWL point lists', () => {
    expect(() => parse('V1 in 0 PWL(0 0 1u)')).toThrow(/PWL.*time\/value pairs/i);
    expect(() => parse('V1 in 0 PWL(1u 1 0 0)')).toThrow(/PWL.*non-decreasing/i);
    expect(() => parse('V1 in 0 PWL(0 0 1u 1) R=1u')).toThrow(/Unsupported PWL source parameters/i);
  });

  it('preserves PWL data through netlist and IR serialization', () => {
    const circuit = parse(PWL_NETLIST);

    expect(circuit.toNetlist()).toContain('V1 in 0 PWL(0 0 0.000001 1 0.000002 1 0.000002 -1 0.000003 0)');
    expect(circuit.toIR().components[0]).toMatchObject({
      params: {
        waveform: 'pwl',
        points: '0:0,0.000001:1,0.000002:1,0.000002:-1,0.000003:0',
      },
      displayValue: 'PWL 5 points',
    });
  });

  it.each(['EXP', 'SFFM', 'AM', 'TRNOISE', 'EXTERNAL'])(
    'explicitly rejects unsupported %s sources',
    keyword => {
      expect(() => parse(`V1 in 0 ${keyword}(0 1)`)).toThrow(
        new RegExp(`Unsupported source waveform.*${keyword}`, 'i'),
      );
    },
  );
});
