import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { rcChain, lcLadder } from '@benchmarks/circuits/generators.js';

describe('Transient: RC chain', () => {
  bench('10 stages', async () => {
    await simulate(rcChain(10));
  });

  bench('50 stages', async () => {
    await simulate(rcChain(50));
  }, { iterations: 3 });

  bench('100 stages', async () => {
    await simulate(rcChain(100));
  }, { iterations: 3 });
});

describe('Transient: LC ladder', () => {
  bench('10 sections', async () => {
    await simulate(lcLadder(10), { integrationMethod: 'euler' });
  });

  bench('50 sections', async () => {
    await simulate(lcLadder(50), { integrationMethod: 'euler' });
  }, { iterations: 3 });
});
