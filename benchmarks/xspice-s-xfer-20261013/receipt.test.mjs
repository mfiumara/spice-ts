// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
const root = new URL('./', import.meta.url);
const report = JSON.parse(readFileSync(new URL('receipt.json', root)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('matrix has every bounded reduction and all five unchanged originals', () => {
  assert.equal(report.fixtures.length, 13);
  assert.equal(new Set(report.fixtures.map(row => row.name)).size, 13);
  assert.equal(report.fixtures.filter(row => row.kind === 'unchanged original').length, 5);
  for (const row of report.fixtures) {
    const path = row.manifest ? new URL(`../../${row.manifest.localPath}`, root) : new URL(`${row.name}.cir`, root);
    assert.equal(hash(readFileSync(path)), row.inputSha256Before);
    assert.equal(row.inputSha256Before, row.inputSha256After);
    assert.equal(row.reference.status, 'success');
    assert.equal(row.before.native.status, 'failed');
    assert.match(row.before.native.error, /code model 's_xfer'.*not supported/);
  }
});
test('reductions compare every reference coordinate and expose relative losses', () => {
  for (const row of report.fixtures.filter(row => row.kind === 'MIT reduction')) {
    assert.equal(row.after.native.status, 'success');
    const metrics = row.after.errors;
    assert.equal(metrics.matchedPoints, metrics.referencePoints);
    assert.ok(Number.isFinite(metrics.maxRelative));
    assert.equal(hash(gunzipSync(readFileSync(new URL(`reference/${row.name}.raw.gz`, root)))), row.reference.rawSha256);
  }
  assert.ok(report.fixtures.find(row => row.name === 'tran-second').after.errors.maxRelative > 0.15);
});
test('original failures advance to core; x_fer runs but is not a parity claim', () => {
  for (const row of report.fixtures.filter(row => row.kind === 'unchanged original')) {
    assert.equal(row.historicalNgspice.status, 'success');
    assert.equal(row.after.errors, null);
    if (row.name.endsWith('x-fer-cir')) {
      assert.equal(row.after.native.status, 'success');
      assert.ok(row.after.native.originalAnalysis.points > 0);
    } else {
      assert.equal(row.after.native.status, 'failed');
      assert.match(row.after.native.error, /code model 'core'.*not supported/);
    }
  }
});
test('source pins and conservative budget accounting are explicit', () => {
  assert.equal(report.sourcePin, '3ef069fb1f04177a153f342a32d941fc20ff047e');
  for (const [name, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(readFileSync(new URL(`source/${name}`, root))), digest);
  assert.ok(report.matrixWallSeconds + report.priorAbortedAttemptBudgetChargeSeconds + report.extractionRepairWallSeconds <= 900);
  assert.equal(report.limits.childSeconds, 30);
});
