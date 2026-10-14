// Evidence-only variants execute in private copied core trees, never production files.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseNgspiceRaw } from '../../../benchmarks/comparison-harness.js';
import { packExecution } from '../../../benchmarks/corpus/corpus-f/packed.js';
import { reduceRow, type Circuit, type Manifest } from '../../../benchmarks/corpus/corpus-j/parity.js';
import type { EngineExecution } from '../../../benchmarks/corpus/classic/report.js';
import type { MOS2 as MOS2Type } from '../../../packages/core/src/devices/mos2.js';
import type { StampContext } from '../../../packages/core/src/devices/device.js';

async function main() {
const root = 'evidence/1019/experiments';
const variant = process.argv[2] ?? 'baseline';
if (!['baseline', 'e1', 'e2', 'e2-first', 'e3'].includes(variant)) throw new Error('unknown variant');
const coreRoot = ['e2', 'e2-first', 'e3'].includes(variant) ? `${root}/work/${variant}/src` : 'packages/core/src';
const { MOS2 } = await import(pathToFileURL(resolve(`${coreRoot}/devices/mos2.ts`)).href) as { MOS2: typeof MOS2Type };
const { simulate } = await import(pathToFileURL(resolve(`${coreRoot}/simulate.ts`)).href) as typeof import('../../../packages/core/src/simulate.js');
type Load = { vgs: number; vds: number; vbs: number; vbd: number; mode: number; cd: number; cbd: number; cbs: number; gm: number; gmbs: number; gds: number; gbd: number; gbs: number; limited: boolean };
type Observed = { lastLoad: Load; predictedTerminals?: number[]; transientLoadContext?: StampContext; loadedVoltage: Float64Array; loadedCharge: Float64Array; charges: { truncation?: object; acceptedCharge: Float64Array; acceptedVoltage: Float64Array } };
const traces: Record<string, object[]> = {};
let trace: object[] = [];
let lastTime = 0;
const stamp = MOS2.prototype.stamp;
MOS2.prototype.stamp = function(ctx) {
  lastTime = ctx.time;
  const before = this as unknown as Observed;
  const predicted = before.predictedTerminals?.slice();
  const previous = { ...before.lastLoad };
  const raw = this.nodes.map(n => n < 0 ? 0 : ctx.getVoltage(n));
  stamp.call(this, ctx);
  if (ctx.time >= 5e-9 && ctx.time <= 5.03e-9) trace.push({ event: 'load', time: ctx.time, device: this.name, predicted, raw, previous, loaded: { ...before.lastLoad } });
};
const charge = MOS2.prototype.stampTransientCharge;
MOS2.prototype.stampTransientCharge = function(ctx, integration) {
  charge.call(this, ctx, integration);
  if (ctx.time >= 5e-9 && ctx.time <= 5.03e-9) {
    const d = this as unknown as Observed;
    trace.push({ event: 'charge', time: ctx.time, device: this.name, voltage: [...d.loadedVoltage], charge: [...d.loadedCharge] });
  }
};
const conv = MOS2.prototype.convergenceTest;
// Observation before the solver's node damping and convergence short circuit.
const observedPrototype = MOS2.prototype as MOS2Type & { observeTransientNewton(solution: Float64Array): void };
observedPrototype.observeTransientNewton = function(solution) {
  if (lastTime >= 5e-9 && lastTime <= 5.03e-9) {
    const d = this as unknown as Observed;
    trace.push({ event: 'newton', time: lastTime, device: this.name, solution: [...solution], loaded: { ...d.lastLoad } });
  }
};
MOS2.prototype.convergenceTest = function(solution, tol) {
  const result = conv.call(this, solution, tol);
  if (lastTime >= 5e-9 && lastTime <= 5.03e-9) {
    const d = this as unknown as Observed;
    const l = d.lastLoad;
    const [dn, gn, sn, bn] = this.nodes;
    const read = (n: number) => n < 0 ? 0 : solution[n];
    const p = this.model.polarity;
    const vgs = p * (read(gn)-read(sn)), vds = p * (read(dn)-read(sn)), vbs = p * (read(bn)-read(sn));
    const delvbd = vbs-vds-l.vbd, delvgs = vgs-l.vgs, delvds = vds-l.vds, delvbs = vbs-l.vbs;
    const cdhat = l.mode >= 0 ? l.cd-l.gbd*delvbd+l.gmbs*delvbs+l.gm*delvgs+l.gds*delvds
      : l.cd-(l.gbd-l.gmbs)*delvbd-l.gm*(delvgs-delvds)+l.gds*delvds;
    const cb = l.cbs+l.cbd, cbhat = cb+l.gbd*delvbd+l.gbs*delvbs;
    trace.push({ event: 'convergence', time: lastTime, device: this.name, result, cdhat, cd: l.cd, cbhat, cb,
      drainTolerance: tol.reltol*Math.max(Math.abs(cdhat),Math.abs(l.cd))+tol.abstol,
      bulkTolerance: tol.reltol*Math.max(Math.abs(cbhat),Math.abs(cb))+tol.abstol });
  }
  return result;
};
const accept = MOS2.prototype.acceptTransientStep;
MOS2.prototype.acceptTransientStep = function(ctx) {
  accept.call(this, ctx);
  const d = this as unknown as Observed;
  if (!d.charges.truncation) trace.push({ event: 'accepted', time: ctx.time, device: this.name, charge: [...d.charges.acceptedCharge], voltage: [...d.charges.acceptedVoltage] });
};
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
const pump = manifest.circuits.find(c => c.id === 'k-13')!;
const inputs = JSON.parse(readFileSync(`${root}/inputs.json`, 'utf8')) as Record<string, string>;
const rows: Record<string, ReturnType<typeof reduceRow>> = {};
const waves: Record<string, { ngspice: EngineExecution; spiceTs: EngineExecution }> = {};
function native(id: string): EngineExecution {
  const raw = gunzipSync(readFileSync(`${root}/${variant === 'e1' ? 'e1' : 'baseline'}-${id}.raw.gz`)).toString();
  const plot = parseNgspiceRaw(raw).find(p => p.plotName.toLowerCase().includes('transient'));
  if (!plot) throw new Error('native transient missing');
  return { status: 'success', convergence: 'converged', analyses: [{ type: 'tran', plotName: plot.plotName, series: { grid: plot.grid, signals: plot.signals } }] };
}
for (const id of Object.keys(inputs)) {
  trace = [];
  const bytes = readFileSync(`${root}/work/${id}.cir`);
  if (createHash('sha256').update(bytes).digest('hex') !== inputs[id]) throw new Error('input changed');
  const result = (await simulate(bytes.toString())).transient;
  if (!result) throw new Error('TS transient missing');
  const signals = Object.fromEntries([
    ...[...result.voltages].map(([n, v]) => [`v(${n.toLowerCase()})`, Array.from(v, re => ({ re, im: 0 }))]),
    ...[...result.currents].map(([n, v]) => [`i(${n.toLowerCase()})`, Array.from(v, re => ({ re, im: 0 }))]),
  ]);
  const ts: EngineExecution = { status: 'success', convergence: 'converged', analyses: [{ type: 'tran', plotName: 'Transient Analysis', series: { grid: Array.from(result.time), signals } }] };
  const ng = native(id);
  const circuit = manifest.circuits.find(c => c.id === id) ?? { ...pump, id, sha256: inputs[id], sameNameAs: [],
    sourcePath: id === 'mosamp2' ? 'classic/spice3f5/mosamp2.cir' : 'project-authored RC order-cap regression' } as Circuit;
  rows[id] = reduceRow(circuit, { status: 'success', execution: packExecution(ng) }, packExecution(ts));
  waves[id] = { ngspice: ng, spiceTs: ts };
  if (id === 'k-13') traces[id] = trace;
  console.log(id, rows[id].worstNormalizedError, rows[id].spiceTs.analyses, rows[id].ngspice.analyses);
}
writeFileSync(`${root}/${variant}-waveforms.json.gz`, gzipSync(JSON.stringify(waves)+'\n'));
writeFileSync(`${root}/${variant}-ts-trace.json.gz`, gzipSync(JSON.stringify(traces)+'\n'));
writeFileSync(`${root}/${variant}.json`, JSON.stringify({ variant, command: `spice-heavy pnpm exec tsx ${root}/run.ts ${variant}`,
  baseSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  coreTree: execFileSync('git', ['rev-parse', 'HEAD:packages/core'], { encoding: 'utf8' }).trim(),
  node: process.version, productionFilesChanged: [], rows }, null, 2)+'\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
