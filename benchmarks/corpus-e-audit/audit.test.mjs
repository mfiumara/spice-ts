import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  classifyNgspiceFailure,
  classifySpiceTsFailure,
  fixtureSetHash,
} from './audit.mjs';

const EXPECTED_FIXTURE_SET_HASH = 'e6346a45392800a58c186eb691d242f4b88611f1609b29db4b0f1c1110a08897';
const EXPECTED_OUTCOME_HASH = '163acb09d3c7225916ea9dca4336ebbe97b7fd0e4c706a46538f3b1934d8727d';

test('failure classifiers cover every audit cause', () => {
  assert.equal(classifyNgspiceFailure("unimplemented dot command '.list'"), 'analysis');
  assert.equal(classifyNgspiceFailure('Device type MOS7 not available in this binary'), 'device/model');
  assert.equal(classifyNgspiceFailure('unknown parameter (gen)'), 'parser');
  assert.equal(classifyNgspiceFailure('timestep too small'), 'convergence');
  assert.equal(classifyNgspiceFailure('child process timed out'), 'execution');

  assert.equal(classifySpiceTsFailure({ errorName: 'ParseError', errorMessage: "Unsupported dot command: '.width'" }), 'analysis');
  assert.equal(classifySpiceTsFailure({ errorName: 'ParseError', errorMessage: 'Unsupported device card: K1' }), 'device/model');
  assert.equal(classifySpiceTsFailure({ errorName: 'Error', errorMessage: "K-element 'k1' references unknown inductors" }), 'device/model');
  assert.equal(classifySpiceTsFailure({ errorName: 'ParseError', errorMessage: "Cannot parse number: 'dc=0'" }), 'parser');
  assert.equal(classifySpiceTsFailure({ errorName: 'ConvergenceError', errorMessage: 'singular matrix' }), 'convergence');
  assert.equal(classifySpiceTsFailure({ errorName: 'Error', errorMessage: 'worker exited' }), 'execution');
});

test('historical corpus-E receipt retains its audited outcomes and unchanged fixture provenance', () => {
  // This is the receipt at 80cd1312, not a claim about the current simulator.
  // Live regeneration belongs to audit.mjs, not the offline CI test.
  const receipt = JSON.parse(readFileSync(new URL('./receipt.json', import.meta.url), 'utf8'));
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const manifestBytes = readFileSync(new URL('../corpus/corpus-e/manifest.json', import.meta.url));
  assert.equal(sha256(manifestBytes), 'bbe9d93df21a96913f479bb4f3bff3157eaf30d919aa6967b69f238679e88739');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(receipt.versions.spiceTsHead, '80cd13123ef9943b27bf2dca5134c0b0016b55e0');
  assert.equal(receipt.source.repository, manifest.source.repository);
  assert.equal(receipt.source.revision, manifest.source.revision);
  assert.equal(manifest.circuits.length, 20);
  assert.equal(new Set(receipt.fixtures.map(fixture => fixture.id)).size, 20);
  for (const fixture of receipt.fixtures) {
    const circuit = manifest.circuits.find(circuit => circuit.id === fixture.id);
    assert.ok(circuit, fixture.id);
    assert.equal(fixture.localPath, circuit.localPath);
    assert.equal(fixture.sha256, circuit.sha256);
    assert.equal(sha256(readFileSync(new URL(`../../${fixture.localPath}`, import.meta.url))), fixture.sha256);
  }
  for (const engine of ['ngspice', 'spiceTs']) {
    const totals = Object.fromEntries(['pass', 'parser', 'device/model', 'analysis', 'convergence', 'execution'].map(cause => [cause, 0]));
    for (const fixture of receipt.fixtures) totals[fixture[engine].status === 'pass' ? 'pass' : fixture[engine].cause] += 1;
    assert.deepEqual(receipt.totals[engine], totals);
  }
  const outcomes = receipt.fixtures.map(({ id, sha256: hash, ngspice, spiceTs }) => ({
    id, sha256: hash,
    ngspice: { status: ngspice.status, cause: ngspice.cause ?? null },
    spiceTs: { status: spiceTs.status, cause: spiceTs.cause ?? null },
  }));
  assert.equal(sha256(JSON.stringify(outcomes)), receipt.outcomeSha256);
  for (const transition of receipt.issue228Transitions) {
    const fixture = receipt.fixtures.find(fixture => fixture.id === transition.id);
    assert.ok(fixture, transition.id);
    assert.deepEqual(transition.after, fixture.spiceTs.status === 'pass' ? { status: 'pass' } : { status: 'fail', cause: fixture.spiceTs.cause });
    assert.equal(transition.changed, transition.before.status !== transition.after.status || transition.before.cause !== transition.after.cause);
  }

  assert.equal(receipt.fixtures.length, 20);
  assert.equal(fixtureSetHash(receipt.fixtures), EXPECTED_FIXTURE_SET_HASH);
  assert.deepEqual(receipt.totals.ngspice, {
    pass: 5,
    parser: 2,
    'device/model': 2,
    analysis: 11,
    convergence: 0,
    execution: 0,
  });
  assert.deepEqual(receipt.totals.spiceTs, {
    pass: 14,
    parser: 5,
    'device/model': 1,
    analysis: 0,
    convergence: 0,
    execution: 0,
  });
  assert.equal(receipt.outcomeSha256, EXPECTED_OUTCOME_HASH);
  assert.ok(receipt.fixtures.every(({ inputIdentity }) => inputIdentity === 'byte-identical'));
  assert.equal(receipt.issue228Transitions.length, 20);
  assert.equal(receipt.issue228Transitions.filter(({ changed }) => changed).length, 15);
  assert.equal(receipt.issue228Transitions.filter(({ before, after }) => before.status === 'fail' && after.status === 'pass').length, 10);
  assert.equal(receipt.issue228Transitions.filter(({ before, after }) => before.status === 'pass' && after.status === 'fail').length, 0);
});
