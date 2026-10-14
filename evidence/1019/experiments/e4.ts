// E4 diagnostic only. Relabel exactly one retained breakpoint by its native
// last-bit representation. No deck, sample, solver, tolerance or scorer edits.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { packExecution } from '../../../benchmarks/corpus/corpus-f/packed.js';
import { reduceRow, type Manifest } from '../../../benchmarks/corpus/corpus-j/parity.js';
import type { EngineExecution } from '../../../benchmarks/corpus/classic/report.js';
const root = 'evidence/1019/experiments';
const waves = JSON.parse(gunzipSync(readFileSync(`${root}/baseline-waveforms.json.gz`)).toString()) as Record<string, { ngspice: EngineExecution; spiceTs: EngineExecution }>;
const series = waves['k-13'].spiceTs.analyses[0].series;
const reference = waves['k-13'].ngspice.analyses[0].series;
const from = 15.200000000000004e-9, to = 15.2e-9;
const index = series.grid.indexOf(from);
if (index < 0 || !reference.grid.includes(to) || series.grid.filter(t => t === from).length !== 1) throw new Error('expected distinct breakpoint pair missing');
series.grid[index] = to;
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
const row = reduceRow(manifest.circuits.find(c => c.id === 'k-13')!,
  { status: 'success', execution: packExecution(waves['k-13'].ngspice) }, packExecution(waves['k-13'].spiceTs));
const baseline = JSON.parse(readFileSync(`${root}/baseline.json`, 'utf8'));
writeFileSync(`${root}/e4-waveforms.json.gz`, gzipSync(JSON.stringify(waves)+'\n'));
writeFileSync(`${root}/e4.json`, JSON.stringify({ ...baseline, variant: 'e4',
  command: `pnpm exec tsx ${root}/e4.ts`,
  diagnosticOnly: true, change: { index, from, to, deltaSeconds: to-from, samplesChanged: false },
  rows: { ...baseline.rows, 'k-13': row } }, null, 2)+'\n');
console.log(JSON.stringify({ change: { index, from, to }, error: row.worstNormalizedError }));
