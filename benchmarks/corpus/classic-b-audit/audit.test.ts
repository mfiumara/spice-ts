import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  classifySpiceTsOutcome,
  evidenceHash,
  summarizeAudit,
  type AuditFixture,
  type EngineOutcome,
} from './audit.js';

const inputSha256 = createHash('sha256').update('fixture').digest('hex');

function outcome(status: EngineOutcome['status'], error?: string): EngineOutcome {
  return {
    status,
    convergence: status === 'success' ? 'converged' : 'not-run',
    ...(error ? { error } : {}),
  };
}

describe('classic corpus-B failure audit', () => {
  it('classifies stable parser, unsupported device, unsupported analysis, convergence, and execution causes', () => {
    assert.deepEqual(
      classifySpiceTsOutcome(outcome('unsupported', "Parse error at line 2: Unsupported dot command: '.width' .width in=72")),
      { kind: 'parser-feature', cause: 'legacy-output-directive', signature: 'unsupported-dot-width' },
    );
    assert.deepEqual(
      classifySpiceTsOutcome(outcome('unsupported', 'Parse error at line 23: Lossy transmission line (LTRA) cards are unsupported')),
      { kind: 'unsupported-analysis/device', cause: 'ltra-device', signature: 'unsupported-ltra-card' },
    );
    assert.deepEqual(
      classifySpiceTsOutcome(outcome('unsupported', 'no spice-ts result for analyses: pz')),
      { kind: 'unsupported-analysis/device', cause: 'pole-zero-analysis', signature: 'missing-result-pz' },
    );
    assert.deepEqual(
      classifySpiceTsOutcome({ status: 'failed', convergence: 'failed', error: 'transient failed to converge' }),
      { kind: 'convergence', cause: 'solver-convergence', signature: 'convergence-error' },
    );
    assert.deepEqual(
      classifySpiceTsOutcome(outcome('failed', 'worker exited 1')),
      { kind: 'execution', cause: 'unclassified-execution', signature: 'execution-error' },
    );
    assert.equal(classifySpiceTsOutcome(outcome('success')), null);
  });

  it('hashes only stable per-fixture evidence fields', () => {
    const fixture = {
      id: 'fixture',
      inputSha256,
      ngspice: outcome('success'),
      spiceTs: outcome('unsupported', "Parse error at line 2: Unsupported dot command: '.width'"),
      classification: {
        kind: 'parser-feature',
        cause: 'legacy-output-directive',
        signature: 'unsupported-dot-width',
      },
    } satisfies Omit<AuditFixture, 'evidenceSha256'>;

    assert.equal(evidenceHash(fixture), 'f810809391c9fc234d9175271421aa511a87ca7f054eca2d49e752b88112dd73');
  });

  it('programmatically verifies the committed 20-fixture audit and stable evidence hashes', () => {
    const report = JSON.parse(
      readFileSync(resolve('benchmarks/corpus/classic-b-audit/report.json'), 'utf8'),
    ) as {
      tools: { ngspice: string };
      totals: ReturnType<typeof summarizeAudit>;
      fixtures: AuditFixture[];
      suiteEvidenceSha256: string;
    };

    assert.equal(report.fixtures.length, 20);
    assert.equal(report.tools.ngspice, 'ngspice-47');
    assert.deepEqual(report.totals, summarizeAudit(report.fixtures));
    assert.deepEqual(report.totals, {
      fixtures: 20,
      ngspice: { success: 19, failed: 1, unsupported: 0 },
      spiceTs: { success: 2, failed: 0, unsupported: 18 },
      classifications: {
        'parser-feature': 15,
        'unsupported-analysis/device': 3,
        convergence: 0,
        execution: 0,
        none: 2,
      },
      parityCandidates: 2,
      losses: 18,
    });
    assert.equal(
      report.fixtures.every(fixture => fixture.evidenceSha256 === evidenceHash(fixture)),
      true,
    );
    assert.equal(
      report.suiteEvidenceSha256,
      createHash('sha256').update(report.fixtures.map(fixture => fixture.evidenceSha256).join('\n')).digest('hex'),
    );
  });
});
