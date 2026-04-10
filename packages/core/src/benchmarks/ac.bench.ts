import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { rcChainAC } from '@benchmarks/circuits/generators.js';

describe('AC: RC chain sweep', () => {
  bench('10 stages', async () => {
    await simulate(rcChainAC(10));
  });

  bench('50 stages', async () => {
    await simulate(rcChainAC(50));
  }, { iterations: 3 });

  bench('100 stages', async () => {
    await simulate(rcChainAC(100));
  }, { iterations: 3 });
});
