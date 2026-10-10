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

    assert.equal(report.comparisonToPrevious.issueUrl, 'https://github.com/mfiumara/spice-ts/issues/301');
    assert.equal(report.comparisonToPrevious.pullRequestUrl, 'https://github.com/mfiumara/spice-ts/pull/312');
    assert.equal(report.comparisonToPrevious.headSha, 'ac7dc9d8edf034bf35f589d078126ddb84224c82');
    assert.equal(report.comparisonToPrevious.outcomeSha256, '68b0a9edd25c1fc5c89644397dedfa8ba2b6ebcbd1c247463887f6d4fec44369');
    assert.deepEqual(
      report.comparisonToPrevious.statusTransitions.map((transition: Record<string, string>) => [
        transition.engine,
        transition.fixture,
        transition.from,
        transition.to,
      ]),
      [
        ['spiceTs', 'ngspice/mos6-inverter-transient', 'failed', 'success'],
        ['spiceTs', 'ngspice/mos-amplifier-transient', 'failed', 'success'],
        ['spiceTs', 'classic/mos6-inverter-chain', 'failed', 'success'],
        ['spiceTs', 'classic/mos-amplifier', 'failed', 'success'],
        ['spiceTs', 'classic/mos-memory-cell', 'failed', 'success'],
        ['spiceTs', 'ngspice/rc-lowpass-ac', 'unsupported', 'success'],
        ['spiceTs', 'ngspice/vbic-common-emitter-ac', 'unsupported', 'success'],
        ['spiceTs', 'classic/pole-zero-four-stage', 'unsupported', 'success'],
        ['spiceTs', 'classic/pole-zero-three-stage', 'unsupported', 'success'],
        ['spiceTs', 'classic/high-pass-pole-zero', 'unsupported', 'success'],
        ['spiceTs', 'ngspice/schmitt-trigger', 'unsupported', 'success'],
        ['spiceTs', 'classic/ecl-schmitt-trigger', 'unsupported', 'success'],
        ['spiceTs', 'xyce/capacitor-rc-oscillator', 'unsupported', 'success'],
        ['spiceTs', 'xyce/diode-transient', 'unsupported', 'success'],
        ['spiceTs', 'xyce/rlc-transient', 'unsupported', 'success'],
      ],
    );
    assert.deepEqual(report.comparisonToPrevious.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.comparisonToPrevious.totals.spiceTs, { success: 36, failed: 8, unsupported: 56 });
    assert.equal(report.comparisonToPrevious.totals.comparedAnalyses, 40);
    assert.equal(report.comparisonToPrevious.totals.comparedFixtures, 27);
  });

  it('locks the current aggregate corpus tree and unchanged source catalogue', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.provenance, {
      fixtureTreeSha256: '01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1',
      sourcesSha256: 'b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1',
    });
  });

  it('commits matched-point envelopes derived from every compared signal', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.matchedPointEnvelope, matchedPointEnvelope(report.fixtures));
    assert.equal(report.matchedPointEnvelope.comparedSignals, 561);
    assert.equal(report.matchedPointEnvelope.relativeComparedSignals, 535);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteError, 1169140310571.719);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteRms, 1169140310571.719);
    assert.equal(report.matchedPointEnvelope.maximumRelativeError, 2110199067.731876);
    assert.equal(report.matchedPointEnvelope.maximumRelativeRms, 326930690.296368);
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
