import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { statistics, hashVectors, parseRaw } from '../../rc1k-attribution-data.mjs';
const out = new URL('.', import.meta.url).pathname;
const read = name => existsSync(join(out, name)) ? readFileSync(join(out, name)) : gunzipSync(readFileSync(join(out, name + '.gz')));
const rows = read('receipts.jsonl').toString().trim().split('\n').map(JSON.parse);
const summary = JSON.parse(read('summary.json'));
test('all 85 top-level workloads succeeded without corrections or exclusions', () => {
  assert.equal(rows.length, 85);
  assert.equal(new Set(rows.map(r => r.id)).size, 85);
  assert.deepEqual(summary.counts, { import: 30, rc1k: 45, parity: 10 });
  for (const row of rows) {
    assert.equal(row.code, 0);
    assert.equal(row.certificationError, null);
    assert.equal(row.worker.status ?? 'ok', 'ok');
    assert.deepEqual(JSON.parse(read(row.id + '.worker.stdout.txt')), row.worker);
    assert.equal(read(row.id + '.worker.stderr.txt').length, 0);
    assert.ok(row.wallMs >= 0);
    assert.ok(row.before.loadavg.length === 3 && row.after.loadavg.length === 3);
  }
});
test('15 interleaved import and RC1k rounds, unchanged full RC1k outputs', () => {
  for (let round = 1; round <= 15; round++) {
    assert.deepEqual(rows.filter(r => r.kind === 'import' && r.round === round).map(r => r.mode), round % 2 ? ['control', 'candidate'] : ['candidate', 'control']);
    const modes = ['control', 'candidate', 'ngspice'], offset = (round - 1) % 3;
    assert.deepEqual(rows.filter(r => r.kind === 'rc1k' && r.round === round).map(r => r.mode), [...modes.slice(offset), ...modes.slice(0, offset)]);
  }
  for (const row of rows.filter(r => r.kind === 'rc1k' && r.mode !== 'ngspice')) {
    assert.deepEqual(row.worker.evidence.output, { outputSha256: '6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7', vectors: 1002, count: 120240 });
    assert.equal(row.worker.evidence.deckSha256, '0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7');
  }
});
test('median/IQR and gate rederive from all samples, not a hand-edited decision', () => {
  for (const mode of ['control', 'candidate']) assert.deepEqual(summary.imports[mode], statistics(rows.filter(r => r.kind === 'import' && r.mode === mode).map(r => r.worker.importMs)));
  for (const mode of ['control', 'candidate', 'ngspice']) assert.deepEqual(summary.cold[mode], statistics(rows.filter(r => r.kind === 'rc1k' && r.mode === mode).map(r => mode === 'ngspice' ? r.worker.boundaries.nativeWall : r.wallMs)));
  assert.equal(summary.reduction, 1 - summary.imports.candidate.median / summary.imports.control.median);
  assert.equal(summary.iqrsSeparate, summary.imports.candidate.q3 < summary.imports.control.q1);
  for (const deck of ['rc1k', 'mesh10k', 'cmos1k', 'esm', 'cjs']) {
    const pair = rows.filter(r => r.kind === 'parity' && r.deck === deck);
    assert.equal(pair.length, 2);
    assert.equal(summary.parity[deck].equal, JSON.stringify(pair[0].worker) === JSON.stringify(pair[1].worker));
    assert.deepEqual(pair[0].worker.output, pair[1].worker.output);
    assert.equal(summary.parity[deck].outputEqual, pair[0].worker.output ? true : null);
    const differences = Object.keys(pair[0].worker.api).filter(k => JSON.stringify(pair[0].worker.api[k]) !== JSON.stringify(pair[1].worker.api[k]));
    assert.deepEqual(differences, ['SingularMatrixError']);
    assert.deepEqual(pair[0].worker.api.SingularMatrixError, { type: 'function', name: '_SingularMatrixError' });
    assert.deepEqual(pair[1].worker.api.SingularMatrixError, { type: 'function', name: 'SingularMatrixError' });
    assert.equal(summary.parity[deck].apiEqual, false);
  }
  assert.equal(summary.gatePassed, summary.reduction >= 0.25 && summary.iqrsSeparate && Object.values(summary.parity).every(p => p.equal) && summary.nativeVerified);
});
test('retained built/deck bytes and 15 complete native raw hashes verify', () => {
  const provenance = JSON.parse(read('provenance.json'));
  for (const [name, expected] of Object.entries(provenance)) {
    const bytes = read(name);
    assert.equal(bytes.length, expected.bytes, name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, name);
  }
  for (const row of rows.filter(r => r.mode === 'ngspice')) {
    assert.deepEqual(hashVectors(parseRaw(read(row.id + '.raw'))), row.worker.evidence.output);
    assert.match(read(row.id + '.stdout.txt').toString(), /Using KLU/);
  }
  assert.equal(summary.nativeVerified, true);
});
