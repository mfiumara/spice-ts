import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { solveDCOperatingPoint } from './dc.js';
import { resolveOptions } from '../types.js';

describe('DC Operating Point', () => {
  it('solves a voltage divider', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    expect(result.voltage('1')).toBeCloseTo(5, 6);
    expect(result.voltage('2')).toBeCloseTo(10 / 3, 6);
    expect(result.current('V1')).toBeCloseTo(-5 / 3000, 9);
  });

  it('solves series resistors with current source', () => {
    const ckt = new Circuit();
    ckt.addCurrentSource('I1', '1', '0', { dc: 0.001 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    expect(result.voltage('1')).toBeCloseTo(3, 6);
    expect(result.voltage('2')).toBeCloseTo(2, 6);
  });

  it('solves multiple voltage sources', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 10 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addVoltageSource('V2', '2', '0', { dc: 5 });

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    expect(result.voltage('1')).toBeCloseTo(10, 6);
    expect(result.voltage('2')).toBeCloseTo(5, 6);
    expect(result.current('V1')).toBeCloseTo(-0.005, 9);
  });
});
