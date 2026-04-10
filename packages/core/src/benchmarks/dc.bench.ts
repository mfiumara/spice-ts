import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { resistorLadder } from '@benchmarks/circuits/generators.js';

describe('DC: resistor ladder', () => {
  bench('10 nodes', async () => {
    await simulate(resistorLadder(10));
  });

  bench('100 nodes', async () => {
    await simulate(resistorLadder(100));
  });

  bench('500 nodes', async () => {
    await simulate(resistorLadder(500));
  }, { iterations: 3 });
});
