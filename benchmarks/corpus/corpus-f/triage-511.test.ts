import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { runFixture, type CorpusFReport } from './outcomes.js';
import type { CorpusFManifest } from './ingest.js';
import { MATCH_THRESHOLD } from './lib.js';
import { withTmax } from './triage-detail.js';

const ROOT = 'benchmarks/corpus/corpus-f';

interface Triage {
  issue: string;
  deferredMismatches: { issue: string; reason: string; fixtures: string[] };
  rootCauses: Array<{ id: string; kind: 'simulator' | 'metric' | 'model-gap' | 'fixed'; issue: string; summary: string }>;
  fixtures: Array<{
    id: string;
    issueTable: { outcome: string; worst: number; signal: string } | null;
    current: { outcome: string; worst: number | null; signal: string | null };
    rootCauses: string[];
    evidence: string;
  }>;
}

/** The ten rows of the #511 issue table (corpus-f commit 5014ae0b), worst first. */
const ISSUE_511_ROWS = [
  'examples-vdmos-vdmosp-out-sp',
  'tests-general-fourbitadder-cir',
  'tests-transmission-ltra2-2-line-cir',
  'tests-bsim2-test-cir',
  'tests-general-mosmem-cir',
  'tests-bsim1-test-cir',
  'tests-general-rtlinv-cir',
  'tests-general-rca3040-cir',
  'examples-xspice-various-xspice-c1-cir',
  'examples-xspice-original-examples-spice3-deck',
];

async function load(): Promise<{ triage: Triage; report: CorpusFReport }> {
  return {
    triage: JSON.parse(await readFile(resolve(ROOT, 'triage-511.json'), 'utf8')) as Triage,
    report: JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusFReport,
  };
}

describe('corpus-f #511 triage', () => {
  it('triages every #511 row and explicitly tracks newly exposed mismatches', async () => {
    const { triage, report } = await load();
    const triaged = new Set(triage.fixtures.map(fixture => fixture.id));
    const deferred = new Set(triage.deferredMismatches.fixtures);
    assert.match(triage.deferredMismatches.issue, /^https:\/\/github\.com\/mfiumara\/spice-ts\/issues\/\d+$/);
    assert.ok(triage.deferredMismatches.reason.length > 0);
    for (const id of deferred) {
      assert.ok(!triaged.has(id), `${id}: cannot be both triaged and deferred`);
      assert.equal(report.fixtures.find(fixture => fixture.id === id)?.outcome, 'mismatch', id);
    }
    for (const id of ISSUE_511_ROWS) assert.ok(triaged.has(id), `#511 row ${id} has no triage entry`);
    for (const fixture of report.fixtures.filter(candidate => candidate.outcome === 'mismatch')) {
      assert.ok(triaged.has(fixture.id) || deferred.has(fixture.id), `current mismatch ${fixture.id} is untracked`);
    }
  });

  it('records each fixture as it stands in the committed outcomes.json', async () => {
    const { triage, report } = await load();
    for (const entry of triage.fixtures) {
      const fixture = report.fixtures.find(candidate => candidate.id === entry.id);
      assert.ok(fixture, `${entry.id} is not a corpus-f fixture`);
      assert.deepEqual(
        entry.current,
        { outcome: fixture.outcome, worst: fixture.worstNormalizedError, signal: fixture.worstSignal },
        `${entry.id}: triage is stale against outcomes.json`,
      );
    }
  });

  it('links every unresolved row to a root cause with a GitHub issue', async () => {
    const { triage } = await load();
    const causes = new Map(triage.rootCauses.map(cause => [cause.id, cause]));
    for (const cause of triage.rootCauses) {
      assert.match(cause.issue, /^https:\/\/github\.com\/mfiumara\/spice-ts\/issues\/\d+$/, cause.id);
    }
    for (const entry of triage.fixtures) {
      for (const id of entry.rootCauses) assert.ok(causes.has(id), `${entry.id}: unknown root cause ${id}`);
      if (entry.current.outcome !== 'matched') {
        assert.ok(entry.rootCauses.length > 0, `${entry.id} is ${entry.current.outcome} with no root cause`);
        assert.ok(entry.rootCauses.some(id => causes.get(id)?.kind !== 'fixed'), `${entry.id} is still open but only cites fixed causes`);
      }
      assert.ok(entry.evidence.length > 0, `${entry.id}: evidence missing`);
    }
  });
});

describe('triage-detail --tmax rewrite', () => {
  it('forces TMAX on every .tran form and keeps UIC', () => {
    assert.equal(withTmax('t\n.tran 5n 500n\n.end\n', '1e-10'), 't\n.tran 5n 500n 0 1e-10\n.end\n');
    assert.equal(withTmax('t\n.TRAN 0.2N 47N 0 0.1N\n', '1e-11'), 't\n.TRAN 0.2N 47N 0 1e-11\n');
    assert.equal(withTmax('t\n.tran 1n 10n 2n uic\n', '1p'), 't\n.tran 1n 10n 2n 1p uic\n');
    assert.equal(withTmax('t\n.tran 1n 10n UIC\n', '1p'), 't\n.tran 1n 10n 0 1p UIC\n');
    assert.equal(withTmax('t\n* .tran 1n 10n\n', '1p'), 't\n* .tran 1n 10n\n');
  });
});

// This is a triage card, not a simulator fix. mosmem was fixed by #601 (#590) and is now a
// regression guard. The ltra2_2_line i(vs) residual (#627) is still a loss: the opt-in parity
// assertion must stay RED until it is fixed, and the normal test verifies the documented loss.
const ngspiceVersion = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
describe('unchanged-deck MOS1 triage rows (#590 fixed, #627 open)', { skip: !/ngspice-47\b/.test(ngspiceVersion.stdout ?? '') }, () => {
  async function run(id: string) {
    const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusFManifest;
    const fixture = manifest.circuits.find(candidate => candidate.id === id);
    if (!fixture) throw new Error(`${id} is not a corpus-f fixture`);
    const result = await runFixture(fixture);
    assert.equal(result.ngspice.status, 'success');
    assert.equal(result.spiceTs.status, 'success');
    const worst = result.worstNormalizedError;
    if (worst === null) throw new Error(`${id}: no compared signals`);
    return { result, worst };
  }

  it('tests-general-mosmem-cir matches after #601 (#590)', async () => {
    const { result, worst } = await run('tests-general-mosmem-cir');
    assert.equal(result.outcome, 'matched');
    assert.ok(worst <= MATCH_THRESHOLD, `${worst} > ${MATCH_THRESHOLD}`);
  });

  it('tests-transmission-ltra2-2-line-cir', async () => {
    const id = 'tests-transmission-ltra2-2-line-cir';
    const { result, worst } = await run(id);
    if (process.env.CORPUS_F_REQUIRE_PARITY === '1') {
      assert.ok(worst <= MATCH_THRESHOLD, `${id}: ${worst} > ${MATCH_THRESHOLD}`);
    } else {
      assert.equal(result.outcome, 'mismatch');
      assert.ok(worst > MATCH_THRESHOLD, 'loss resolved; update the triage and linked issue');
    }
  });
});
