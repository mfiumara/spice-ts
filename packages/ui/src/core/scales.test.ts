import { describe, it, expect } from 'vitest';
import { createLinearScale, createLogScale, computeYExtent, bisectData } from './scales.js';

describe('createLinearScale', () => {
  it('maps domain to range', () => {
    const scale = createLinearScale([0, 10], [0, 500]);
    expect(scale(0)).toBe(0);
    expect(scale(10)).toBe(500);
    expect(scale(5)).toBe(250);
  });

  it('handles inverted range (for y-axis)', () => {
    const scale = createLinearScale([0, 5], [300, 0]);
    expect(scale(0)).toBe(300);
    expect(scale(5)).toBe(0);
    expect(scale(2.5)).toBe(150);
  });
});

describe('createLogScale', () => {
  it('maps domain to range on log scale', () => {
    const scale = createLogScale([1, 1e6], [0, 600]);
    expect(scale(1)).toBeCloseTo(0, 0);
    expect(scale(1e6)).toBeCloseTo(600, 0);
    expect(scale(1e3)).toBeCloseTo(300, 0);
  });
});

describe('computeYExtent', () => {
  it('computes min/max with 10% padding', () => {
    const [min, max] = computeYExtent([[0, 1, 2, 3, 4, 5]]);
    expect(min).toBeCloseTo(-0.5, 2);
    expect(max).toBeCloseTo(5.5, 2);
  });

  it('handles multiple signal arrays', () => {
    const [min, max] = computeYExtent([[0, 1, 2], [-1, 0, 3]]);
    expect(min).toBeLessThan(-1);
    expect(max).toBeGreaterThan(3);
  });

  it('handles constant signal (adds ±1 padding)', () => {
    const [min, max] = computeYExtent([[5, 5, 5]]);
    expect(min).toBe(4);
    expect(max).toBe(6);
  });
});

describe('bisectData', () => {
  it('finds the nearest index for a given x value', () => {
    const xValues = [0, 1, 2, 3, 4, 5];
    expect(bisectData(xValues, 2.3)).toBe(2);
    expect(bisectData(xValues, 2.7)).toBe(3);
    expect(bisectData(xValues, 0)).toBe(0);
    expect(bisectData(xValues, 5)).toBe(5);
  });

  it('clamps to array bounds', () => {
    const xValues = [1, 2, 3];
    expect(bisectData(xValues, -10)).toBe(0);
    expect(bisectData(xValues, 100)).toBe(2);
  });
});
