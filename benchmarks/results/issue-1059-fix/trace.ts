import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { simulate } from '../../../packages/core/src/index.js';
import { MOS3 } from '../../../packages/core/src/devices/mos3.js';
import type { ChargeIntegration } from '../../../packages/core/src/devices/device.js';

interface DebugState {
  acceptedCharge: Float64Array; previousCharge: Float64Array; olderCharge: Float64Array;
  acceptedCurrent: Float64Array; acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array;
  pending?: ChargeIntegration; truncation?: unknown; historyLength: number;
}
interface DebugMOS { charges: DebugState; capacitanceScratch: Float64Array; lastLoad: unknown }
const times = new WeakMap<MOS3, number>();
const loads = new WeakMap<MOS3, unknown>();
const records: unknown[] = [];
const stamp = MOS3.prototype.stampTransientCharge;
MOS3.prototype.stampTransientCharge = function(ctx, integration) {
  stamp.call(this, ctx, integration);
  const d = this as unknown as DebugMOS;
  loads.set(this, { voltages: this.nodes.map(n => n < 0 ? 0 : ctx.getVoltage(n)), capacitances: Array.from(d.capacitanceScratch), lastLoad: { ...d.lastLoad as object } });
};
const accept = MOS3.prototype.acceptTransientStep;
MOS3.prototype.acceptTransientStep = function(ctx) {
  const d = this as unknown as DebugMOS;
  const pending = d.charges.pending;
  const truncating = d.charges.truncation !== undefined;
  accept.call(this, ctx);
  if (!truncating) {
    const time = (times.get(this) ?? 0) + (pending?.dt ?? 0);
    times.set(this, time);
    records.push({ kind: 'accept', name: this.name, time, charge: Array.from(d.charges.acceptedCharge), voltage: Array.from(d.charges.acceptedVoltage), current: Array.from(d.charges.acceptedCurrent), capacitance: Array.from(d.charges.acceptedCapacitance), load: loads.get(this) });
  }
};
const truncate = MOS3.prototype.truncateTransientStep;
MOS3.prototype.truncateTransientStep = function(ctx, truncation) {
  const d = this as unknown as DebugMOS;
  const before = { charge: Array.from(d.charges.acceptedCharge), previous: Array.from(d.charges.previousCharge), older: Array.from(d.charges.olderCharge), current: Array.from(d.charges.acceptedCurrent), voltage: Array.from(d.charges.acceptedVoltage), capacitance: Array.from(d.charges.acceptedCapacitance), historyLength: d.charges.historyLength };
  const bound = truncate.call(this, ctx, truncation);
  records.push({ kind: 'trunc', name: this.name, time: (times.get(this) ?? 0) + truncation.deltas[0], truncation, integration: d.charges.pending, bound, voltages: this.nodes.map(n => n < 0 ? 0 : ctx.getVoltage(n)), before, load: loads.get(this) });
  return bound;
};
async function main() {
  const result = await simulate(readFileSync(new URL('../issue-1059/pair.cir', import.meta.url), 'utf8'));
  writeFileSync(new URL('trace.json.gz', import.meta.url), gzipSync(JSON.stringify({ grid: result.transient!.time, records })));
}
void main();
