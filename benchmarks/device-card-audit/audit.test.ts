import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeviceCardAudit,
  classifyFirstFailure,
  fixtureSetDigest,
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

test('all unchanged fixtures produce a complete deterministic device-card audit', async () => {
  const report = await buildDeviceCardAudit();

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
