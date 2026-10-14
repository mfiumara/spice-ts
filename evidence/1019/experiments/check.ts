// Offline check: replay unchanged shared scorer against every retained waveform.
import { deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseNgspiceRaw } from '../../../benchmarks/comparison-harness.js';
import { packExecution } from '../../../benchmarks/corpus/corpus-f/packed.js';
import { reduceRow, type Manifest, type Circuit } from '../../../benchmarks/corpus/corpus-j/parity.js';
import type { EngineExecution } from '../../../benchmarks/corpus/classic/report.js';
const root = 'evidence/1019/experiments';
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
const inputs = JSON.parse(readFileSync(`${root}/inputs.json`, 'utf8'));
let count = 0;
for (const variant of ['baseline', 'e1', 'e2', 'e2-first', 'e3', 'e4']) {
  const report = JSON.parse(readFileSync(`${root}/${variant}.json`, 'utf8'));
  const waves = JSON.parse(gunzipSync(readFileSync(`${root}/${variant}-waveforms.json.gz`)).toString()) as Record<string, { ngspice: EngineExecution; spiceTs: EngineExecution }>;
  for (const [id, wave] of Object.entries(waves)) {
    const circuit = manifest.circuits.find(c => c.id === id) ?? { ...manifest.circuits.find(c => c.id === 'k-13')!, id, sha256: inputs[id], sameNameAs: [],
      sourcePath: id === 'mosamp2' ? 'classic/spice3f5/mosamp2.cir' : 'project-authored RC order-cap regression' } as Circuit;
    const row = reduceRow(circuit, { status: 'success', execution: packExecution(wave.ngspice) }, packExecution(wave.spiceTs));
    deepStrictEqual(JSON.parse(JSON.stringify(row)), report.rows[id], `${variant}/${id}`);
    if (variant === 'baseline' || variant === 'e1') {
      const plot = parseNgspiceRaw(gunzipSync(readFileSync(`${root}/${variant}-${id}.raw.gz`)).toString()).find(p => p.plotName.toLowerCase().includes('transient'))!;
      deepStrictEqual({ grid: plot.grid, signals: plot.signals }, wave.ngspice.analyses[0].series, `${variant}/${id} native raw`);
    }
    count++;
  }
}
console.log(`${count} retained comparisons reproduce exactly using the unchanged shared scorer`);
