import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditCorpusE,
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

test('all unchanged corpus-E fixtures produce the audited engine outcomes', async () => {
  const receipt = await auditCorpusE();

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
