import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignAndMeasure, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';
interface RealSeries { grid: number[]; signals: Record<string, number[]> }
interface Capture { input: string; sha256: string; reference: RealSeries; spiceTs: RealSeries }
const here = dirname(fileURLToPath(import.meta.url));
function complex(series: RealSeries): SampleSeries {
  return { grid: series.grid, signals: Object.fromEntries(Object.entries(series.signals).map(([s, v]) => [s, v.map(re => ({ re, im: 0 }))])) };
}
const rows = [];
for (const file of readdirSync(here).filter(f => f.endsWith('.waveforms.json.gz')).sort()) {
  const capture = JSON.parse(gunzipSync(readFileSync(resolve(here, file))).toString()) as Capture;
  if (createHash('sha256').update(capture.input).digest('hex') !== capture.sha256) throw new Error(`${file}: digest mismatch`);
  const requested = Object.keys(capture.spiceTs.signals).filter(s => capture.reference.signals[s]);
  const metrics = alignAndMeasure(complex(capture.spiceTs), complex(capture.reference), requested, { breakpoints: sharedGridPoints(capture.spiceTs.grid, capture.reference.grid) });
  const errors = requested.map(signal => {
    const score = metrics.signals[signal];
    if (score.status !== 'compared') throw new Error(`${file}: ${signal} missing`);
    const peak = Math.max(signal.startsWith('i(') ? 1e-10 : 1e-4, ...capture.reference.signals[signal].map(Math.abs));
    return { signal, peak, absoluteMax: score.absoluteError.max, absoluteRms: score.absoluteError.rms, normalized: score.absoluteError.max / peak };
  }).sort((a, b) => b.normalized - a.normalized);
  rows.push({ file, sha256: capture.sha256, errors });
}
writeFileSync(resolve(here, 'canonical-scores.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(rows.map(r => ({ file: r.file, worst: r.errors[0] })));
