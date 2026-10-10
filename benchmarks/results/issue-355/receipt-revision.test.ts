import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertMeasuredRevision,
  resolveMeasuredRevision,
  type RevisionContext,
} from './receipt-revision.js';

const parentRevision = '1111111111111111111111111111111111111111';
const headRevision = '2222222222222222222222222222222222222222';
const receiptOnlyContext: RevisionContext = {
  headRevision,
  parentRevisions: [parentRevision],
  changedPaths: ['benchmarks/results/issue-355/report.json'],
};

test('a receipt-only checkout requires its sole parent revision', () => {
  assert.equal(resolveMeasuredRevision(receiptOnlyContext), parentRevision);
  assert.doesNotThrow(() => assertMeasuredRevision(parentRevision, receiptOnlyContext));
  assert.throws(
    () => assertMeasuredRevision(headRevision, receiptOnlyContext),
    new RegExp(`measuredRevision must be ${parentRevision}`),
  );
  assert.throws(
    () => assertMeasuredRevision('0000000000000000000000000000000000000000', receiptOnlyContext),
    new RegExp(`measuredRevision must be ${parentRevision}`),
  );
});
