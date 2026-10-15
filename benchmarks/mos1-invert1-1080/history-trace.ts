import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';
import { MOSFET } from '../../packages/core/src/devices/mosfet.js';
import { TransientChargeState } from '../../packages/core/src/devices/charge-state.js';
import type { ChargeIntegration } from '../../packages/core/src/devices/device.js';

// Diagnostic-only process-local wrappers. No production hooks or numerical changes.
interface DebugMOS {
  stateBase: number; bulkNode: number; capacitances: Float64Array;
  charges: { acceptedCharge: Float64Array; acceptedCurrent: Float64Array;
    acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array; truncation?: unknown; pending?: ChargeIntegration };
  stateStore: { values: Float64Array; loads?: Float64Array; predictFlags?: Uint8Array;
    predictRatio: number; predictedVoltage(node: number): number };
}
const records: object[] = [];
const staticLoads = new WeakMap<MOSFET, object>();
const attempts = new WeakMap<MOSFET, { attempt: number; iteration: number }>();
const begin = MOSFET.batchBeginTransientNewton;
MOSFET.batchBeginTransientNewton = function(devices, dt, accepted) {
  begin.call(this, devices, dt, accepted);
  devices.forEach(device => attempts.set(device, { attempt: (attempts.get(device)?.attempt ?? 0) + 1, iteration: 0 }));
};
let active: { entries: object[] } | undefined;
const current = TransientChargeState.prototype.current;
TransientChargeState.prototype.current = function(index, charge) {
  const result = current.call(this, index, charge);
  active?.entries.push({ index, charge, current: result, factor: this.factor });
  return result;
};
const batch = MOSFET.batchStamp;
const scalar = MOSFET.prototype.stamp;
MOSFET.prototype.stamp = function(ctx) {
  const d = this as unknown as DebugMOS;
  const s = d.stateStore;
  const predict = !!s.predictFlags?.[d.stateBase / 15];
  const terminals = [...this.nodes.slice(0, 3), d.bulkNode].map(n => predict ? s.predictedVoltage(n) : n < 0 ? 0 : ctx.getVoltage(n));
  scalar.call(this, ctx);
  staticLoads.set(this, { path: 'scalar', predict, ratio: s.predictRatio, terminals, cacheHit: false,
    loadedState: Array.from(s.values.slice(d.stateBase, d.stateBase + 15)) });
};
MOSFET.batchStamp = function(devices, g, b, solution, slots, gmin = 1e-12) {
  const before = devices.map(device => {
    const d = device as unknown as DebugMOS;
    const s = d.stateStore;
    const row = d.stateBase / 15;
    const predict = !!s.predictFlags?.[row];
    const terminals = [...device.nodes.slice(0, 3), d.bulkNode].map(n => predict ? s.predictedVoltage(n) : n < 0 ? 0 : solution[n]);
    const key = [...terminals, s.values[d.stateBase], s.values[d.stateBase + 1], gmin];
    const hit = key.every((v, i) => Number.isFinite(v) && Object.is(v, s.loads?.[row * 18 + i]));
    return { path: 'batch', predict, ratio: s.predictRatio, terminals, cacheHit: hit };
  });
  batch.call(this, devices, g, b, solution, slots, gmin);
  devices.forEach((device, i) => {
    const d = device as unknown as DebugMOS;
    staticLoads.set(device, { ...before[i], loadedState: Array.from(d.stateStore.values.slice(d.stateBase, d.stateBase + 15)) });
  });
};
const stamp = MOSFET.prototype.stampTransientCharge;
MOSFET.prototype.stampTransientCharge = function(ctx, integration) {
  const capture = ctx.time <= 19.51e-6;
  const d = this as unknown as DebugMOS;
  const attempt = attempts.get(this);
  if (attempt) attempt.iteration++;
  active = capture ? { entries: [] } : undefined;
  stamp.call(this, ctx, integration);
  if (capture) records.push({ kind: 'load', name: this.name, time: ctx.time, dt: ctx.dt, integration, ...attempt,
    static: staticLoads.get(this), terminals: [...this.nodes.slice(0, 3), d.bulkNode].map(n => n < 0 ? 0 : ctx.getVoltage(n)),
    capacitance: Array.from(d.capacitances), entries: active!.entries,
    acceptedCharge: Array.from(d.charges.acceptedCharge), acceptedCurrent: Array.from(d.charges.acceptedCurrent),
    acceptedVoltage: Array.from(d.charges.acceptedVoltage), acceptedCapacitance: Array.from(d.charges.acceptedCapacitance) });
  active = undefined;
};
const trunc = MOSFET.prototype.truncateTransientStep;
MOSFET.prototype.truncateTransientStep = function(ctx, input) {
  const bound = trunc.call(this, ctx, input);
  if (ctx.time <= 19.51e-6) records.push({ kind: 'lte', name: this.name, time: ctx.time, dt: ctx.dt, input, bound: Number.isFinite(bound) ? bound : null });
  return bound;
};
const accept = MOSFET.prototype.acceptTransientStep;
MOSFET.prototype.acceptTransientStep = function(ctx) {
  accept.call(this, ctx);
  const d = this as unknown as DebugMOS;
  if (ctx.time <= 19.51e-6) records.push({ kind: 'accept', name: this.name, time: ctx.time, dt: ctx.dt,
    charge: Array.from(d.charges.acceptedCharge), current: Array.from(d.charges.acceptedCurrent), voltage: Array.from(d.charges.acceptedVoltage) });
};
async function main() {
  const c = JSON.parse(readFileSync('benchmarks/corpus/corpus-m/manifest.json', 'utf8')).circuits.find((c: { id: string }) => c.id === 'm-18');
  const sim = await createTransientSim(readFileSync(c.localPath, 'utf8'));
  const accepted = [];
  try {
    while (!sim.isDone) {
      const step = sim.advance();
      const lookup = (values: Map<string, number>, name: string) => [...values].find(([key]) => key.toLowerCase() === name)?.[1];
      if (step.time <= 19.51e-6) accepted.push({ time: step.time, current: lookup(step.currents, 'vdddev'), output: lookup(step.voltages, 'vout') });
    }
  } finally { sim.dispose(); }
  writeFileSync('benchmarks/mos1-invert1-1080/ts-history.json.gz', gzipSync(JSON.stringify({ records, accepted })));
  console.log(JSON.stringify({ records: records.length, accepted: accepted.length, corner: accepted.find(p => Math.abs(p.time - 19.505e-6) < 1e-14) }));
}
void main();
