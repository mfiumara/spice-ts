import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { preflightAggregateInputs } from '../aggregate-report.js';

import {
  classifyFirstFailure,
  fixtureSetDigest,
  type DeviceCardAudit,
} from './audit.js';

test('first-failure classifier distinguishes every required cause and extracts detail', () => {
  assert.deepEqual(
    classifyFirstFailure("Parse error at line 6: Unsupported device card: 'S' S1 dd out dd in SW", ['dc']),
    { cause: 'device/model', card: 'S', model: null, parameter: null, evidence: "Parse error at line 6: Unsupported device card: 'S' S1 dd out dd in SW" },
  );
  assert.equal(classifyFirstFailure("Parse error at line 7: Unsupported .options field: 'temp'", ['dc']).cause, 'parser');
  assert.equal(classifyFirstFailure('no spice-ts result for analyses: pz', ['pz']).cause, 'analysis');
  assert.equal(classifyFirstFailure('singular matrix: iteration failed', ['op']).cause, 'convergence');
  assert.equal(classifyFirstFailure('worker exited without a result', ['tran']).cause, 'execution');
  assert.deepEqual(
    classifyFirstFailure('Device type MOS7 not available in this binary', ['tran']),
    { cause: 'device/model', card: 'M', model: 'MOS7', parameter: null, evidence: 'Device type MOS7 not available in this binary' },
  );
  assert.equal(classifyFirstFailure("Unsupported BJT Q-card form: 'q1 3 1 4 2 mod1'", ['disto']).card, 'Q');
  assert.equal(classifyFirstFailure("K-element 'k1' references unknown inductors", ['ac']).card, 'K');
});

test('fixture-set digest is order-stable but identity-sensitive', () => {
  const fixtures = [
    { key: 'b', sha256: '2' },
    { key: 'a', sha256: '1' },
  ];
  assert.equal(fixtureSetDigest(fixtures), fixtureSetDigest([...fixtures].reverse()));
  assert.notEqual(fixtureSetDigest(fixtures), fixtureSetDigest([{ key: 'a', sha256: 'changed' }, fixtures[0]]));
});

test('live aggregate audit fails fast at its stale provenance boundary (#855)', { timeout: 10_000 }, async () => {
  // Preflight only: never regenerate corpora or run engines in this test.
  // Deliberately stale isolated input stays valid after the nightly #855 refresh.
  const root = await mkdtemp(resolve(tmpdir(), 'spice-ts-device-audit-'));
  try {
    await Promise.all(['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'].map(corpus => cp(
      resolve(`benchmarks/corpus/${corpus}`), resolve(root, `benchmarks/corpus/${corpus}`), { recursive: true },
    )));
    await cp('benchmarks/SOURCES.md', resolve(root, 'benchmarks/SOURCES.md'));
    await appendFile(resolve(root, 'benchmarks/SOURCES.md'), '\nDeliberately stale test provenance.\n');
    await assert.rejects(preflightAggregateInputs(root), /aggregate provenance is stale:.*refresh with/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('historical device-card receipt retains complete deterministic accounting and fixture provenance', () => {
  const report = JSON.parse(readFileSync('benchmarks/device-card-audit/report.json', 'utf8')) as DeviceCardAudit;
  const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
  const identity: Array<{ key: string; sha256: string }> = [];
  for (const [corpus, hash] of Object.entries(report.hashes.manifestsSha256)) {
    const bytes = readFileSync(`benchmarks/corpus/${corpus}/manifest.json`);
    assert.equal(sha256(bytes), hash, corpus);
    const manifest = JSON.parse(bytes.toString('utf8'));
    assert.equal(manifest.circuits.length, 20, corpus);
    for (const circuit of manifest.circuits) {
      const key = `${corpus}/${circuit.id}`;
      const fixture = report.fixtures.find(fixture => fixture.key === key);
      assert.ok(fixture, key);
      const input = readFileSync(circuit.localPath);
      assert.equal(sha256(input), circuit.sha256, key);
      assert.equal(fixture.input.sha256, circuit.sha256, key);
      assert.equal(fixture.input.bytes, input.length, key);
      identity.push({ key, sha256: circuit.sha256 });
    }
  }
  assert.equal(fixtureSetDigest(identity), report.hashes.fixtureSetSha256);
  const { deterministicOutcomeSha256, ...hashes } = report.hashes;
  assert.equal(deterministicOutcomeSha256, '40b0b125ef99535a0e4cc30b23fce320fc800f5696c5ed8c93dac5f09e305e31');
  const deterministic = JSON.parse(JSON.stringify({ ...report, hashes }, (key, value) => (
    key === 'environment' || key === 'runtimeMs' || key === 'evidence' ? undefined : value
  )));
  assert.equal(sha256(`${JSON.stringify(deterministic)}\n`), deterministicOutcomeSha256);
  for (const engine of ['ngspice', 'spiceTs'] as const) {
    const totals = { success: 0, parser: 0, 'device/model': 0, analysis: 0, convergence: 0, execution: 0 };
    for (const fixture of report.fixtures) totals[fixture[engine].status === 'success' ? 'success' : fixture[engine].firstFailure!.cause] += 1;
    assert.deepEqual(totals, report.totals[engine]);
    assert.equal(Number(report.fixtures.reduce((sum, fixture) => sum + fixture[engine].runtimeMs, 0).toFixed(3)), report.totals.runtimeMs[engine]);
  }
  assert.deepEqual(report.totals.ngspice, { success: 52, parser: 20, 'device/model': 2, analysis: 0, convergence: 0, execution: 26 });
  assert.deepEqual(report.totals.spiceTs, { success: 28, parser: 45, 'device/model': 8, analysis: 11, convergence: 4, execution: 4 });
  assert.equal(report.fixtures.filter(fixture => fixture.transition.changed).length, report.totals.transitions.changed);
  assert.equal(report.fixtures.filter(fixture => fixture.transition.from.status !== 'success' && fixture.transition.to.status === 'success').length, report.totals.transitions.gains);
  assert.equal(report.fixtures.filter(fixture => fixture.transition.from.status === 'success' && fixture.transition.to.status !== 'success').length, report.totals.transitions.regressions);
  for (const [coverage, count] of Object.entries(report.totals.deviceCardCoverage)) {
    assert.equal(report.fixtures.filter(fixture => fixture.deviceCardCoverage === coverage).length, count);
  }

  assert.equal(report.totals.fixtures, 100);
  assert.equal(report.fixtures.length, 100);
  assert.equal(new Set(report.fixtures.map(fixture => fixture.key)).size, 100);
  assert.ok(report.fixtures.every(fixture => fixture.input.identicalForBothEngines));
  assert.ok(report.fixtures.every(fixture => fixture.input.sha256 === fixture.ngspice.inputSha256));
  assert.ok(report.fixtures.every(fixture => fixture.input.sha256 === fixture.spiceTs.inputSha256));
  assert.equal(
    Object.values(report.totals.spiceTs).reduce((sum, count) => sum + count, 0),
    100,
  );
  assert.equal(
    Object.values(report.totals.ngspice).reduce((sum, count) => sum + count, 0),
    100,
  );
  assert.ok(report.fixtures.every(fixture => fixture.spiceTs.status === 'success' || fixture.spiceTs.firstFailure));
  assert.ok(report.fixtures.every(fixture => fixture.ngspice.status === 'success' || fixture.ngspice.firstFailure));
  assert.ok(report.fixtures.every(fixture => fixture.transition.from.status.length > 0 && fixture.transition.to.status.length > 0));
  const coupledLines = report.fixtures.find(fixture => fixture.key === 'classic/coupled-lossy-lines');
  assert.deepEqual(coupledLines?.transition.from, {
    status: 'unsupported',
    cause: 'parser',
    card: null,
    model: null,
    parameter: 'itl5',
    evidence: "Parse error at line 81: Unsupported .options field: 'itl5' .options itl5=0 acct reltol=1e-3 abstol=1e-12",
  });
  assert.equal(coupledLines?.transition.to.cause, 'device/model');
  assert.equal(coupledLines?.transition.changed, true);
  assert.equal(report.totals.transitions.changed, 37);
  assert.equal(report.totals.transitions.unchanged, 63);
  const sameStatusTransitions = report.fixtures.filter(
    fixture => fixture.transition.changed && fixture.transition.from.status === fixture.transition.to.status,
  );
  assert.equal(sameStatusTransitions.length, 18);
  assert.equal(
    sameStatusTransitions.filter(fixture => fixture.transition.from.cause !== fixture.transition.to.cause).length,
    9,
  );

  const reachedExecutionFailures = report.fixtures.filter(
    fixture => fixture.deviceCardCoverage === 'reached-execution-failed',
  );
  assert.equal(reachedExecutionFailures.length, 8);
  assert.deepEqual(
    new Set(reachedExecutionFailures.map(fixture => fixture.spiceTs.firstFailure?.cause)),
    new Set(['convergence', 'execution']),
  );
  assert.equal(
    report.fixtures.find(fixture => fixture.key === 'xyce/nmos-level1-dc')?.deviceCardCoverage,
    'reached-execution-failed',
  );
  assert.equal(report.totals.deviceCardCoverage['blocked-before-execution'], 56);
  assert.equal(report.exclusions.perCircuitToleranceTuning, true);
  assert.equal(report.exclusions.fixtureAdaptation, true);
});
