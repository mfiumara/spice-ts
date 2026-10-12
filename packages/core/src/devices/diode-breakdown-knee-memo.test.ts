import { describe, expect, it } from 'vitest';
import { breakdownKneeVoltage, solveBreakdownKneeVoltage } from './diode.js';

// #549: the breakdown knee (ngspice-47 diotemp.c tBrkdwnV) is memoised in a
// small fixed-size cache instead of re-solved on every junction evaluation.
// The memo must be invisible: every lookup returns exactly the bits of the
// uncached fit, including after more distinct knees than the cache holds have
// evicted earlier entries.
const vt = 1.38064852e-23 / 1.6021766208e-19 * 300.15;

function params(index: number) {
  return {
    voltage: 3 + 0.37 * index,
    current: 1e-6 * (1 + index),
    thermalVoltage: (1 + 0.01 * index) * vt,
    junctionThermalVoltage: vt,
  };
}

describe('diode breakdown knee memo (#549)', () => {
  it('matches the uncached fit bit for bit across hits, misses and evictions', () => {
    const order: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (let index = 0; index < 40; index++) order.push(index);
      for (let index = 0; index < 8; index++) order.push(index, index, 39 - index);
    }
    for (const index of order) {
      const saturationCurrent = 1e-14 * (1 + (index % 5));
      const breakdown = params(index);
      expect(breakdownKneeVoltage(breakdown, saturationCurrent))
        .toBe(solveBreakdownKneeVoltage(breakdown, saturationCurrent));
    }
  });

  it('keys on every input: changing any one field gives the new fit', () => {
    const base = params(2);
    const saturationCurrent = 3e-14;
    const reference = breakdownKneeVoltage(base, saturationCurrent);
    const variants = [
      { ...base, voltage: base.voltage * 1.5 },
      { ...base, current: base.current * 10 },
      { ...base, thermalVoltage: base.thermalVoltage * 1.5 },
      { ...base, junctionThermalVoltage: base.junctionThermalVoltage * 1.5 },
    ];
    for (const variant of variants) {
      const knee = breakdownKneeVoltage(variant, saturationCurrent);
      expect(knee).toBe(solveBreakdownKneeVoltage(variant, saturationCurrent));
      expect(knee).not.toBe(reference);
    }
    const otherIs = breakdownKneeVoltage(base, saturationCurrent * 7);
    expect(otherIs).toBe(solveBreakdownKneeVoltage(base, saturationCurrent * 7));
    expect(otherIs).not.toBe(reference);
    expect(breakdownKneeVoltage(base, saturationCurrent)).toBe(reference);
  });
});
