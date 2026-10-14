import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { simulate } from '../../../packages/core/src/index.js';
import { MOS3 } from '../../../packages/core/src/devices/mos3.js';
import type { ChargeIntegration, ChargeTruncation, StampContext } from '../../../packages/core/src/devices/device.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';

interface ChargeState {
  acceptedCharge: Float64Array; previousCharge: Float64Array; olderCharge: Float64Array;
  acceptedCurrent: Float64Array; acceptedVoltage: Float64Array; acceptedCapacitance: Float64Array;
  pending?: ChargeIntegration; truncation?: ChargeTruncation;
  incrementalCharge(i: number, v: number, c: number, average: boolean): number;
  current(i: number, q: number): number;
}
interface DebugMOS {
  charges: ChargeState; capacitanceScratch: Float64Array; lastLoad: Record<string, number | boolean>;
  model: { polarity: number };
  lastVbs: number; lastVbd: number; lastVon: number;
}
interface RecordRow {
  kind: string; name: string; time: number; dt: number; [key: string]: unknown;
}
let rows: RecordRow[] = [];
const traceEnd = Number(process.env.ISSUE1059_TRACE_END ?? '1');
const traceStart = Number(process.env.ISSUE1059_TRACE_START ?? '0');
const beforeStatic = new WeakMap<MOS3, unknown>();
const staticStamp = MOS3.prototype.stamp;
MOS3.prototype.stamp = function(ctx) {
  if (ctx.time <= traceEnd && ctx.time >= traceStart) {
    const d = this as unknown as DebugMOS;
    beforeStatic.set(this, { lastLoad: { ...d.lastLoad }, lastVbs: d.lastVbs, lastVbd: d.lastVbd, lastVon: d.lastVon });
  }
  staticStamp.call(this, ctx);
};
const state = (d: DebugMOS) => ({
  q: Array.from(d.charges.acceptedCharge), previousQ: Array.from(d.charges.previousCharge), olderQ: Array.from(d.charges.olderCharge),
  cq: Array.from(d.charges.acceptedCurrent), voltage: Array.from(d.charges.acceptedVoltage), capacitance: Array.from(d.charges.acceptedCapacitance),
});
const stamp = MOS3.prototype.stampTransientCharge;
MOS3.prototype.stampTransientCharge = function(ctx, integration) {
  stamp.call(this, ctx, integration);
  if (ctx.time > traceEnd || ctx.time < traceStart) return;
  const d = this as unknown as DebugMOS;
  const [nd, ng, ns, nb] = this.nodes.map(n => n < 0 ? 0 : ctx.getVoltage(n));
  const voltage = [ng - ns, ng - nd, ng - nb];
  const capacitance = Array.from(d.capacitanceScratch);
  const q = voltage.map((v, i) => d.charges.incrementalCharge(i, v, capacitance[i], true));
  rows.push({ kind: 'load', name: this.name.toLowerCase(), time: ctx.time, dt: ctx.dt, integration, polarity: d.model.polarity,
    raw: [d.model.polarity * (ng - ns), d.model.polarity * (nd - ns), d.model.polarity * (nb - ns)],
    beforeStatic: beforeStatic.get(this), limited: { ...d.lastLoad }, capacitance, q, cq: q.map((v, i) => d.charges.current(i, v)), history: state(d) });
};
const accept = MOS3.prototype.acceptTransientStep;
MOS3.prototype.acceptTransientStep = function(ctx) {
  const d = this as unknown as DebugMOS;
  const truncating = d.charges.truncation !== undefined;
  const integration = d.charges.pending;
  accept.call(this, ctx);
  if (!truncating && ctx.time <= traceEnd && ctx.time >= traceStart) rows.push({ kind: 'accept', name: this.name.toLowerCase(), time: ctx.time, dt: ctx.dt, integration, polarity: d.model.polarity, state: state(d) });
};
const truncate = MOS3.prototype.truncateTransientStep;
MOS3.prototype.truncateTransientStep = function(ctx: StampContext, truncation: ChargeTruncation) {
  const bound = truncate.call(this, ctx, truncation);
  if (ctx.time <= traceEnd && ctx.time >= traceStart) rows.push({ kind: 'trunc', name: this.name.toLowerCase(), time: ctx.time, dt: ctx.dt, truncation, bound: Number.isFinite(bound) ? bound : null });
  return bound;
};

async function main() {
  const binary = process.env.ISSUE1059_NATIVE;
  if (!binary) throw new Error('Set ISSUE1059_NATIVE to instrumented pinned ngspice-47');
  if (!process.env.ISSUE1059_TRACE_END) throw new Error('Set a bounded ISSUE1059_TRACE_END to keep trace memory bounded');
  const dir = new URL('./', import.meta.url);
  for (const name of process.argv.slice(2)) {
    const input = readFileSync(name === 'pair' ? 'benchmarks/results/issue-1059/pair.cir' : `benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/${name}.cir`, 'utf8');
    const scratch = mkdtempSync(join(tmpdir(), '1059-loadstate-'));
    writeFileSync(join(scratch, 'input.cir'), input);
    writeFileSync(join(scratch, '.spiceinit'), 'set filetype=ascii\n');
    const fd = openSync(join(scratch, 'trace.txt'), 'w');
    const run = spawnSync(binary, ['-b', '-r', join(scratch, 'output.raw'), join(scratch, 'input.cir')], {
      env: { ...process.env, HOME: scratch, ISSUE1059_LOADSTATE: '1' }, stdio: ['ignore', 'pipe', fd], encoding: 'utf8', timeout: 120000,
    });
    closeSync(fd);
    if (run.status !== 0) throw new Error(`ngspice failed ${run.status}: ${run.error?.message ?? run.signal}; see ${scratch}/trace.txt`);
    writeFileSync(new URL(`${name}-native.txt.gz`, dir), gzipSync(readFileSync(join(scratch, 'trace.txt'))));
    const plot = parseNgspiceRaw(readFileSync(join(scratch, 'output.raw'), 'utf8')).find(p => p.plotName.toLowerCase().includes('transient'))!;
    rows = [];
    const ts = (await simulate(input)).transient!;
    const actual = { grid: ts.time, signals: Object.fromEntries([
      ...Array.from(ts.voltages, ([s, v]) => [`v(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
      ...Array.from(ts.currents, ([s, v]) => [`i(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
    ]) };
    const capture = { input, sha256: createHash('sha256').update(input).digest('hex'), actual, reference: { grid: plot.grid, signals: plot.signals } };
    writeFileSync(new URL(`${name}-waveforms.json.gz`, dir), gzipSync(JSON.stringify(capture)));
    writeFileSync(new URL(`${name}-ts.json.gz`, dir), gzipSync(JSON.stringify(rows)));
    console.log(JSON.stringify({ name, scratch, tsPoints: ts.time.length, nativePoints: plot.grid.length, tsRecords: rows.length, sha256: capture.sha256 }));
  }
}
void main();
