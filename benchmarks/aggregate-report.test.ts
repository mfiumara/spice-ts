import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  matchedPointEnvelope,
  runBoundedSpiceTs,
  SPICE_TS_TIMEOUT_MS,
  validateAggregateAccounting,
  verifyCommittedArtifacts,
} from './aggregate-report.js';
import { runNativeSpiceTs } from './corpus/classic/report.js';

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

    assert.equal(report.comparisonToPrevious.issueUrl, 'https://github.com/mfiumara/spice-ts/issues/321');
    assert.equal(report.comparisonToPrevious.pullRequestUrl, 'https://github.com/mfiumara/spice-ts/pull/325');
    assert.equal(report.comparisonToPrevious.headSha, 'e400d87c791dfa27f572a349777c8ebb9f2450d4');
    assert.equal(report.comparisonToPrevious.outcomeSha256, '26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b');
    assert.deepEqual(
      report.comparisonToPrevious.statusTransitions.map((transition: Record<string, string>) => [
        transition.engine,
        transition.fixture,
        transition.from,
        transition.to,
      ]),
      [
        ['spiceTs', 'ngspice/ltra-line-transient', 'unsupported', 'success'],
        ['spiceTs', 'classic/lossy-line-24-inch', 'unsupported', 'success'],
        ['spiceTs', 'classic/lossy-line-aluminium', 'unsupported', 'success'],
        ['spiceTs', 'classic/coupled-lossy-lines', 'unsupported', 'success'],
        ['spiceTs', 'ngspice/hfet-inverter', 'failed', 'unsupported'],
        ['spiceTs', 'ngspice/mesa-oscillator', 'failed', 'unsupported'],
        ['spiceTs', 'xyce/inductor-transient', 'unsupported', 'failed'],
      ],
    );
    assert.deepEqual(report.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.totals.spiceTs, { success: 55, failed: 2, unsupported: 43 });
    assert.equal(report.totals.comparedAnalyses, 58);
    assert.equal(report.totals.comparedFixtures, 43);
    const inductor = report.fixtures.find((fixture: { key: string }) => fixture.key === 'xyce/inductor-transient');
    assert.match(inductor.spiceTs.error, /exceeded the 120000 ms aggregate execution bound/);
    assert.ok(inductor.gapIssues.includes('https://github.com/mfiumara/spice-ts/issues/366'));
    assert.deepEqual(report.comparisonToPrevious.totals.ngspice, { success: 52, failed: 9, unsupported: 39 });
    assert.deepEqual(report.comparisonToPrevious.totals.spiceTs, { success: 51, failed: 3, unsupported: 46 });
    assert.equal(report.comparisonToPrevious.totals.comparedAnalyses, 54);
    assert.equal(report.comparisonToPrevious.totals.comparedFixtures, 39);
  });

  it('locks the current aggregate corpus tree and unchanged source catalogue', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.provenance, {
      fixtureTreeSha256: '01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1',
      sourcesSha256: 'f8cc57771ac07684b1bdebb43ad2ab572f048a9e67d5df98386dc9eb706a188f',
    });
  });

  it('commits matched-point envelopes derived from every compared signal', async () => {
    const { json } = await committedArtifacts();
    const report = JSON.parse(json);

    assert.deepEqual(report.matchedPointEnvelope, matchedPointEnvelope(report.fixtures));
    assert.equal(report.matchedPointEnvelope.comparedSignals, 878);
    assert.equal(report.matchedPointEnvelope.relativeComparedSignals, 848);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteError, 1169140310571.719);
    assert.equal(report.matchedPointEnvelope.maximumAbsoluteRms, 1169140310571.719);
    assert.equal(report.matchedPointEnvelope.maximumRelativeError, 45497356677842.63);
    assert.equal(report.matchedPointEnvelope.maximumRelativeRms, 872317191517.6284);
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

  it('names the fixtures whose regenerated outcome differs from the committed artifact', async () => {
    const { json, markdown } = await committedArtifacts();
    const generated = JSON.parse(json);
    generated.fixtures[0].spiceTs.status = 'failed';

    assert.throws(
      () => verifyCommittedArtifacts(generated, json, markdown),
      new RegExp(`differing fixtures: ${generated.fixtures[0].key.replace('/', '\\/')} \\(spice-ts `),
    );
  });

  it('runs spice-ts in a bounded child process with the in-process execution result', async () => {
    const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'));
    const circuit = manifest.circuits.find((candidate: { id: string }) => candidate.id === 'rlc-transient');
    const input = await readFile(resolve(circuit.localPath));

    const bounded = await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS);
    const inProcess = await runNativeSpiceTs(input, circuit);

    assert.equal(SPICE_TS_TIMEOUT_MS, 120_000);
    assert.equal(bounded.execution.status, 'success');
    assert.ok(bounded.runtimeMs > 0);
    assert.deepEqual(bounded.execution, inProcess);
  });

  it('reports a spice-ts run that exceeds the bound as a failed execution', async () => {
    const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'));
    const circuit = manifest.circuits.find((candidate: { id: string }) => candidate.id === 'rlc-transient');
    const input = await readFile(resolve(circuit.localPath));

    const bounded = await runBoundedSpiceTs(input, circuit, 1);

    assert.equal(bounded.execution.status, 'failed');
    assert.equal(bounded.execution.convergence, 'failed');
    assert.deepEqual(bounded.execution.analyses, []);
    assert.match(bounded.execution.error ?? '', /exceeded the 1 ms aggregate execution bound/);
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
