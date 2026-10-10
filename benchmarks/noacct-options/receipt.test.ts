import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const repoRoot = resolve('.');
const receipt = JSON.parse(
  readFileSync(resolve(repoRoot, 'benchmarks/noacct-options/receipt.json'), 'utf8'),
);
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

describe('NOACCT option receipt', () => {
  it('retains every accepted-audit first failure and reconciles the stale issue count', () => {
    assert.equal(receipt.countReconciliation.issueClaim, 9);
    assert.equal(receipt.countReconciliation.acceptedAuditObserved, 10);
    assert.equal(receipt.fixtures.length, 10);
    assert.equal(receipt.totals.fixtures, receipt.fixtures.length);
  });

  it('pins source provenance and every byte-identical fixture', () => {
    assert.equal(
      sha256(readFileSync(resolve(repoRoot, 'benchmarks/SOURCES.md'))),
      receipt.provenance.sourcesSha256,
    );
    assert.equal(
      sha256(readFileSync(resolve(repoRoot, 'benchmarks/corpus/ngspice/manifest.json'))),
      receipt.provenance.manifestSha256,
    );

    for (const fixture of receipt.fixtures) {
      assert.equal(fixture.identicalBytes, true);
      assert.equal(sha256(readFileSync(resolve(repoRoot, fixture.path))), fixture.sha256);
      assert.equal(fixture.ngspice.status, 'success');
    }
    const identity = receipt.fixtures.map(({ id, sha256: hash }: { id: string; sha256: string }) => ({
      id,
      sha256: hash,
    }));
    assert.equal(sha256(JSON.stringify(identity)), receipt.provenance.fixtureSetSha256);
  });

  it('accounts for every transition, success, newly exposed loss, and runtime', () => {
    const statusCount = (status: string): number => receipt.fixtures
      .filter(({ after }: { after: { status: string } }) => after.status === status).length;
    const sumRuntime = (engine: 'ngspice' | 'after'): number => Number(receipt.fixtures
      .reduce((sum: number, fixture: Record<string, { runtimeMs: number }>) =>
        sum + fixture[engine].runtimeMs, 0)
      .toFixed(3));

    assert.equal(statusCount('success'), receipt.totals.spiceTs.success);
    assert.equal(statusCount('unsupported'), receipt.totals.spiceTs.unsupported);
    assert.equal(statusCount('failed'), receipt.totals.spiceTs.failed);
    assert.equal(statusCount('success'), receipt.totals.transitions.unsupportedToSuccess);
    assert.equal(receipt.fixtures.length - statusCount('success'), receipt.totals.transitions.unsupportedToNewLoss);
    assert.equal(sumRuntime('ngspice'), receipt.totals.ngspice.runtimeMs);
    assert.equal(sumRuntime('after'), receipt.totals.spiceTs.runtimeMs);

    for (const fixture of receipt.fixtures) {
      assert.equal(fixture.before.status, 'unsupported');
      assert.equal(fixture.before.cause, 'parser');
      assert.equal(fixture.before.firstFailure.toLowerCase(), 'noacct');
      assert.doesNotMatch(fixture.after.firstFailure ?? '', /noacct/i);
      assert.ok(fixture.transition.length > 0);
    }
  });
});
