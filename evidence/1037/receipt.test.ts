import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve('.');
const receipt = JSON.parse(readFileSync(resolve(root, 'evidence/1037/receipt.json'), 'utf8'));
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

test('#1037 receipt retains the failed candidate and incomplete native oracles', () => {
  assert.deepEqual(receipt.rows.map((row: any) => row.id), ['rest', 'schmitt', 'relay', 'Originalnetlist', 'InductorSplit']);
  assert.match(receipt.environment.ngspice, /ngspice-47/);
  const manifest = JSON.parse(readFileSync('benchmarks/corpus/ngspice-bugs/manifest.json', 'utf8'));
  const ticket = manifest.tickets.find((item: any) => item.ticket === 764);
  assert.deepEqual(receipt.attachments, ticket.attachments.map((item: any) => ({ name: item.name, sha256: item.sha256 })));
  for (const row of receipt.rows) {
    if (row.id === 'Originalnetlist' || row.id === 'InductorSplit') {
      assert.equal(row.sha256, ticket.uncommittedDecks.find((deck: any) => deck.name === `${row.id}.local.cir`).sha256);
      assert.equal(row.ngspice.status, 'timeout');
      assert.equal(row.ngspice.points, null);
      assert.equal(row.beforeMetrics, null);
      assert.equal(row.candidateMetrics, null);
      assert.equal(row.ngspice.exitCode, null);
      assert.equal(row.ngspice.signal, 'SIGTERM');
      assert.ok(row.ngspice.runtimeMs >= 120_000);
    } else {
      const bytes = row.id === 'rest'
        ? readFileSync('packages/core/src/analysis/transient-bjt-rest-1037.test.ts', 'utf8').match(/const REST = `([\s\S]*?)`;/)![1]
        : readFileSync(row.path);
      assert.equal(digest(bytes), row.sha256);
      assert.equal(row.ngspice.status, 'success');
      assert.equal(row.ngspice.exitCode, 0);
    }
    const loss = ['rest', 'Originalnetlist', 'InductorSplit'].includes(row.id);
    for (const phase of ['before', 'candidate']) {
      assert.equal(row[phase].status, loss ? 'failed' : 'success');
      assert.equal(row[phase].errorCode, loss ? 'TimestepTooSmallError' : null);
      assert.equal(row[phase].convergence.transient.failure, loss ? 'dt-floor' : null);
    }
  }
  const rest = receipt.rows[0];
  assert.equal(rest.before.time, rest.candidate.time);
  assert.equal(rest.before.points, 1);
  assert.equal(rest.candidate.points, 1);
  assert.equal(rest.ngspice.points, 108);
  assert.equal(rest.ngspice.time, 1e-11);
  const schmitt = receipt.rows[1];
  assert.ok(schmitt.candidateMetrics.signals['v(6)'].absoluteError.max > schmitt.beforeMetrics.signals['v(6)'].absoluteError.max);
  assert.ok(schmitt.candidateMetrics.signals['v(6)'].relativeError.rms > schmitt.beforeMetrics.signals['v(6)'].relativeError.rms);
});
