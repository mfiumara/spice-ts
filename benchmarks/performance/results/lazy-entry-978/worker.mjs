// Receipt = {importMs?, output?, api?}; output uses #960 little-endian vector hashes.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rcLadderTran, resistorMeshOp, cmosInverterChainTran } from '../../scaling-m2-fixture.mjs';
import { hashVectors, statistics, parseRaw } from '../../rc1k-attribution-data.mjs';
const [action, directory, mode, deck] = process.argv.slice(2);
const out = resolve(directory);

if (action === 'prepare') {
  mkdirSync(out, { recursive: true });
  for (const variant of ['control', 'candidate']) writeFileSync(join(out, variant, 'package.json'), '{"type":"module"}\n');
  for (const [name, fixture] of [['rc1k', rcLadderTran(1000)], ['mesh10k', resistorMeshOp(10000)], ['cmos1k', cmosInverterChainTran(1000)]]) {
    writeFileSync(join(out, name + '.cir'), fixture.netlist);
  }
  writeFileSync(join(out, '.spiceinit'), 'option klu\n');
  const files = ['rc1k.cir', 'mesh10k.cir', 'cmos1k.cir', ...['control', 'candidate'].flatMap(v => readdirSync(join(out, v)).filter(n => /\.(js|cjs)$/.test(n)).map(n => v + '/' + n))];
  const hashes = Object.fromEntries(files.map(n => [n, { bytes: readFileSync(join(out, n)).length, sha256: createHash('sha256').update(readFileSync(join(out, n))).digest('hex') }]));
  writeFileSync(join(out, 'provenance.json'), JSON.stringify(hashes, null, 2) + '\n');
} else if (action === 'import') {
  const start = performance.now();
  await import(pathToFileURL(join(out, mode, 'index.js')));
  console.log(JSON.stringify({ importMs: performance.now() - start }));
} else if (action === 'parity' || action === 'cold') {
  const entry = join(out, mode, deck === 'cjs' ? 'index.cjs' : 'index.js');
  const core = deck === 'cjs' ? createRequire(import.meta.url)(entry) : await import(pathToFileURL(entry));
  // Public runtime names and export keys are part of the compatibility check.
  const api = Object.fromEntries(Object.entries(core).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [name, { type: typeof value, name: typeof value === 'function' ? value.name : null }]));
  if (deck === 'cjs' || deck === 'esm') console.log(JSON.stringify({ api }));
  else {
    const result = await core.simulate(await core.parseAsync(readFileSync(join(out, deck + '.cir'), 'utf8')));
    const vectors = [];
    if (result.dc) {
      for (const [name, value] of result.dc.voltages) vectors.push(['dc-v:' + name, [value]]);
      for (const [name, value] of result.dc.currents) vectors.push(['dc-i:' + name, [value]]);
    }
    if (result.transient) {
      vectors.push(['time', result.transient.time]);
      for (const [name, values] of result.transient.voltages) vectors.push(['tran-v:' + name, values]);
      for (const [name, values] of result.transient.currents) vectors.push(['tran-i:' + name, values]);
    }
    console.log(JSON.stringify({ output: hashVectors(vectors), api, convergence: result.convergence }));
  }
} else if (action === 'summarize') {
  const { gunzipSync } = await import('node:zlib');
  const readReceipt = name => existsSync(join(out, name)) ? readFileSync(join(out, name)) : gunzipSync(readFileSync(join(out, name + '.gz')));
  const rows = readReceipt('receipts.jsonl').toString().trim().split('\n').map(JSON.parse);
  const dist = (kind, variant, key) => statistics(rows.filter(r => r.kind === kind && r.mode === variant).map(r => key === 'wallMs' ? r.wallMs : r.worker[key] ?? r.worker.boundaries[key]));
  const imports = Object.fromEntries(['control', 'candidate'].map(v => [v, dist('import', v, 'importMs')]));
  const cold = Object.fromEntries(['control', 'candidate', 'ngspice'].map(v => [v, dist('rc1k', v, v === 'ngspice' ? 'nativeWall' : 'wallMs')]));
  const coldDecks = Object.fromEntries(['mesh10k', 'cmos1k'].map(d => [d, Object.fromEntries(['control', 'candidate'].map(v => [v, statistics(rows.filter(r => r.kind === 'cold' && r.deck === d && r.mode === v).map(r => r.wallMs))]))]));
  const parity = Object.fromEntries(['rc1k', 'mesh10k', 'cmos1k', 'esm', 'cjs'].map(d => {
    const pair = rows.filter(r => r.kind === 'parity' && r.deck === d);
    return [d, {
      equal: JSON.stringify(pair[0].worker) === JSON.stringify(pair[1].worker),
      outputEqual: pair[0].worker.output ? JSON.stringify(pair[0].worker.output) === JSON.stringify(pair[1].worker.output) : null,
      apiEqual: JSON.stringify(pair[0].worker.api) === JSON.stringify(pair[1].worker.api),
      receipts: pair.map(r => ({ mode: r.mode, ...r.worker })),
    }];
  }));
  const nativeRows = rows.filter(r => r.mode === 'ngspice');
  const nativeVerified = nativeRows.every(r => JSON.stringify(hashVectors(parseRaw(readReceipt(r.id + '.raw')))) === JSON.stringify(r.worker.evidence.output));
  const reduction = 1 - imports.candidate.median / imports.control.median;
  const iqrsSeparate = imports.candidate.q3 < imports.control.q1;
  const loads = rows.flatMap(r => [r.before.loadavg[0], r.after.loadavg[0]]);
  const summary = { imports, cold, coldDecks, reduction, iqrsSeparate, parity, nativeVerified, loads: statistics(loads), failures: rows.filter(r => r.code !== 0 || r.certificationError), gatePassed: reduction >= 0.25 && iqrsSeparate && Object.values(parity).every(p => p.equal) && nativeVerified, counts: { import: rows.filter(r => r.kind === 'import').length, rc1k: rows.filter(r => r.kind === 'rc1k').length, cold: rows.filter(r => r.kind === 'cold').length, parity: rows.filter(r => r.kind === 'parity').length } };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, parity: Object.fromEntries(Object.entries(parity).map(([d, p]) => [d, { equal: p.equal, outputs: p.receipts.map(r => r.output) }])) }, null, 2));
} else throw new Error('unknown action');
