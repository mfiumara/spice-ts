import { expect, it, vi } from 'vitest';
import { createBSIM1, resolveBSIM1Model } from './bsim1.js';
import type { StampContext } from './device.js';

it('reuses an exact-bias BSIM channel evaluation without suppressing stamps', () => {
  const device = createBSIM1('M1', [0, 1, -1, -1], resolveBSIM1Model('N', {
    TOX: 0.03, VDD: 5, PHI: 0.8, K1: 1, MUZ: 500,
  }, 1), undefined);
  const evaluate = vi.spyOn(device.setup, 'evaluate');
  const stampG = vi.fn();
  const stampB = vi.fn();
  let gate = 2;
  const ctx: StampContext = {
    stampG, stampB, stampC: vi.fn(),
    getCurrent: () => 0, time: 0, dt: 0, numNodes: 2,
    sourceScale: 1, useDcSourceValue: true,
    getVoltage: node => node === 0 ? 0.05 : gate,
  };
  device.stamp(ctx);
  const firstG = [...stampG.mock.calls];
  const firstB = [...stampB.mock.calls];
  stampG.mockClear();
  stampB.mockClear();
  device.stamp(ctx);
  expect(stampG.mock.calls).toEqual(firstG);
  expect(stampB.mock.calls).toEqual(firstB);
  expect(evaluate).toHaveBeenCalledTimes(1);
  gate = 2.01;
  device.stamp(ctx);
  expect(evaluate).toHaveBeenCalledTimes(2);
  // Charge evaluation writes the same scratch output and must invalidate the DC reuse.
  device.stampAC(ctx, 1);
  device.stamp(ctx);
  expect(evaluate).toHaveBeenCalledTimes(4);
});
