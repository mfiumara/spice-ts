import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { alignAndMeasure } from '../../../comparison-harness.js';
import { translateForXyce } from '../../xyce.js';

const dir = 'benchmarks/reference/investigations/990';
const report = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8'));
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

test('#990 original inputs and current adapter output are hash-pinned separately', () => {
  for (const key of ['shared', 'before', 'after']) {
    assert.equal(hash(readFileSync(report[`${key}InputPath`])), report[`${key}InputSha256`]);
  }
  assert.equal(hash(readFileSync('benchmarks/reference/xyce.ts')), report.adapterSha256);
  const shared = readFileSync(report.sharedInputPath, 'utf8');
  const translated = translateForXyce({ name: 'receipt-990', analysis: 'ac', signals: report.signals, netlist: shared });
  assert.equal(translated.netlist, readFileSync(report.afterInputPath, 'utf8'));
  assert.deepEqual(translated.changes, report.changes);
  assert.match(shared, /\bva 50/);
  assert.match(translated.netlist, /\bVAF=50/);
  assert.doesNotMatch(translated.netlist, /\bva 50/);
});

test('#990 before and after errors recompute from native rectangular-complex samples', () => {
  assert.equal(report.ngspice.status, 'success');
  assert.equal(report.after.status, 'success');
  assert.match(report.environment.ngspiceVersion, /ngspice-47\b/);
  assert.match(report.environment.xyceVersion, /Release 7\.10\.0\b/);
  for (const key of ['before', 'after']) {
    assert.equal(report[key].series.grid.length, 101);
    assert.deepEqual(alignAndMeasure(report.ngspice.series, report[key].series, report.signals), report.metrics[key]);
  }
  for (const signal of report.signals) {
    const before = report.metrics.before.signals[signal];
    const after = report.metrics.after.signals[signal];
    assert.equal(before.status, 'compared');
    assert.equal(after.status, 'compared');
    assert.ok(after.absoluteError.max < before.absoluteError.max, signal);
    assert.ok(after.absoluteError.rms < before.absoluteError.rms, signal);
    assert.ok(after.absoluteError.max > 0, 'Remaining reference residual must stay visible');
  }
});
