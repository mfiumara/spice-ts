import { expect, it, vi } from 'vitest';
import type { StampContext } from './device.js';
import { MOS2, resolveMOS2Model } from './mos2.js';

function context(voltages: number[]): StampContext {
  return {
    stampC: () => {}, stampG: () => {}, stampB: () => {},
    getVoltage: node => voltages[node] ?? 0, getCurrent: () => 0,
    time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
    operatingPointPhase: 'fixed',
  };
}

// ngspice-47 mos2load.c:236 computes vbd before gate/drain limiting;
// :358 limits that raw vbd, then :360 restores vbs = vbd + limited vds.
// The raw drain-bulk voltage here is zero, even though DEVlimvds changes
// vds from -10 to -0.5. Recomputing vbd after that limit invents a reverse
// junction bias and changes the channel's body effect.
it.each([1, -1])('keeps raw inverse junction bias across DC drain limiting (polarity %i)', polarity => {
  const model = resolveMOS2Model('M2', { VTO: polarity * 0.7, KP: 1e-4 }, polarity);
  const mos = new MOS2('M1', [0, 1, 2, 3], model, { W: 10e-6, L: 2e-6 });
  mos.stamp(context([0, 0, 0, 0]));
  const evaluate = vi.spyOn(mos, 'evaluateChannel');
  mos.stamp(context([-10 * polarity, 0, 0, -10 * polarity]));
  expect(evaluate).toHaveBeenLastCalledWith(polarity * 0, -0.5, -0.5, 0, 0);
  expect(mos.limitedLastStamp()).toBe(false);
});
