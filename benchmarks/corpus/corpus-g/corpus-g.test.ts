import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { outcomeDigest } from '../corpus-f/outcomes.js';
import { type CorpusGManifest, existingCorpusIdentity, type ProbeReceipt, renderSources } from './ingest.js';
import { type Candidate, finalSelection, gapBucket, type ProbeRecord, staticSelection, staticVerdict, stripTerminalNewline, suiteDirectory } from './lib.js';
import { type CorpusGReport, GAP_ISSUES, renderMarkdown, summarize } from './parity.js';

const ROOT = 'benchmarks/corpus/corpus-g';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function candidate(sourcePath: string, text: string, upstream = new Set<string>([sourcePath])): Candidate {
  const bytes = Buffer.from(text);
  return { sourcePath, sha256: sha256(bytes), sha256Trimmed: sha256(stripTerminalNewline(bytes)), bytes: bytes.length, verdict: staticVerdict(bytes, sourcePath, upstream) };
}

function probe(entry: Candidate, status: ProbeRecord['status'], firstErrorLine?: string): ProbeRecord {
  return { sourcePath: entry.sourcePath, sha256: entry.sha256, status, plots: status === 'success' ? ['op'] : [], ...(firstErrorLine ? { firstErrorLine } : {}) };
}

async function manifest(): Promise<CorpusGManifest> {
  return JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusGManifest;
}

describe('corpus-g static rules', () => {
  it('reuses the corpus-f deck rules: notices, companions, analyses', () => {
    assert.equal(candidate('Netlists/A/a.cir', 't\n* Copyright 2001 Vendor Inc.\n.op\n').verdict.reason, 'licence');
    assert.equal(candidate('Netlists/A/a.cir', 't\n.include models.lib\n.op\n').verdict.reason, 'not-self-contained');
    const companion = candidate('Netlists/A/a.cir', 't\nV1 1 0 pwl file=stim.txt\n.tran 1 2\n', new Set(['Netlists/A/a.cir', 'Netlists/A/stim.txt']));
    assert.equal(companion.verdict.reason, 'not-self-contained');
    assert.equal(candidate('Netlists/A/a.cir', 't\n.subckt x 1 2\nR1 1 2 1\n.ends\n').verdict.reason, 'no-analysis');
    assert.deepEqual(candidate('Netlists/A/a.cir', 't\nR1 1 0 1\nV1 1 0 1\n.op\n.tran 1n 1u\n').verdict, { reason: null, analyses: ['op', 'tran'], unmappedAnalyses: [] });
  });

  it('drops decks already in a corpus by path or by hash (with and without the terminal newline), then duplicates', () => {
    const deck = 't\nR1 1 0 1\nV1 1 0 1\n.op\n';
    const known = candidate('Netlists/K/known.cir', 'known\n.op\n');
    const { eligible, exclusions } = staticSelection(
      [candidate('Netlists/B/b.cir', deck), candidate('Netlists/A/a.cir', deck), known, candidate('Netlists/C/cited.cir', 'other\n.op\n')],
      { hashes: new Set([sha256('known\n.op')]), xycePaths: new Set(['Netlists/C/cited.cir']), names: new Map() },
    );
    assert.deepEqual(eligible.map(entry => entry.sourcePath), ['Netlists/A/a.cir']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['Netlists/B/b.cir', 'duplicate-content'],
      ['Netlists/C/cited.cir', 'already-in-corpus'],
      ['Netlists/K/known.cir', 'already-in-corpus'],
    ]);
  });
});

describe('corpus-g reference selection', () => {
  const a1 = candidate('Netlists/A/a1.cir', 'a1\nR1 1 0 1\nV1 1 0 1\n.op\n');
  const a2 = candidate('Netlists/A/a2.cir', 'a2\nR1 1 0 2\nV1 1 0 1\n.op\n');
  const a3 = candidate('Netlists/A/a3.cir', 'a3\nR1 1 0 3\nV1 1 0 1\n.op\n');
  const a4 = candidate('Netlists/A/sub/a4.cir', 'a4\nR1 1 0 5\nV1 1 0 1\n.op\n');
  const b1 = candidate('Netlists/B/sub/b1.cir', 'b1\nR1 1 0 4\nV1 1 0 1\n.op\n');

  it('keeps only decks with an ngspice reference and caps each directory in path order', () => {
    const probes = new Map([a1, a2, a3, a4, b1].map(entry => [entry.sourcePath, probe(entry, entry === a1 ? 'unsupported' : 'success', entry === a1 ? 'Error: unknown device' : undefined)]));
    const { circuits, exclusions } = finalSelection([b1, a4, a3, a2, a1], probes, new Map([['b1.cir', ['benchmarks/corpus/x/fixtures/b1.cir']]]), 1);
    assert.deepEqual(circuits.map(circuit => [circuit.id, circuit.localPath]), [
      ['a-a2-cir', 'benchmarks/corpus/corpus-g/fixtures/A/a2.cir'],
      ['b-sub-b1-cir', 'benchmarks/corpus/corpus-g/fixtures/B/sub/b1.cir'],
    ]);
    assert.deepEqual(circuits[1].sameNameAs, ['benchmarks/corpus/x/fixtures/b1.cir']);
    assert.equal(circuits[0].sourceUrl, 'https://github.com/Xyce/Xyce_Regression/blob/7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2/Netlists/A/a2.cir');
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['Netlists/A/a1.cir', 'ngspice-no-reference'],
      ['Netlists/A/a3.cir', 'directory-cap'],
      ['Netlists/A/sub/a4.cir', 'directory-cap'],
    ]);
    assert.equal(suiteDirectory('Netlists/A/sub/a4.cir'), 'Netlists/A');
    assert.match(exclusions[0].detail, /ngspice unsupported: Error: unknown device/);
  });

  it('refuses a probe recorded for different bytes', () => {
    const stale = new Map([[a1.sourcePath, { ...probe(a1, 'success'), sha256: '0'.repeat(64) }]]);
    assert.throws(() => finalSelection([a1], stale, new Map()), /no ngspice probe for these bytes/);
  });
});

describe('corpus-g committed artifacts', () => {
  it('pins every fixture byte-for-byte, accounts for every candidate and never overlaps another corpus', async () => {
    const committed = await manifest();
    assert.equal(committed.source.revision, '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2');
    assert.equal(committed.source.license, 'GPL-3.0-or-later');
    assert.equal(sha256(await readFile(resolve(committed.source.licenseNoticeLocalPath))), committed.source.licenseNoticeSha256);
    assert.equal(sha256(await readFile(resolve(committed.source.licenseTextLocalPath))), committed.source.licenseTextSha256);
    assert.ok(committed.circuits.length >= 50, `expected >= 50 fixtures, found ${committed.circuits.length}`);
    assert.equal(committed.selection.selected, committed.circuits.length);
    assert.equal(committed.selection.candidates, committed.circuits.length + committed.exclusions.length);
    for (const [reason, count] of Object.entries(committed.selection.excluded)) {
      assert.equal(committed.exclusions.filter(exclusion => exclusion.reason === reason).length, count, reason);
    }
    const existing = await existingCorpusIdentity(resolve('.'));
    const hashes = new Set<string>();
    const directories = new Map<string, number>();
    for (const circuit of committed.circuits) {
      const bytes = await readFile(resolve(circuit.localPath));
      assert.equal(sha256(bytes), circuit.sha256, circuit.id);
      assert.ok(circuit.localPath.startsWith(`${ROOT}/fixtures/`), circuit.id);
      assert.ok(!hashes.has(circuit.sha256), `${circuit.id}: duplicate content`);
      assert.ok(!existing.hashes.has(circuit.sha256) && !existing.hashes.has(sha256(stripTerminalNewline(bytes))), `${circuit.id}: already in a corpus`);
      assert.ok(!existing.xycePaths.has(circuit.sourcePath), `${circuit.id}: upstream path already cited`);
      hashes.add(circuit.sha256);
      const directory = suiteDirectory(circuit.sourcePath);
      directories.set(directory, (directories.get(directory) ?? 0) + 1);
    }
    assert.ok([...directories.values()].every(count => count <= committed.selection.perDirectoryCap));
    for (const exclusion of committed.exclusions.filter(candidate => candidate.reason === 'licence')) {
      assert.ok(!committed.circuits.some(circuit => circuit.sourcePath === exclusion.sourcePath));
    }
  });

  it('selects only decks whose recorded ngspice probe produced a reference', async () => {
    const committed = await manifest();
    const bytes = await readFile(resolve(ROOT, 'ngspice-probe.json'));
    assert.equal(sha256(bytes), committed.selection.probe.receiptSha256);
    const receipt = JSON.parse(bytes.toString('utf8')) as ProbeReceipt;
    const probes = new Map(receipt.probes.map(entry => [entry.sourcePath, entry]));
    for (const circuit of committed.circuits) {
      const entry = probes.get(circuit.sourcePath);
      assert.equal(entry?.sha256, circuit.sha256, circuit.id);
      assert.equal(entry?.status, 'success', circuit.id);
    }
  });

  it('keeps SOURCES.md generated from the manifest', async () => {
    assert.equal(await readFile(resolve(ROOT, 'SOURCES.md'), 'utf8'), renderSources(await manifest()));
  });

  it('keeps README.md and totals generated from outcomes.json', async () => {
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusGReport;
    const committed = await manifest();
    assert.equal(report.source.manifestSha256, sha256(await readFile(resolve(ROOT, 'manifest.json'))));
    assert.deepEqual(report.fixtures.map(fixture => fixture.id), committed.circuits.map(circuit => circuit.id));
    assert.equal(report.outcomeSha256, outcomeDigest(report as never));
    assert.equal(report.policy.perCircuitToleranceTuning, false);
    for (const fixture of report.fixtures) {
      assert.equal(fixture.gapBucket, gapBucket(fixture.spiceTs.firstErrorLine, fixture.spiceTs.status) ?? null, fixture.id);
    }
    const { totals, gapBuckets } = summarize(report.fixtures);
    assert.deepEqual(report.totals, totals);
    assert.deepEqual(report.gapBuckets, gapBuckets);
    assert.equal(await readFile(resolve(ROOT, 'README.md'), 'utf8'), renderMarkdown(report));
  });

  it('links an issue for every gap bucket of three or more fixtures that ngspice runs', async () => {
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusGReport;
    for (const bucket of report.gapBuckets.filter(entry => entry.ngspiceSuccess >= 3 && !entry.bucket.startsWith('parse: other') && !entry.bucket.startsWith('execution: other'))) {
      assert.ok(GAP_ISSUES[bucket.bucket], `no issue linked for bucket "${bucket.bucket}"`);
    }
  });
});
