import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { simulate, parse } from '../../../packages/core/src/index.js';
import { runNgspice, alignAndMeasure, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';

// Paired all-signal receipts. Retained-signal selection happens AFTER scoring.
interface Capture { input: string; sha256: string; actual: SampleSeries; reference: SampleSeries }
const dir = new URL('./', import.meta.url);
async function main() {
  const candidate = process.env.ISSUE1059_CANDIDATE === '1';
  if (candidate) await import('./candidate.js');
  const label = candidate ? 'candidate' : 'baseline';
  const rows = [];
  for (const name of process.argv.slice(2)) {
    const input = name === 'pair' ? readFileSync(new URL('../issue-1059/pair.cir', import.meta.url), 'utf8') : readFileSync(`benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/${name}.cir`, 'utf8');
    const tran = parse(input).analyses.find(a => a.type === 'tran');
    if (!tran || tran.type !== 'tran') throw new Error('no transient');
    for (const variant of ['default', 'fine'] as const) {
      const netlist = variant === 'default' ? input : input.replace(/^\s*\.tran[^\n]*/mi, `.tran ${tran.timestep} ${tran.stopTime} 0 ${tran.timestep / 20}`);
      const ng = await runNgspice({ name: `${name}-${variant}`, netlist, analysis: 'tran', signals: [] });
      if (ng.status !== 'success') throw new Error(JSON.stringify(ng));
      const plot = (await simulate(netlist)).transient!;
      const actual: SampleSeries = { grid: plot.time, signals: Object.fromEntries([
        ...Array.from(plot.voltages, ([s, v]) => [`v(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
        ...Array.from(plot.currents, ([s, v]) => [`i(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
      ]) };
      const reference = ng.series;
      const signals = Object.keys(actual.signals).filter(s => reference.signals[s]);
      const metrics = alignAndMeasure(actual, reference, signals, { breakpoints: sharedGridPoints(actual.grid, reference.grid) });
      const errors = signals.map(signal => {
        const metric = metrics.signals[signal];
        if (metric.status !== 'compared') throw new Error(`missing ${signal}`);
        const peak = Math.max(signal.startsWith('i(') ? 1e-10 : 1e-4, ...reference.signals[signal].map(v => Math.abs(v.re)));
        return { signal, peak, max: metric.absoluteError.max, rms: metric.absoluteError.rms, normalized: metric.absoluteError.max / peak };
      }).sort((a, b) => b.normalized - a.normalized);
      const sha256 = createHash('sha256').update(netlist).digest('hex');
      if (name === 'arom') {
        const retained = new Set([...errors.slice(0, 2).map(e => e.signal), 'v(31)', 'v(33)']);
        const retain = (series: SampleSeries): SampleSeries => ({ grid: series.grid, signals: Object.fromEntries(Object.entries(series.signals).filter(([s]) => retained.has(s))) });
        const capture: Capture = { input: netlist, sha256, actual: retain(actual), reference: retain(reference) };
        writeFileSync(new URL(`${label}-${name}-${variant}.json.gz`, dir), gzipSync(JSON.stringify(capture)));
      }
      const row = { name, variant, sha256, tsPoints: actual.grid.length, ngPoints: reference.grid.length, errors };
      rows.push(row);
      writeFileSync(new URL(`${label}-scores.json`, dir), JSON.stringify(rows, null, 2) + '\n');
      console.log(JSON.stringify({ ...row, errors: errors.slice(0, 2) }));
    }
  }
}
void main();
