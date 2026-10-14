import { readFileSync, writeFileSync } from 'node:fs';
import { alignAndMeasure, runSpiceTs, type SampleSeries } from '../../../comparison-harness.js';
import { runNgspiceReference, sha256 } from '../../expanded.js';
import { runXyce } from '../../xyce.js';

const dir = 'benchmarks/reference/investigations/974';
const input = readFileSync('benchmarks/reference/mutual-948/corpus-e/lc-oscillator-transient/0-tran.cir', 'utf8');
const expected = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8')).cases.find((c: any) => c.key === 'corpus-e/lc-oscillator-transient' && c.variant === 'baseline').savedInputSha256;
if (sha256(input) !== expected) throw new Error('Hash mismatch');
const grid = Array.from({ length: 20001 }, (_, i) => i * .005);
// KCL v' + iL = -iSource and iL'=v. DCOP: v=0, iL=-5.
// During ramp v''+v=50. Thereafter the drive is zero.
const exact: SampleSeries = { grid, signals: { 'v(1)': grid.map(t => ({ re: t <= .1 ? 50 * (1 - Math.cos(t)) : 50 * (Math.cos(t - .1) - Math.cos(t)), im: 0 })) } };
function uniform(s: SampleSeries): SampleSeries {
  let j = 0;
  return { grid, signals: { 'v(1)': grid.map(t => {
    while (j + 1 < s.grid.length && s.grid[j + 1] < t) j++;
    const k = Math.min(j + 1, s.grid.length - 1);
    const f = s.grid[k] === s.grid[j] ? 0 : (t - s.grid[j]) / (s.grid[k] - s.grid[j]);
    return { re: s.signals['v(1)'][j].re * (1 - f) + s.signals['v(1)'][k].re * f, im: 0 };
  }) } };
}
async function main() {
  const results = [];
  for (const step of [null, .01, .005]) {
    const netlist = step === null ? input : input.replace('.tran .5 100 0', `.tran .5 100 0 ${step}`);
    const f = { name: 'lc-grid', netlist, analysis: 'tran' as const, signals: ['v(1)', 'i(l1)'] };
    const runs = { ngspice: runNgspiceReference(netlist, 'tran'), xyce: await runXyce(f), spiceTs: await runSpiceTs(f) };
    const series: Record<string, SampleSeries> = {};
    const receipts: any = {};
    for (const [engine, r] of Object.entries(runs)) {
      if (r.status !== 'success') throw new Error(`${engine}: ${r.error}`);
      series[engine] = uniform(r.series);
      const dt = r.series.grid.slice(1).map((t, i) => t - r.series.grid[i]);
      const crossings = r.series.grid.slice(1).flatMap((t, i) => {
        const a = r.series.signals['v(1)'][i].re, b = r.series.signals['v(1)'][i + 1].re;
        return a < 0 && b >= 0 ? [r.series.grid[i] + (t - r.series.grid[i]) * (-a) / (b - a)] : [];
      });
      receipts[engine] = { nativePoints: r.series.grid.length, maxDt: Math.max(...dt), positiveCrossings: crossings,
        analyticNativeGrid: alignAndMeasure(r.series, exact, ['v(1)']), analyticUniformGrid: alignAndMeasure(series[engine], exact, ['v(1)']) };
    }
    results.push({ maxstep: step, sha256: sha256(netlist), receipts, uniformNgspiceVsXyce: alignAndMeasure(series.ngspice, series.xyce, ['v(1)']),
      uniformSpiceTsVsNgspice: alignAndMeasure(series.spiceTs, series.ngspice, ['v(1)']) });
  }
  writeFileSync(`${dir}/grid-report.json`, JSON.stringify({ grid: { start: 0, end: 100, step: .005, points: grid.length }, results }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
