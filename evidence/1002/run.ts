import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { simulate } from '../../packages/core/src/simulate.js';
import { MOS2 } from '../../packages/core/src/devices/mos2.js';
import { createTransientSim } from '../../packages/core/src/analysis/transient-driver.js';
import type { StampContext } from '../../packages/core/src/devices/device.js';

// Device-local observation only. No solver options or benchmark input edits.
type Observed = {
  evaluateCharges(ctx: StampContext, c: Float64Array, q: Float64Array): void;
  nodes: number[];
  charges: { acceptedCharge: Float64Array; acceptedCurrent: Float64Array; acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array; factor: number; truncation?: object; pending?: { method: string; dt: number }; incrementalCharge(i: number, v: number, c: number, averaged: boolean): number };
};
const trace: object[] = [];
const loaded = new Map<string, number[]>();
const stamp = MOS2.prototype.stampTransientCharge;
MOS2.prototype.stampTransientCharge = function(ctx, integration) {
  stamp.call(this, ctx, integration);
  const device = this as unknown as Observed;
  const c = new Float64Array(5), q = new Float64Array(5);
  device.evaluateCharges(ctx, c, q);
  const branches = [[1, 2], [1, 0], [1, 3]];
  for (let i = 0; i < 3; i++) {
    const [p, n] = branches[i];
    const v = (device.nodes[p] >= 0 ? ctx.getVoltage(device.nodes[p]) : 0) - (device.nodes[n] >= 0 ? ctx.getVoltage(device.nodes[n]) : 0);
    q[i] = device.charges.incrementalCharge(i, v, c[i], true);
  }
  loaded.set(this.name, [...q]);
};
const accept = MOS2.prototype.acceptTransientStep;
MOS2.prototype.acceptTransientStep = function(ctx) {
  const device = this as unknown as Observed;
  const c = new Float64Array(5), q = new Float64Array(5);
  device.evaluateCharges(ctx, c, q);
  const voltage = [[1, 2], [1, 0], [1, 3], [3, 2], [3, 0]].map(([p, n]) =>
    (device.nodes[p] >= 0 ? ctx.getVoltage(device.nodes[p]) : 0) - (device.nodes[n] >= 0 ? ctx.getVoltage(device.nodes[n]) : 0));
  for (let i = 0; i < 3; i++) q[i] = device.charges.incrementalCharge(i, voltage[i], c[i], true);
  const integration = device.charges.pending;
  accept.call(this, ctx);
  if (!device.charges.truncation && integration && (ctx.time < 0.1e-9 || (ctx.time > 480e-9 && ctx.time < 484e-9))) {
    trace.push({ time: ctx.time, device: this.name, integration,
      charge: [...device.charges.acceptedCharge], loadedCharge: loaded.get(this.name), current: [...device.charges.acceptedCurrent],
      voltage: [...device.charges.acceptedVoltage], capacitance: [...device.charges.acceptedCapacitance],
      solvedCapacitance: [...c], solvedCharge: [...q], solvedVoltage: voltage });
  }
};
async function main() {
const report: Record<string, unknown> = {};
for (const id of ['k-10', 'k-15']) {
  const receipt = JSON.parse(gunzipSync(readFileSync(`evidence/996/runs/${id}-original.json.gz`)).toString());
  const ng = receipt.ngspice.execution.analyses.find((a: { type: string }) => a.type === 'tran').series as { grid: number[]; signals: Record<string, { re: number }[]> };
  const result = (await simulate(receipt.deck)).transient!;
  const signals: Record<string, object> = {};
  for (const [name, samples] of Object.entries(ng.signals)) {
    const expected = samples.map(s => s.re);
    const actual = name.startsWith('v(') ? result.voltage(name.slice(2, -1)) : result.current(name.slice(2, -1));
    const peak = Math.max(...expected.map(Math.abs), name.startsWith('v(') ? 1e-4 : 1e-10);
    let cursor = 1, error = 0, worstTime = 0;
    for (let i = 0; i < result.time.length; i++) {
      const t = result.time[i];
      if (t < ng.grid[0] || t > ng.grid.at(-1)!) continue;
      while (cursor < ng.grid.length - 1 && ng.grid[cursor] < t) cursor++;
      const f = (t - ng.grid[cursor - 1]) / (ng.grid[cursor] - ng.grid[cursor - 1]);
      const value = expected[cursor - 1] + f * (expected[cursor] - expected[cursor - 1]);
      const delta = Math.abs(actual[i] - value);
      if (delta > error) { error = delta; worstTime = t; }
    }
    signals[name] = { maxAbs: error, normalized: error / peak, worstTime };
  }
  report[id] = { reference: `evidence/996/runs/${id}-original.json.gz`, points: result.time.length, signals };
  console.log(id, signals);
}
trace.length = 0;
const sim = await createTransientSim(readFileSync('evidence/996/repro/mosrect.cir', 'utf8'));
const observed = sim as unknown as { chargeTruncationTimestep(dt: number, integration: object, order?: number): number };
const truncation = observed.chargeTruncationTimestep.bind(sim);
const lte: object[] = [];
observed.chargeTruncationTimestep = (dt, integration, order) => {
  const bound = truncation(dt, integration, order);
  lte.push({ time: sim.simTime + dt, dt, integration, orderOverride: order, bound: Number.isFinite(bound) ? bound : 'Infinity' });
  return bound;
};
const steps: object[] = [];
while (!sim.isDone) {
  const prior = sim.convergence.transient.newtonIterations;
  const before = sim.simTime;
  sim.advance();
  steps.push({ time: sim.simTime, dt: sim.simTime - before, iterations: sim.convergence.transient.newtonIterations - prior });
}
const label = process.argv[2] ?? 'current';
writeFileSync(`evidence/1002/${label}-trace.json.gz`, gzipSync(JSON.stringify({ charges: trace, steps, lte, convergence: sim.convergence }) + '\n'));
writeFileSync(`evidence/1002/${label}.json`, JSON.stringify(report, null, 2) + '\n');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
