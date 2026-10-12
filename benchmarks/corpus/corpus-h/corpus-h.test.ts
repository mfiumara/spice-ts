import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { outcomeDigest } from '../corpus-f/outcomes.js';
import { type CorpusHManifest, existingCorpusIdentity, type ProbeReceipt, renderSources } from './ingest.js';
import {
  type Candidate,
  capDirectory,
  finalSelection,
  gapBucket,
  isCandidatePath,
  type ProbeRecord,
  SOURCES,
  sourceByKey,
  sourceUrl,
  staticSelection,
  staticVerdict,
  stripTerminalNewline,
} from './lib.js';
import { type CorpusHReport, GAP_ISSUES, renderMarkdown, summarize } from './parity.js';

const ROOT = 'benchmarks/corpus/corpus-h';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function candidate(source: string, upstreamPath: string, text: string, upstream = new Set<string>([upstreamPath])): Candidate {
  const bytes = Buffer.from(text);
  return {
    source,
    upstreamPath,
    sourcePath: `${source}/${upstreamPath}`,
    sha256: sha256(bytes),
    sha256Trimmed: sha256(stripTerminalNewline(bytes)),
    bytes: bytes.length,
    verdict: staticVerdict(bytes, upstreamPath, upstream),
  };
}

function probe(entry: Candidate, status: ProbeRecord['status'], firstErrorLine?: string): ProbeRecord {
  return { sourcePath: entry.sourcePath, sha256: entry.sha256, status, plots: status === 'success' ? ['op'] : [], ...(firstErrorLine ? { firstErrorLine } : {}) };
}

async function manifest(): Promise<CorpusHManifest> {
  return JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusHManifest;
}

describe('corpus-h source table', () => {
  it('pins every source to a full revision and a redistributable licence', () => {
    assert.deepEqual(SOURCES.map(source => source.key), [...SOURCES.map(source => source.key)].sort());
    for (const source of SOURCES) {
      assert.match(source.revision, /^[0-9a-f]{40}$/, source.key);
      assert.ok(source.licenceFiles.length > 0, source.key);
      assert.ok(!/xyce|ngspice/i.test(source.repository), `${source.key}: corpus-h is non-Xyce, non-ngspice`);
    }
    assert.equal(sourceUrl(sourceByKey('kicad'), 'qa/data/a b.spice'), 'https://gitlab.com/kicad/code/kicad/-/blob/240efadec4b408919fef7e79deb54ac7c1269597/qa/data/a%20b.spice');
    assert.equal(sourceUrl(sourceByKey('ahkab'), 'tests/t1/t1.ckt'), 'https://github.com/ahkab/ahkab/blob/1e8939194b689909b8184ce7eba478b485ff9e3a/tests/t1/t1.ckt');
  });

  it('considers deck extensions under the source roots only', () => {
    const kicad = sourceByKey('kicad');
    assert.ok(isCandidatePath(kicad, 'qa/data/eeschema/spice_netlists/chirp/chirp.spice'));
    assert.ok(!isCandidatePath(kicad, 'qa/data/pcbnew/plugins/legacy_demos/video/video.net'));
    assert.ok(!isCandidatePath(kicad, 'qa/data/eeschema/spice_netlists/chirp/chirp.kicad_sch'));
  });
});

describe('corpus-h static rules', () => {
  it('reuses the corpus-f deck rules: notices, companions, analyses', () => {
    assert.equal(candidate('pyspice', 'a.cir', 't\n* Copyright 2001 Vendor Inc.\n.op\n').verdict.reason, 'licence');
    assert.equal(candidate('pyspice', 'a.cir', 't\n.include models.lib\n.op\n').verdict.reason, 'not-self-contained');
    assert.equal(candidate('pyspice', 'x/a.cir', 't\nV1 1 0 pwl file=stim.txt\n.tran 1 2\n', new Set(['x/a.cir', 'x/stim.txt'])).verdict.reason, 'not-self-contained');
    assert.equal(candidate('pyspice', 'a.cir', 't\n.subckt x 1 2\nR1 1 2 1\n.ends\n').verdict.reason, 'no-analysis');
    assert.deepEqual(candidate('pyspice', 'a.cir', 't\nR1 1 0 1\nV1 1 0 1\n.op\n.tran 1n 1u\n').verdict, { reason: null, analyses: ['op', 'tran'], unmappedAnalyses: [] });
  });

  it('drops skipped paths, decks already in a corpus (also without the terminal newline), then duplicates across sources', () => {
    const deck = 't\nR1 1 0 1\nV1 1 0 1\n.op\n';
    const { eligible, exclusions } = staticSelection(
      [
        candidate('spicelib', 'unittests/golden/edited.net', 'g\n.op\n'),
        candidate('xschem', 'b.cir', deck),
        candidate('ahkab', 'tests/a.ckt', deck),
        candidate('pyspice', 'known.cir', 'known\n.op\n'),
      ],
      { hashes: new Set([sha256('known\n.op')]), names: new Map() },
    );
    assert.deepEqual(eligible.map(entry => entry.sourcePath), ['ahkab/tests/a.ckt']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['pyspice/known.cir', 'already-in-corpus'],
      ['spicelib/unittests/golden/edited.net', 'skipped-path'],
      ['xschem/b.cir', 'duplicate-content'],
    ]);
  });
});

describe('corpus-h gap buckets', () => {
  it('names corpus-h failures from the spice-ts error line alone, then falls back to the corpus-g/f rules', () => {
    assert.equal(gapBucket("Parse error at line 21: Unsupported .control command '#': it is not", 'unsupported'), 'control: edit command and # comment lines inside .control');
    assert.equal(gapBucket("Parse error at line 5: Unsupported .options field: 'INTERP' .option INTERP", 'unsupported'), 'directive: other .options fields ngspice-47 accepts (INTERP, ysep, ...)');
    assert.equal(gapBucket("Cannot parse number: 'R1'", 'unsupported'), 'expression: bare parameter names as values (X-card R=R1, M = 10)');
    assert.equal(gapBucket("Cannot parse number: '27°C' .options TEMP = 27°C", 'unsupported'), 'syntax: non-ASCII unit suffixes on numbers (27°C)');
    assert.equal(gapBucket("Cannot parse number: '(' E1 (a 0) (b 0) -10", 'unsupported'), 'syntax: parenthesised node pairs on controlled-source cards');
    assert.equal(gapBucket("Cannot read properties of undefined (reading 'startsWith')", 'failed'), 'crash: uncaught TypeError instead of a structured error');
    assert.equal(gapBucket('Timestep too small at t=0: dt=1e-15', 'failed'), 'convergence');
    assert.equal(gapBucket(undefined, 'success'), undefined);
  });
});

describe('corpus-h reference selection', () => {
  const a1 = candidate('ahkab', 'tests/a/a1.ckt', 'a1\nR1 1 0 1\nV1 1 0 1\n.op\n');
  const a2 = candidate('ahkab', 'tests/a/a2.ckt', 'a2\nR1 1 0 2\nV1 1 0 1\n.op\n');
  const a3 = candidate('ahkab', 'tests/a/a3.ckt', 'a3\nR1 1 0 3\nV1 1 0 1\n.op\n');
  const b1 = candidate('ahkab', 'tests/a/sub/b1.ckt', 'b1\nR1 1 0 4\nV1 1 0 1\n.op\n');

  it('keeps only decks with an ngspice reference and caps each upstream directory in path order', () => {
    const probes = new Map([a1, a2, a3, b1].map(entry => [entry.sourcePath, probe(entry, entry === a1 ? 'unsupported' : 'success', entry === a1 ? 'Error: unknown device' : undefined)]));
    const { circuits, exclusions } = finalSelection([b1, a3, a2, a1], probes, new Map([['b1.ckt', ['benchmarks/corpus/x/fixtures/b1.ckt']]]), 1);
    assert.deepEqual(circuits.map(circuit => [circuit.id, circuit.localPath, circuit.licence]), [
      ['ahkab-tests-a-a2-ckt', 'benchmarks/corpus/corpus-h/fixtures/ahkab/tests/a/a2.ckt', 'GPL-2.0-only'],
      ['ahkab-tests-a-sub-b1-ckt', 'benchmarks/corpus/corpus-h/fixtures/ahkab/tests/a/sub/b1.ckt', 'GPL-2.0-only'],
    ]);
    assert.deepEqual(circuits[1].sameNameAs, ['benchmarks/corpus/x/fixtures/b1.ckt']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['ahkab/tests/a/a1.ckt', 'ngspice-no-reference'],
      ['ahkab/tests/a/a3.ckt', 'directory-cap'],
    ]);
    assert.equal(capDirectory('ahkab/tests/a/sub/b1.ckt'), 'ahkab/tests/a/sub');
    assert.match(exclusions[0].detail, /ngspice unsupported: Error: unknown device/);
  });

  it('refuses a probe recorded for different bytes', () => {
    const stale = new Map([[a1.sourcePath, { ...probe(a1, 'success'), sha256: '0'.repeat(64) }]]);
    assert.throws(() => finalSelection([a1], stale, new Map()), /no ngspice probe for these bytes/);
  });
});

describe('corpus-h committed artifacts', () => {
  it('pins every fixture and licence file byte-for-byte, accounts for every candidate and never overlaps another corpus', async () => {
    const committed = await manifest();
    assert.deepEqual(committed.sources.map(source => [source.key, source.revision, source.license]), SOURCES.map(source => [source.key, source.revision, source.licence]));
    for (const source of committed.sources) {
      for (const file of source.licenseFiles) assert.equal(sha256(await readFile(resolve(file.localPath))), file.sha256, file.localPath);
      assert.equal(source.selected, committed.circuits.filter(circuit => circuit.source === source.key).length, source.key);
    }
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
      assert.equal(circuit.localPath, `${ROOT}/fixtures/${circuit.source}/${circuit.upstreamPath}`, circuit.id);
      assert.equal(circuit.licence, sourceByKey(circuit.source).licence, circuit.id);
      assert.ok(!hashes.has(circuit.sha256), `${circuit.id}: duplicate content`);
      assert.ok(!existing.hashes.has(circuit.sha256) && !existing.hashes.has(sha256(stripTerminalNewline(bytes))), `${circuit.id}: already in a corpus`);
      hashes.add(circuit.sha256);
      const directory = capDirectory(circuit.sourcePath);
      directories.set(directory, (directories.get(directory) ?? 0) + 1);
    }
    assert.ok([...directories.values()].every(count => count <= committed.selection.perDirectoryCap));
    for (const exclusion of committed.exclusions.filter(entry => entry.reason === 'licence')) {
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
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusHReport;
    const committed = await manifest();
    assert.equal(report.manifestSha256, sha256(await readFile(resolve(ROOT, 'manifest.json'))));
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
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusHReport;
    for (const bucket of report.gapBuckets.filter(entry => entry.ngspiceSuccess >= 3 && !entry.bucket.startsWith('parse: other') && !entry.bucket.startsWith('execution: other'))) {
      assert.ok(GAP_ISSUES[bucket.bucket], `no issue linked for bucket "${bucket.bucket}"`);
    }
  });
});
