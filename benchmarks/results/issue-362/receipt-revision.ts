import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const receiptPath = 'benchmarks/results/issue-362/report.json';

export type RevisionContext = {
  headRevision: string;
  parentRevisions: string[];
  changedPaths: string[];
};

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.trim();
}

export function readRevisionContext(): RevisionContext {
  const revisions = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/);
  return {
    headRevision: revisions[0]!,
    parentRevisions: revisions.slice(1),
    changedPaths: git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
      .split('\n')
      .filter(Boolean),
  };
}

export function resolveMeasuredRevision(context: RevisionContext): string {
  const isReceiptOnlyCommit = context.parentRevisions.length === 1
    && context.changedPaths.length === 1
    && context.changedPaths[0] === receiptPath;
  return isReceiptOnlyCommit ? context.parentRevisions[0]! : context.headRevision;
}

export function assertMeasuredRevision(
  measuredRevision: string,
  context: RevisionContext = readRevisionContext(),
): void {
  const expectedRevision = resolveMeasuredRevision(context);
  if (measuredRevision !== expectedRevision) {
    throw new Error(
      `measuredRevision must be ${expectedRevision} for checkout ${context.headRevision}; observed ${measuredRevision}`,
    );
  }
}

if (process.argv.includes('--check')) {
  const committed = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8')) as {
    versions?: { measuredRevision?: string };
  };
  const measuredRevision = committed.versions?.measuredRevision;
  if (!measuredRevision) throw new Error('report.json has no versions.measuredRevision');
  assertMeasuredRevision(measuredRevision);
  process.stderr.write(`issue-362 receipt: measuredRevision ${measuredRevision} matches the checkout contract\n`);
}
