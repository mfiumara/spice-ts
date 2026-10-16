import { describe, expect, it, vi } from 'vitest';
import type { StampContext } from './device.js';
import { MOS6, resolveMOS6Model } from './mos6.js';

describe('MOS6 cold load work (#1206)', () => {
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
