import { describe, expect, it } from 'vitest';
import {
  assertMeasuredRevision,
  resolveMeasuredRevision,
  type RevisionContext,
} from '../../../benchmarks/results/issue-355/receipt-revision.js';

const parentRevision = '1111111111111111111111111111111111111111';
const headRevision = '2222222222222222222222222222222222222222';
const receiptOnlyContext: RevisionContext = {
  headRevision,
  parentRevisions: [parentRevision],
  changedPaths: ['benchmarks/results/issue-355/report.json'],
};

describe('issue 355 receipt revision', () => {
  it('requires the sole parent revision for a receipt-only checkout', () => {
    expect(resolveMeasuredRevision(receiptOnlyContext)).toBe(parentRevision);
    expect(() => assertMeasuredRevision(parentRevision, receiptOnlyContext)).not.toThrow();
    expect(() => assertMeasuredRevision(headRevision, receiptOnlyContext)).toThrow(
      `measuredRevision must be ${parentRevision}`,
    );
    expect(() => assertMeasuredRevision('0000000000000000000000000000000000000000', receiptOnlyContext)).toThrow(
      `measuredRevision must be ${parentRevision}`,
    );
  });
});
