import { expect, it } from 'vitest';
import { probe, REST } from '../../../../benchmarks/bjt-centered-1037/probe.js';

it('preserves DC equilibrium with post-assembly centered Newton (#1037)', async () => {
  const result = await probe(REST, true);
  expect(result.error).toBeNull();
  expect(result.time).toBeCloseTo(1e-11, 20);
});
