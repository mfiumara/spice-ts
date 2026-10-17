import { describe, expect, it, vi } from 'vitest';
import type { StampContext } from './device.js';
import { MOS6, resolveMOS6Model } from './mos6.js';
import { TransientChargeState } from './charge-state.js';

describe('MOS6 cold load work (#1206)', () => {
  it('keeps public channel results independent of later channel and charge loads', () => {
    const device = new MOS6('M1', [0, 1, 2, 3], resolveMOS6Model('M6', { VTO: 0.7, KC: 1e-4 }, 1), {});
    const channel = device.evaluateChannel(2, 1, 0);
    const saved = { ...channel };
    expect(device.evaluateChannel(0, -1, -0.2)).not.toBe(channel);
    device.acceptTransientStep({
      stampC: () => {}, stampG: () => {}, stampB: () => {},
      getVoltage: node => [1, 2, 0, 0][node], getCurrent: () => 0,
      time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
    });
    expect(channel).toEqual(saved);
    expect(device.evaluateChannel(2, 1, 0)).toEqual(saved);
  });
  it('does not compute unused drain current and derivatives for Meyer capacitances', () => {
    const device = new MOS6('M1', [0, 1, 2, 3], resolveMOS6Model('M6', { VTO: 0.7, KC: 1e-4 }, 1), {});
    const ctx: StampContext = {
      stampC: () => {}, stampG: () => {}, stampB: () => {},
      getVoltage: node => [1, 2, 0, 0][node], getCurrent: () => 0,
      time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
    };
    const exp = vi.spyOn(Math, 'exp');
    try {
      device.acceptTransientStep(ctx);
      // Vdsat needs one exponential; Idsat and its derivatives are unused.
      expect(exp).toHaveBeenCalledTimes(1);
    } finally {
      exp.mockRestore();
    }
  });
  it('reuses its truncation evaluator without retaining the previous context', () => {
    const device = new MOS6('M1', [0, 1, 2, 3], resolveMOS6Model('M6', {}, 1), {});
    const spy = vi.spyOn(TransientChargeState.prototype, 'truncationTimestep').mockReturnValue(Infinity);
    try {
      const truncation = { deltas: [1e-9, 1e-9, 1e-9] as const, reltol: 1e-3, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };
      const first = {} as StampContext;
      const second = {} as StampContext;
      device.truncateTransientStep(first, truncation);
      device.truncateTransientStep(second, truncation);
      expect(spy.mock.calls[0][1]).toBe(spy.mock.calls[1][1]);
      expect(spy.mock.calls[0][3]).toBe(first);
      expect(spy.mock.calls[1][3]).toBe(second);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([1, -1] as const)('reads the bias once for polarity %s, without caching across loads', polarity => {
    const model = resolveMOS6Model('M6', { KV: 1.2, NV: 0.9, NC: 1.3, KC: 1e-4, TOX: 2e-8 }, polarity);
    const device = new MOS6('M1', [0, 1, 2, 3], model, { W: 10e-6, L: 2e-6 });
    const getVoltage = vi.fn((node: number) => [2, 2, 0, 0][node]);
    const ctx: StampContext = {
      stampC: () => {}, stampG: () => {}, stampB: () => {},
      getVoltage, getCurrent: () => 0, time: 0, dt: 0, numNodes: 4,
      sourceScale: 1, useDcSourceValue: true,
    };
    device.acceptTransientStep(ctx);
    // One source read for the bias and two for the GS/BS branch voltages.
    // Previously Meyer and junction evaluation read the same bias twice.
    expect(getVoltage.mock.calls.filter(([node]) => node === 2)).toHaveLength(3);
    getVoltage.mockClear();
    device.stampTransientCharge(ctx, { method: 'euler', dt: 1e-9 });
    expect(getVoltage.mock.calls.filter(([node]) => node === 2)).toHaveLength(3);
  });
});
