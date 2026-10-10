import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  matchedPointEnvelope,
  validateAggregateAccounting,
  verifyCommittedArtifacts,
} from './aggregate-report.js';

const JSON_PATH = resolve('benchmarks/aggregate-report.json');
const MARKDOWN_PATH = resolve('benchmarks/AGGREGATE_PARITY.md');

async function committedArtifacts(): Promise<{ json: string; markdown: string }> {
  const [json, markdown] = await Promise.all([
    readFile(JSON_PATH, 'utf8'),
    readFile(MARKDOWN_PATH, 'utf8'),
  ]);
  return { json, markdown };
}

describe('aggregate report artifact verification', () => {
  it('accounts for exactly 20 unique fixtures from each of five corpora', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.doesNotThrow(() => validateAggregateAccounting(report));
    assert.deepEqual(report.totals.corpusFixtures, {
      ngspice: 20,
      classic: 20,
      xyce: 20,
      'corpus-d': 20,
      'corpus-e': 20,
    });
  });

  it('commits the transition ledger against the latest accepted report', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.equal(report.comparisonToPrevious.issueUrl, 'https://github.com/mfiumara/spice-ts/issues/275');
    assert.equal(report.comparisonToPrevious.pullRequestUrl, 'https://github.com/mfiumara/spice-ts/pull/284');
    assert.equal(report.comparisonToPrevious.headSha, '47da214e26d348f41baea47b80acff8afe6f2881');
    assert.equal(report.comparisonToPrevious.outcomeSha256, '2c5abd0d6ffb637d98ef8a9248ce2007932b0b211064a6445175fc3bb9056ba8');
    assert.deepEqual(report.comparisonToPrevious.statusTransitions, []);
    assert.deepEqual(report.comparisonToPrevious.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.comparisonToPrevious.totals.spiceTs, { success: 28, failed: 9, unsupported: 63 });
    assert.equal(report.comparisonToPrevious.totals.comparedAnalyses, 28);
    assert.equal(report.comparisonToPrevious.totals.comparedFixtures, 18);
  });

  it('locks the unchanged aggregate fixture tree and records the current source catalogue', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.provenance, {
      fixtureTreeSha256: '9bea16d967510fe868e68bfad672b02b477802d63bfe191660d4a0a737602cba',
      sourcesSha256: 'b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1',
    });
  });

  it('commits matched-point envelopes derived from every compared signal', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.matchedPointEnvelope, matchedPointEnvelope(report.fixtures));
    assert.equal(report.matchedPointEnvelope.comparedSignals, 253);
    assert.equal(report.matchedPointEnvelope.relativeComparedSignals, 235);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteError, 90.09458674829554);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteRms, 59.660512653520904);
    assert.equal(report.matchedPointEnvelope.maximumRelativeError, 273625086.91875815);
    assert.equal(report.matchedPointEnvelope.maximumRelativeRms, 131055144.90676585);
  });

  it('commits runtime sums derived from all 100 engine receipts', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);
    const sum = (engine: 'ngspice' | 'spiceTs') => Number(report.fixtures
      .reduce((total: number, fixture: Record<string, { runtimeMs: number }>) => total + fixture[engine].runtimeMs, 0)
      .toFixed(3));

    assert.deepEqual(report.totals.runtimeMs, {
      ngspice: sum('ngspice'),
      spiceTs: sum('spiceTs'),
    });
  });

  it('rejects duplicate fixture paths and content hashes', async () => {
    const { json } = await committedArtifacts();
    const duplicatePath = JSON.parse(json);
    duplicatePath.fixtures[99].localPath = duplicatePath.fixtures[0].localPath;
    assert.throws(() => validateAggregateAccounting(duplicatePath), /unique local paths/);

    const duplicateHash = JSON.parse(json);
    duplicateHash.fixtures[99].input.sha256 = duplicateHash.fixtures[0].input.sha256;
    duplicateHash.fixtures[99].ngspice.inputSha256 = duplicateHash.fixtures[0].input.sha256;
    duplicateHash.fixtures[99].spiceTs.inputSha256 = duplicateHash.fixtures[0].input.sha256;
    assert.throws(() => validateAggregateAccounting(duplicateHash), /unique input hashes/);
  });

  it('rejects outcome totals that do not reconcile to all fixtures', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);
    report.totals.ngspice.success += 1;

    assert.throws(() => validateAggregateAccounting(report), /ngspice outcomes must reconcile/);
  });

  it('excludes documented volatile host, runtime, and error fields from deterministic verification', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    generated.environment.cpu = 'different host';
    generated.fixtures[0].ngspice.runtimeMs += 1;
    generated.fixtures[0].ngspice.error = 'different volatile diagnostic';

    assert.doesNotThrow(() => verifyCommittedArtifacts(generated, json, markdown));
  });

  it('rejects tampered deterministic JSON content even when its stored outcome hash is unchanged', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    const tampered = JSON.parse(json);
    tampered.totals.fixtures = 59;

    assert.throws(
      () => verifyCommittedArtifacts(generated, `${JSON.stringify(tampered, null, 2)}\n`, markdown),
      /deterministic JSON projection/,
    );
  });

  it('rejects tampered Markdown even when the committed JSON is unchanged', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);

    assert.throws(
      () => verifyCommittedArtifacts(generated, json, markdown.replace('100-circuit', '101-circuit')),
      /Markdown/,
    );
  });
});
