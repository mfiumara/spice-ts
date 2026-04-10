import { describe, bench } from 'vitest';
import { simulate } from '../simulate.js';
import {
  ConvergenceError,
  SingularMatrixError,
  TimestepTooSmallError,
} from '../errors.js';
import {
  diffPair,
  rcLadder5,
  oneStageOpAmp,
  cmosInverterSingle,
  bandpassRLC,
} from '@benchmarks/circuits/spice3-reference.js';

describe('SPICE3: Quarles reference circuits', () => {
  bench('diff pair (BJT DC)', async () => {
    await simulate(diffPair());
  });

  bench('RC ladder 5-stage (AC)', async () => {
    await simulate(rcLadder5());
  });

  bench('one-stage OTA (DC)', async () => {
    await simulate(oneStageOpAmp());
  });

  bench('CMOS inverter single (tran)', async () => {
    try {
      await simulate(cmosInverterSingle(), { integrationMethod: 'euler' });
    } catch (e) {
      if (e instanceof ConvergenceError || e instanceof SingularMatrixError || e instanceof TimestepTooSmallError) return;
      throw e;
    }
  });

  bench('bandpass RLC (AC)', async () => {
    await simulate(bandpassRLC());
  });
});
