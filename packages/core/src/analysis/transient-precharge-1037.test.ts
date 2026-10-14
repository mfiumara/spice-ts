import { expect, it } from 'vitest';
import { REST } from './transient-centered-1037.fixtures.js';
import { probePrecharge } from './transient-precharge-1037.fixtures.js';

// Passing EXPERIMENT checks, not a production RED-to-GREEN claim.
it('localizes rest roundoff to the absolute charge companion RHS (#1037)', async () => {
  const run = await probePrecharge(REST, false);
  expect(run.error).toBe('TimestepTooSmallError');
  expect(run.points).toHaveLength(1);
  const row = run.rows[0];
  expect(row.beforeResidual).toEqual([0, 0, 0, 0]);
  expect(row.prechargeResidual).toEqual([0, 0, 0, 0]);
  expect(row.afterResidual).toEqual([-1.4551915228366852e-11, 1.4551915228366852e-11, 0, 0]);
  const bc = row.branches.find(branch => branch.name === 'qbc')!;
  expect(bc.current).toBe(0);
  expect(bc.centeredCurrent).toBe(0);
  expect(bc.equivalent).toBeGreaterThan(8e4);
  expect(row.rhsAdds[2].after).toBe(row.rhsAdds[2].value);
  expect(row.rhsAdds[2].before).not.toBe(0);
});

it('completes the rest reduction when charge residuals precede large products', async () => {
  const run = await probePrecharge(REST, true);
  expect(run.error).toBeNull();
  expect(run.points).toHaveLength(107);
  expect(run.time).toBeCloseTo(1e-11, 20);
  expect(run.convergence.transient.nrRetries).toBe(0);
  expect(run.convergence.transient.lteRetries).toBe(0);
});

it('keeps the nanosecond-grid control and exercises nonzero charge current', async () => {
  for (const centered of [false, true]) {
    const run = await probePrecharge(REST.replace('.tran 100f 10p', '.tran 1n 100n'), centered);
    expect(run.error).toBeNull();
    expect(run.points).toHaveLength(107);
    expect(run.convergence.transient.nrRetries).toBe(0);
  }
  const moving = await probePrecharge(REST.replace('V1 c 0 46.5', 'V1 c 0 PWL(0 46.5 2p 46.5 5p 46.4 10p 46.4)'), true);
  expect(moving.error).toBeNull();
  expect(moving.time).toBeCloseTo(1e-11, 20);
  expect(moving.rows.some(row => row.branches.some(branch => branch.current !== 0))).toBe(true);
});
