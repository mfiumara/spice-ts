import { expect, it } from 'vitest';
import { probe, REST } from './transient-centered-1037.fixtures.js';

// Known loss. This candidate is evidence only, NOT a simulator correction.
it.fails('preserves DC equilibrium with post-assembly centered Newton (#1037)', async () => {
  const result = await probe(REST, true);
  expect(result.error).toBeNull();
  expect(result.time).toBeCloseTo(1e-11, 20);
});

it('rejects the centered candidate through BJT current checks, not LTE or limiting', async () => {
  const result = await probe(REST, true);
  expect(result.error).toBe('TimestepTooSmallError');
  expect(result.convergence.transient.lteRetries).toBe(0);
  expect(result.convergence.transient.acceptedSteps).toBe(0);
  expect(result.checks.length).toBeGreaterThan(0);
  for (const check of result.checks) {
    expect(check.limited).toBe(false);
    expect(check.passed).toBe(false);
    expect(check.baseError).toBeGreaterThan(check.baseTolerance);
  }
  const first = result.solves[0];
  expect(first.direct).not.toEqual(first.centered);
  expect(first.residual.some(value => value !== 0)).toBe(true);
});

it('completes the nanosecond-grid control with both formulations', async () => {
  for (const centered of [false, true]) {
    const result = await probe(REST.replace('.tran 100f 10p', '.tran 1n 100n'), centered);
    expect(result.error).toBeNull();
    expect(result.convergence.transient.nrRetries).toBe(0);
    expect(result.time).toBeCloseTo(1e-7, 16);
  }
});
