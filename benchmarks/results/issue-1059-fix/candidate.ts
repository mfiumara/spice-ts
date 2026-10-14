import { MOS3 } from '../../../packages/core/src/devices/mos3.js';
import type { StampContext } from '../../../packages/core/src/devices/device.js';
// Experiment only: use the final charge load's voltage, not the subsequent solve.
const loaded = new WeakMap<MOS3, Map<number, number>>();
const stamp = MOS3.prototype.stampTransientCharge;
MOS3.prototype.stampTransientCharge = function(ctx, integration) {
  stamp.call(this, ctx, integration);
  loaded.set(this, new Map(this.nodes.map(n => [n, n < 0 ? 0 : ctx.getVoltage(n)])));
};
const accept = MOS3.prototype.acceptTransientStep;
MOS3.prototype.acceptTransientStep = function(ctx) {
  const voltages = loaded.get(this);
  const loadCtx: StampContext = voltages ? { ...ctx, getVoltage: n => voltages.get(n) ?? ctx.getVoltage(n) } : ctx;
  accept.call(this, loadCtx);
};
const reset = MOS3.prototype.resetTransient;
MOS3.prototype.resetTransient = function() { loaded.delete(this); reset.call(this); };
