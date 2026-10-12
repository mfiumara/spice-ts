import { beforeEach, describe, expect, it } from 'vitest';
import { breakdownKneeMemoForTest as memo } from './diode.js';

// #549: the breakdown knee (ngspice-47 diotemp.c tBrkdwnV) is memoised in a
// small fixed-size cache instead of re-solved on every junction evaluation.
// The memo must be invisible: every lookup returns exactly the bits of a fresh
// solve (cache cleared first), including after more distinct knees than the
// cache holds have evicted earlier entries.
const vt = 1.38064852e-23 / 1.6021766208e-19 * 300.15;

type Breakdown = Parameters<typeof memo.knee>[0];

function params(index: number): Breakdown {
  return {
    voltage: 3 + 0.37 * index,
    current: 1e-6 * (1 + index),
    thermalVoltage: (1 + 0.01 * index) * vt,
    junctionThermalVoltage: vt,
  };
}

function freshKnee(breakdown: Breakdown, saturationCurrent: number): number {
  memo.clear();
  const knee = memo.knee(breakdown, saturationCurrent);
  memo.clear();
  return knee;
}

describe('diode breakdown knee memo (#549)', () => {
  beforeEach(() => memo.clear());

  it('matches a fresh solve bit for bit across hits, misses and evictions', () => {
    const order: number[] = [];
    for (let round = 0; round < 3; round++) {
      for (let index = 0; index < 40; index++) order.push(index);
      for (let index = 0; index < 8; index++) order.push(index, index, 39 - index);
    }
    const saturation = (index: number) => 1e-14 * (1 + (index % 5));
    const expected = new Map<number, number>();
    for (let index = 0; index < 40; index++) expected.set(index, freshKnee(params(index), saturation(index)));
    for (const index of order) {
      const knee = memo.knee(params(index), saturation(index));
      expect(Number.isFinite(knee)).toBe(true);
      expect(knee).toBe(expected.get(index));
    }
  });

  it('keys on every input: changing any one field gives that field\'s own fit', () => {
    const base = params(2);
    const saturationCurrent = 3e-14;
    const reference = memo.knee(base, saturationCurrent);
    const variants: Array<[Breakdown, number]> = [
      [{ ...base, voltage: base.voltage * 1.5 }, saturationCurrent],
      [{ ...base, current: base.current * 10 }, saturationCurrent],
      [{ ...base, thermalVoltage: base.thermalVoltage * 1.5 }, saturationCurrent],
      [{ ...base, junctionThermalVoltage: base.junctionThermalVoltage * 1.5 }, saturationCurrent],
      [base, saturationCurrent * 7],
    ];
    const fresh = variants.map(([breakdown, is]) => freshKnee(breakdown, is));
    memo.knee(base, saturationCurrent);
    variants.forEach(([breakdown, is], index) => {
      const knee = memo.knee(breakdown, is);
      expect(knee).toBe(fresh[index]);
      expect(knee).not.toBe(reference);
    });
    expect(memo.knee(base, saturationCurrent)).toBe(reference);
  });
});
