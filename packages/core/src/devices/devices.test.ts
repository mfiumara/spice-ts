import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { Resistor } from './resistor.js';
import { VoltageSource } from './voltage-source.js';
import { CurrentSource } from './current-source.js';

describe('Resistor', () => {
  it('stamps 1/R conductance between two nodes', () => {
    const asm = new MNAAssembler(2, 0);
    const r = new Resistor('R1', [0, 1], 1000);
    r.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBeCloseTo(0.001);
    expect(asm.G.get(0, 1)).toBeCloseTo(-0.001);
    expect(asm.G.get(1, 0)).toBeCloseTo(-0.001);
    expect(asm.G.get(1, 1)).toBeCloseTo(0.001);
  });

  it('handles ground node (-1) by not stamping that row/col', () => {
    const asm = new MNAAssembler(1, 0);
    const r = new Resistor('R1', [0, -1], 1000);
    r.stamp(asm.getStampContext());
    expect(asm.G.get(0, 0)).toBeCloseTo(0.001);
  });

  it('is linear', () => {
    const r = new Resistor('R1', [0, 1], 1000);
    expect(r.isNonlinear).toBe(false);
  });
});

describe('VoltageSource', () => {
  it('stamps branch equation into MNA', () => {
    const asm = new MNAAssembler(1, 1);
    const v = new VoltageSource('V1', [0, -1], 0, { type: 'dc', value: 5 });
    v.stamp(asm.getStampContext());

    expect(asm.G.get(0, 1)).toBe(1);
    expect(asm.G.get(1, 0)).toBe(1);
    expect(asm.b[1]).toBe(5);
  });

  it('stamps between two non-ground nodes', () => {
    const asm = new MNAAssembler(2, 1);
    const v = new VoltageSource('V1', [0, 1], 0, { type: 'dc', value: 3 });
    v.stamp(asm.getStampContext());

    expect(asm.G.get(0, 2)).toBe(1);
    expect(asm.G.get(1, 2)).toBe(-1);
    expect(asm.G.get(2, 0)).toBe(1);
    expect(asm.G.get(2, 1)).toBe(-1);
    expect(asm.b[2]).toBe(3);
  });
});

describe('CurrentSource', () => {
  it('stamps current into RHS vector', () => {
    const asm = new MNAAssembler(2, 0);
    const i = new CurrentSource('I1', [0, 1], { type: 'dc', value: 0.002 });
    i.stamp(asm.getStampContext());

    expect(asm.b[0]).toBeCloseTo(0.002);
    expect(asm.b[1]).toBeCloseTo(-0.002);
  });
});
