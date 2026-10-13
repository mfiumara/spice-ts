import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
const root = new URL('./', import.meta.url);
const selection = JSON.parse(readFileSync(new URL('selection.json', root), 'utf8'));
const diagnosis = JSON.parse(readFileSync(new URL('diagnosis.json', root), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = file => execFileSync('git', ['show', `${selection.sourceCommit}:benchmarks/corpus/corpus-f/${file}`]);

test('selection is exactly the complete original 22-ID bucket in deterministic order', () => {
  const historical = JSON.parse(original('outcomes.json'));
  const [bucket] = historical.gapBuckets.filter(b => b.bucket.startsWith('device: Q/D instance forms'));
  assert.deepEqual(selection.fixtures.map(f => f.id), [...bucket.ids].sort());
  assert.equal(selection.fixtures.length, 22);
  assert.equal(new Set(selection.fixtures.map(f => f.id)).size, 22);
  assert.equal(hash(original('outcomes.json')), selection.historicalReceiptSha256);
});
test('all exported deck bytes and pinned SHA256s equal the original receipt', () => {
  const manifest = JSON.parse(original('manifest.json'));
  for (const f of selection.fixtures) {
    const data = readFileSync(new URL(f.localPath, root));
    const source = manifest.circuits.find(c => c.id === f.id);
    assert.equal(hash(data), source.sha256);
    assert.equal(hash(data), f.sha256);
    assert.equal(data.length, f.bytes);
    assert.deepEqual(data, original(`fixtures/${f.sourcePath}`));
  }
});
test('licence provenance and exact notice are retained', () => {
  assert.equal(selection.source.license, 'BSD-3-Clause');
  assert.equal(selection.source.revision, '3ef069fb1f04177a153f342a32d941fc20ff047e');
  const notice = readFileSync(new URL('LICENSE.txt', root));
  assert.deepEqual(notice, original('LICENSE.txt'));
  assert.equal(hash(notice), selection.source.licenseTextSha256);
  for (const f of selection.fixtures) assert.equal(f.licence, 'BSD-3-Clause');
});
test('self-contained inputs have no include/library/source dependencies', () => {
  for (const f of selection.fixtures) {
    assert.deepEqual(f.includes, []);
    assert.doesNotMatch(readFileSync(new URL(f.localPath, root), 'utf8'), /^\s*(?:\.include|\.inc\s|\.lib|source\s|osdi\s)/im);
  }
});
test('every fixture has both independently executed current diagnostics', () => {
  assert.deepEqual(diagnosis.fixtures.map(f => f.id), selection.fixtures.map(f => f.id));
  for (const row of diagnosis.fixtures) {
    assert.equal(row.sha256, selection.fixtures.find(f => f.id === row.id).sha256);
    for (const mode of ['parse', 'native']) {
      assert.ok(['success', 'unsupported', 'failed', 'timeout'].includes(row[mode].status));
      assert.equal(row[mode].exit, 0);
      assert.ok(row[mode].elapsedSeconds < 12);
      assert.ok(row[mode].command.includes('--max-old-space-size=256'));
    }
  }
});
test('historical reference never becomes an unmeasured fresh match', () => {
  for (const row of diagnosis.fixtures) {
    assert.deepEqual(row.historicalReference, selection.fixtures.find(f => f.id === row.id).historical.ngspice);
    for (const key of ['freshReference', 'freshComparison', 'maxAbsoluteError', 'rmsRelativeError']) assert.equal(row[key], null);
  }
  assert.equal(diagnosis.freshNgspiceVersion, null);
  assert.equal(diagnosis.fixtures.filter(f => f.historicalReference.status === 'success').length, 20);
});
test('current status totals are independently derived from every row', () => {
  for (const mode of ['parse', 'native']) {
    const totals = {};
    for (const f of diagnosis.fixtures) totals[f[mode].status] = (totals[f[mode].status] ?? 0) + 1;
    assert.deepEqual(diagnosis.totals[mode], totals);
  }
  assert.deepEqual(diagnosis.totals.parse, { unsupported: 19, success: 3 });
  assert.deepEqual(diagnosis.totals.native, { unsupported: 22 });
});
test('fixed base and bounded execution policy are explicit', () => {
  assert.equal(diagnosis.baseSha, 'd4b1ce04b70f98986d825d1daee64fabcfc7ae61');
  assert.deepEqual(diagnosis.limits, { perChildSeconds: 12, totalSeconds: 600, heapMiB: 256, outputBytesPerStream: 65536, concurrency: 1 });
  assert.ok(diagnosis.elapsedSeconds < 600);
  assert.equal(diagnosis.temp924AtKickoff, 'OPEN; not imported');
});
