import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sha256 } from '../../expanded.js';
import { translateForXyce } from '../../xyce.js';

const directory = 'benchmarks/reference/investigations/974';
const report = JSON.parse(readFileSync(`${directory}/sine-994-report.json`, 'utf8'));

test('#994 rerun preserves historical decks and changes only SINE spelling', () => {
  for (const key of ['shared', 'before', 'after']) {
    assert.equal(sha256(readFileSync(report[`${key}InputPath`])), report[`${key}InputSha256`]);
  }
  const shared = readFileSync(report.sharedInputPath, 'utf8');
  const before = readFileSync(report.beforeInputPath, 'utf8');
  const after = readFileSync(report.afterInputPath, 'utf8');
  assert.equal(after, before.replace(/\bsine(?=\()/i, 'SIN'));
  assert.equal(translateForXyce({ name: 'jimi', analysis: 'tran', netlist: shared, signals: report.signals }).netlist, after);
  assert.ok(after.includes('V_V1 1 0 dc 9.0'));
  assert.ok(after.includes('V_V2 10 0 dc 0.0 SIN(0.0 0.3 440.0 0 0)'));
  assert.match(report.environment.ngspiceVersion, /ngspice-47\b/);
  assert.match(report.environment.xyceVersion, /Release 7\.10\.0\b/);
});

test('#994 receipt retains restored excitation and unchanged large IC startup residual', () => {
  assert.equal(report.ngspice.status, 'success');
  assert.equal(report.after.status, 'success');
  assert.equal(report.before.signals['v(10)'].min, 0);
  assert.equal(report.before.signals['v(10)'].max, 0);
  assert.ok(report.after.signals['v(10)'].min < -.299);
  assert.ok(report.after.signals['v(10)'].max > .299);
  assert.equal(report.ngspice.signals['v(3)'].first.re, 0);
  assert.ok(report.after.signals['v(3)'].first.re > 8.7);
  for (const signal of report.signals) {
    assert.equal(report.metrics.after.signals[signal].status, 'compared');
    assert.equal(report.metrics.afterReverse.signals[signal].status, 'compared');
  }
  const before = report.metrics.before.signals['v(3)'].absoluteError;
  const after = report.metrics.after.signals['v(3)'].absoluteError;
  assert.equal(after.max, before.max);
  assert.ok(after.max > 8.7);
  assert.ok(after.rms > .2 && after.rms < before.rms);
});
