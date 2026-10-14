import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
const data = JSON.parse(gunzipSync(readFileSync(new URL('./import-samples.json.gz', import.meta.url))).toString());
const summary = JSON.parse(readFileSync(new URL('./import-summary.json', import.meta.url), 'utf8'));
const quantile = (sorted, p) => {
  const at = (sorted.length - 1) * p, lower = Math.floor(at);
  return sorted[lower] + (sorted[Math.ceil(at)] - sorted[lower]) * (at - lower);
};
test('all 45 rotated cold runs are retained with host load', () => {
  assert.equal(data.rows.length, 45);
  for (let round = 1; round <= 15; round++) {
    const modes = ['control', 'profile', 'evaluation'];
    const offset = (round - 1) % 3;
    assert.deepEqual(data.rows.filter(r => r.round === round).map(r => r.mode), [...modes.slice(offset), ...modes.slice(0, offset)]);
  }
  for (const row of data.rows) {
    assert.ok(row.importMs > 0 && row.wallMs >= row.importMs);
    assert.equal(row.loadBefore.length, 3);
    assert.equal(row.loadAfter.length, 3);
  }
});
test('summary rederives control median and IQR from uninstrumented runs', () => {
  const values = data.rows.filter(r => r.mode === 'control').map(r => r.importMs).sort((a,b)=>a-b);
  assert.equal(summary.control.n, 15);
  assert.equal(summary.control.median, quantile(values, .5));
  assert.equal(summary.control.iqr, quantile(values, .75) - quantile(values, .25));
});
test('module initialization has matching coverage in every run', () => {
  const rows = data.rows.filter(r => r.mode === 'evaluation');
  const names = rows[0].modules.map(m => m.module).sort();
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length > 100);
  for (const row of rows) {
    assert.deepEqual(row.modules.map(m => m.module).sort(), names);
    assert.ok(row.modules.every(m => Number.isFinite(m.ms) && m.ms >= 0));
    assert.ok(row.modules.reduce((sum, m) => sum + m.ms, 0) <= row.importMs);
  }
  assert.equal(summary.evaluation.length, names.length);
  assert.equal(summary.evaluation[0].module, 'parser/tokenizer.ts');
  for (const module of summary.evaluation) {
    const values = rows.map(r => r.modules.find(m => m.module === module.module).ms).sort((a,b)=>a-b);
    assert.equal(module.ms.n, 15);
    assert.equal(module.ms.median, quantile(values, .5));
    assert.equal(module.ms.iqr, quantile(values, .75) - quantile(values, .25));
  }
});
test('CPU profiles and unattributed compilation are not silently dropped', () => {
  const rows = data.rows.filter(r => r.mode === 'profile');
  assert.equal(rows.length, 15);
  for (const row of rows) {
    assert.equal(row.profile.samples.length, row.profile.timeDeltas.length);
    assert.ok(row.profile.samples.length > 0);
  }
  assert.equal(summary.cpu[0].module, '[unattributed] compileSourceTextModule');
  assert.ok(summary.cpu[0].sampledMs.median > summary.evaluation[0].ms.median);
});
