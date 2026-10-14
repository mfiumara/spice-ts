#!/usr/bin/env tsx
/** Prepare unchanged translated decks, then compare container CSV to Mac series. */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { alignAndMeasure, type ComparisonFixture, type SuccessfulEngineRun } from '../comparison-harness.js';
import { loadCorpus } from './compare.js';
import { parseXyceCsv, runXyce, translateForXyce } from './xyce.js';

const root = resolve('benchmarks/reference/linux-build');
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const read = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const save = (name: string, value: unknown) => writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + '\n');

async function prepare(): Promise<void> {
  const corpusReport = JSON.parse(readFileSync('benchmarks/reference/corpus-report.json', 'utf8'));
  const compared = corpusReport.fixtures.filter((row: { comparisons: unknown[] }) => row.comparisons.length > 0);
  if (compared.length !== 19) throw new Error('Expected original 19 compared fixtures');
  const corpus = loadCorpus();
  const ekv = JSON.parse(readFileSync('benchmarks/reference/ekv-report.json', 'utf8')).fixtures;
  const fixtures: ComparisonFixture[] = ekv.map((row: { key: string; series: { xyce: { signals: object } } }) => {
    let netlist = readFileSync(`benchmarks/reference/ekv/fixtures/${row.key}.cir`, 'utf8');
    if (!/^\s*\.end\s*$/im.test(netlist)) netlist = netlist.trimEnd() + '\n.end\n';
    return { name: row.key, analysis: row.key.includes('transient') ? 'tran' : 'dc', netlist, signals: Object.keys(row.series.xyce.signals) };
  });
  for (const row of compared) {
    const input = corpus.find(item => item.key === row.key);
    if (!input) throw new Error(`Missing ${row.key}`);
    fixtures.push({ name: row.key, analysis: row.comparisons[0].analysis, signals: row.comparisons[0].signals, netlist: input.input.toString('utf8') });
  }
  if (fixtures.length !== 22 || new Set(fixtures.map(f => f.name)).size !== 22) throw new Error('Expected 22 unique fixtures');
  const rows = [];
  for (const [index, fixture] of fixtures.entries()) {
    const translated = translateForXyce(fixture);
    const original = [...ekv, ...compared].find(row => row.key === fixture.name);
    if (hash(translated.netlist) !== original.translation.sha256) throw new Error(`Translation drift: ${fixture.name}`);
    const dir = resolve(root, 'decks', String(index));
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'input.cir'), translated.netlist);
    const mac = await runXyce(fixture);
    if (mac.status !== 'success') throw new Error(`${fixture.name}: ${JSON.stringify(mac)}`);
    if (hash(JSON.stringify(mac.series)) !== original.xyce.seriesSha256) throw new Error(`Mac series differs from historical receipt: ${fixture.name}`);
    rows.push({ index, fixture: { name: fixture.name, analysis: fixture.analysis, signals: fixture.signals }, inputSha256: hash(fixture.netlist), translatedSha256: hash(translated.netlist), mac });
    console.log(`${index}: ${fixture.name} Mac verified against historical series`);
  }
  save('mac-series.json', rows);
}

function compare(): void {
  const verify = process.argv.includes('--verify');
  const rows = (verify ? JSON.parse(gunzipSync(readFileSync(resolve(root, 'mac-series.json.gz'))).toString()) : read('mac-series.json')) as Array<{ index: number; fixture: ComparisonFixture; inputSha256: string; translatedSha256: string; mac: SuccessfulEngineRun }>;
  if (rows.length !== 22) throw new Error('Expected 22 Mac receipts');
  if (new Set(rows.map(row => row.fixture.name)).size !== 22) throw new Error('Duplicate fixture');
  const published = ['ekv', 'corpus'].flatMap(mode => JSON.parse(readFileSync(`benchmarks/reference/${mode}-report.json`, 'utf8')).fixtures);
  const outputs = verify ? JSON.parse(gunzipSync(readFileSync(resolve(root, 'linux-outputs.json.gz'))).toString()) as Array<{ index: number; input: string; csv: string; exit: string }> : undefined;
  if (outputs && (outputs.length !== 22 || new Set(outputs.map(row => row.index)).size !== 22)) throw new Error('Expected 22 unique Linux outputs');
  const results = rows.map((row: typeof rows[number]) => {
    const dir = resolve(root, 'decks', String(row.index));
    const saved = outputs?.find(output => output.index === row.index);
    const baseline = published.find(fixture => fixture.key === row.fixture.name);
    assert.equal(hash(JSON.stringify(row.mac.series)), baseline.xyce.seriesSha256);
    assert.equal(row.translatedSha256, baseline.translation.sha256);
    const exit = (saved?.exit ?? readFileSync(resolve(dir, 'exit.txt'), 'utf8')).trim();
    if (exit !== '0') throw new Error(`Linux failure ${row.fixture.name}: exit ${exit}`);
    if (hash(saved?.input ?? readFileSync(resolve(dir, 'input.cir'), 'utf8')) !== row.translatedSha256) throw new Error('Deck drift');
    const csv = saved?.csv ?? readFileSync(resolve(dir, 'output.csv'), 'utf8');
    const linux = parseXyceCsv(csv, row.fixture.analysis, row.fixture.signals);
    const metrics = alignAndMeasure(linux, row.mac.series, row.fixture.signals);
    return { key: row.fixture.name, inputSha256: row.inputSha256, translatedSha256: row.translatedSha256,
      macSeriesSha256: hash(JSON.stringify(row.mac.series)), linuxSeriesSha256: hash(JSON.stringify(linux)),
      linuxCsvSha256: hash(csv), metrics };
  });
  const report = { schemaVersion: 'xyce-linux-mac/v1', target: 'Linux source build', reference: 'Mac upstream XyceNF 7.10.0',
    policy: 'Identical translated input bytes; linear interpolation on Linux grid, monotonic sweep segments by ordinal; no tuning; units separated per signal. Runtime not a speed benchmark.', fixtures: results };
  if (verify) {
    assert.deepEqual(report, read('cross-check.json'));
    console.log('Verified 22 receipts: original Mac series, identical translated inputs, Linux CSV hashes and recomputed max/RMS metrics');
    return;
  }
  save('cross-check.json', report);
  const table = ['| Fixture | Max V | RMS V (largest signal) | Max A | RMS A (largest signal) |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const row of results) {
    const values = ['v', 'i'].flatMap(kind => {
      const signals = Object.entries(row.metrics.signals).filter(([name]) => name.startsWith(kind + '(')).map(([, metric]) => metric);
      if (signals.some(metric => metric.status !== 'compared')) throw new Error('Missing comparison');
      return ['max', 'rms'].map(field => Math.max(0, ...signals.map(metric => metric.status === 'compared' ? metric.absoluteError[field as 'max' | 'rms'] : 0)).toExponential(9));
    });
    table.push(`| ${row.key} | ${values.join(' | ')} |`);
  }
  writeFileSync(resolve(root, 'cross-check.md'), table.join('\n') + '\n');
  console.log(table.join('\n'));
}
if (process.argv.includes('--prepare')) prepare().catch(error => { console.error(error); process.exitCode = 1; });
else if (process.argv.includes('--compare') || process.argv.includes('--verify')) compare();
else throw new Error('Use --prepare, --compare or --verify');
