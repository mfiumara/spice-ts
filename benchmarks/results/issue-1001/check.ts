// Offline receipt verification: no solver/scorer edits and no native invocation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { linear } from './run.js';
import { packExecution } from '../../corpus/corpus-f/packed.js';
import { reduceRow, type Manifest } from '../../corpus/corpus-j/parity.js';
import type { EngineExecution } from '../../corpus/classic/report.js';
const root = 'benchmarks/results/issue-1001';
const receipt = JSON.parse(readFileSync(`${root}/receipt.json`, 'utf8'));
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-k/manifest.json', 'utf8')) as Manifest;
interface Capture { input: string; sha256: string; spiceTs: EngineExecution; reference: EngineExecution }
const capture = (name: string): Capture => JSON.parse(gunzipSync(readFileSync(`${root}/${name}.json.gz`)).toString());
assert.equal(receipt.rows.length, 18);
assert.equal(new Set(receipt.rows.map((r: { name: string }) => r.name)).size, 18);
const hashes = new Map<string, string[]>();
for (const row of receipt.rows) {
  const c = capture(row.name);
  assert.equal(createHash('sha256').update(c.input).digest('hex'), c.sha256);
  assert.equal(c.sha256, row.sha256);
  hashes.set(c.sha256, [...(hashes.get(c.sha256) ?? []), row.name]);
  const source = manifest.circuits.find(s => s.id === (row.name.startsWith('pump') ? 'k-13' : row.name.split('-').slice(0, 2).join('-')))!;
  if (row.name.endsWith('original')) assert.equal(source.sha256, c.sha256);
  assert.deepEqual(linear(c.spiceTs, c.reference), row.errors);
  const rescored = reduceRow({ ...source, sha256: c.sha256, analyses: row.canonical.analyses },
    { status: 'success', execution: packExecution(c.reference) }, packExecution(c.spiceTs));
  assert.deepEqual(JSON.parse(JSON.stringify(rescored)), row.canonical);
  assert.equal(row.spiceTsStatus, 'success'); assert.equal(row.ngspiceStatus, 'success');
  const isLoss = row.name === 'pump-reduced' || row.name === 'k-13-original';
  assert.equal(row.canonical.outcome, isLoss ? 'mismatch' : 'matched');
}
assert.equal(capture('pump-reduced').input, readFileSync(`${root}/pump-reduced.cir`, 'utf8'));
const original = capture('k-13-original');
const previous = JSON.parse(gunzipSync(readFileSync('evidence/1019/experiments/baseline-waveforms.json.gz')).toString())['k-13'];
assert.deepEqual(original.reference.analyses[0].series, previous.ngspice.analyses[0].series);
assert.deepEqual(original.spiceTs.analyses[0].series, previous.spiceTs.analyses[0].series);
const unchangedPaths = ['packages/core/src/devices/mos2.ts', 'packages/core/src/devices/charge-state.ts', 'packages/core/src/analysis/transient-step.ts'];
assert.equal(execFileSync('git', ['diff', '8534aed9538d3b3578b2110038a8e6ebd62be958', receipt.base, '--', ...unchangedPaths], { encoding: 'utf8' }), '');
const tsGrid = original.spiceTs.analyses[0].series.grid, ngGrid = original.reference.analyses[0].series.grid;
const index = tsGrid.findIndex((t, i) => Math.abs(t - ngGrid[i]) > 1e-18);
assert.equal(index >= 0, true);
const pumpRow = receipt.rows.find((r: { name: string }) => r.name === 'k-13-original');
const reducedRow = receipt.rows.find((r: { name: string }) => r.name === 'pump-reduced');
const cross = ['k-13-original', 'pump-reduced'].map(name => {
  const normal = capture(name), fine = capture(`${name}-fine`);
  return { name, defaultTsVsFineNative: linear(normal.spiceTs, fine.reference), defaultNativeVsFineNative: linear(normal.reference, fine.reference), fineTsVsFineNative: linear(fine.spiceTs, fine.reference) };
});
const report = { verifiedRows: receipt.rows.length, uniqueDecks: hashes.size,
  duplicateDecks: [...hashes].filter(([, names]) => names.length > 1).map(([sha256, names]) => ({ sha256, names })),
  previousWaveformsExact: { spiceTs: true, ngspice: true }, unchangedPaths,
  firstIndexedGridSplitOverOneAttosecond: { index, ts: tsGrid[index], ng: ngGrid[index] },
  pump: { linear: pumpRow.errors[0], shared: pumpRow.canonical.comparisons[0].metrics.signals['i(vnin)'] },
  reduced: reducedRow.errors[0], cross };
writeFileSync(`${root}/localization.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ verifiedRows: report.verifiedRows, uniqueDecks: report.uniqueDecks, duplicateDecks: report.duplicateDecks, firstSplit: report.firstIndexedGridSplitOverOneAttosecond, cross: cross.map(r => ({ name: r.name, tsDefaultVsFine: r.defaultTsVsFineNative[0], ngDefaultVsFine: r.defaultNativeVsFineNative[0] })) }, null, 2));
