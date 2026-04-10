import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { cmosInverterChain, cmosRingOscillator } from '@benchmarks/circuits/generators.js';

describe('Nonlinear: CMOS inverter chain', () => {
  bench('5 stages', async () => {
    try {
      await simulate(cmosInverterChain(5), { integrationMethod: 'euler' });
    } catch {
      return;
    }
  });

  bench('10 stages', async () => {
    try {
      await simulate(cmosInverterChain(10), { integrationMethod: 'euler' });
    } catch {
      return;
    }
  }, { iterations: 3 });
});

describe('Nonlinear: ring oscillator', () => {
  bench('3-stage', async () => {
    try {
      await simulate(cmosRingOscillator(3), { integrationMethod: 'euler' });
    } catch {
      return;
    }
  });

  bench('5-stage', async () => {
    try {
      await simulate(cmosRingOscillator(5), { integrationMethod: 'euler' });
    } catch {
      return;
    }
  });

  bench('11-stage', async () => {
    try {
      await simulate(cmosRingOscillator(11), { integrationMethod: 'euler' });
    } catch {
      return;
    }
  }, { iterations: 3 });
});
