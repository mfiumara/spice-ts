import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { simulate } from '../../../packages/core/src/index.js';
import { runNgspice, alignAndMeasure, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';

interface Capture { input: string; sha256: string; actual: SampleSeries; reference: SampleSeries }
function difference(a: SampleSeries, b: SampleSeries) {
  if (JSON.stringify(a.grid) !== JSON.stringify(b.grid)) throw new Error('Observation-only trace changed accepted grid');
  const signals = Object.keys(a.signals).sort();
  if (JSON.stringify(signals) !== JSON.stringify(Object.keys(b.signals).sort())) throw new Error('Observation-only trace changed signal set');
  let max = 0;
  for (const s of signals) for (let i = 0; i < a.grid.length; i++) max = Math.max(max, Math.abs(a.signals[s][i].re - b.signals[s][i].re));
  return { points: a.grid.length, signals: signals.length, maxAbsoluteDifference: max };
}
async function main() {
  const rows = [];
  for (const name of ['pair', 'gm19', 'arom']) {
    const capture = JSON.parse(gunzipSync(readFileSync(new URL(`${name}-waveforms.json.gz`, import.meta.url))).toString()) as Capture;
    if (createHash('sha256').update(capture.input).digest('hex') !== capture.sha256) throw new Error('Input hash mismatch');
    const ng = await runNgspice({ name, netlist: capture.input, analysis: 'tran', signals: [] });
    if (ng.status !== 'success') throw new Error(JSON.stringify(ng));
    const plot = (await simulate(capture.input)).transient!;
    const ts: SampleSeries = { grid: plot.time, signals: Object.fromEntries([
      ...Array.from(plot.voltages, ([s, v]) => [`v(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
      ...Array.from(plot.currents, ([s, v]) => [`i(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
    ]) };
    const observationOnly = { ts: difference(ts, capture.actual), native: difference(ng.series, capture.reference) };
    if (observationOnly.ts.maxAbsoluteDifference !== 0 || observationOnly.native.maxAbsoluteDifference !== 0) throw new Error('Trace changed output');
    const common = Object.keys(ts.signals).filter(s => ng.series.signals[s]);
    const metrics = alignAndMeasure(ts, ng.series, common, { breakpoints: sharedGridPoints(ts.grid, ng.series.grid) });
    const errors = common.map(signal => {
      const metric = metrics.signals[signal];
      if (metric.status !== 'compared') throw new Error('Missing metric');
      const peak = Math.max(signal.startsWith('i(') ? 1e-10 : 1e-4, ...ng.series.signals[signal].map(v => Math.abs(v.re)));
      return { signal, peak, max: metric.absoluteError.max, rms: metric.absoluteError.rms, normalized: metric.absoluteError.max / peak };
    }).sort((a, b) => b.normalized - a.normalized);
    rows.push({ name, sha256: capture.sha256, observationOnly, errors });
    console.log(JSON.stringify({ name, observationOnly, worst: errors[0] }));
  }
  writeFileSync(new URL('verification.json', import.meta.url), JSON.stringify(rows, null, 2) + '\n');
}
void main();
