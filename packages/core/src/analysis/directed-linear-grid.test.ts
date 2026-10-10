import { describe, expect, it } from 'vitest';
import { directedLinearPointCount } from './directed-linear-grid.js';

describe('directed linear grids', () => {
  it.each([
    [0, 1_000_000.999999999, 1],
    [0, -1_000_000.999999999, -1],
  ])('does not round a large non-divisible grid past its stop', (start, stop, step) => {
    const count = directedLinearPointCount(start, stop, step);

    expect(count).toBe(1_000_001);
  });
});
