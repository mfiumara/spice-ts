import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import { ConvergenceError, SingularMatrixError, TimestepTooSmallError } from '../errors.js';
import { cmosInverterChain, cmosRingOscillator } from '@benchmarks/circuits/generators.js';

describe('Nonlinear: CMOS inverter chain', () => {
  bench('5 stages', async () => {
    try {
      await simulate(cmosInverterChain(5), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('10 stages', async () => {
    try {
      await simulate(cmosInverterChain(10), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  }, { iterations: 3 });
});

describe('Nonlinear: ring oscillator', () => {
  bench('3-stage', async () => {
    try {
      await simulate(cmosRingOscillator(3), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('5-stage', async () => {
    try {
      await simulate(cmosRingOscillator(5), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('11-stage', async () => {
    try {
      await simulate(cmosRingOscillator(11), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  }, { iterations: 3 });
});
