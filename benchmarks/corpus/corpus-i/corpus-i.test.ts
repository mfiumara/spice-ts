import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { outcomeDigest } from '../corpus-f/outcomes.js';
import { type CorpusIManifest, existingCorpusIdentity, type ProbeReceipt, renderSources } from './ingest.js';
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
import { type CorpusIReport, GAP_ISSUES, renderMarkdown, summarize } from './parity.js';

const ROOT = 'benchmarks/corpus/corpus-i';

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

async function manifest(): Promise<CorpusIManifest> {
  return JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusIManifest;
}

describe('corpus-i source table', () => {
  it('pins every source to a full revision and a redistributable licence', () => {
    assert.deepEqual(SOURCES.map(source => source.key), [...SOURCES.map(source => source.key)].sort());
    for (const source of SOURCES) {
      assert.match(source.revision, /^[0-9a-f]{40}$/, source.key);
      assert.ok(source.licenceFiles.length > 0, source.key);
    }
    assert.equal(sourceUrl(sourceByKey('vacask'), 'benchmark/rc/ngspice/runme.sim'), 'https://codeberg.org/arpadbuermen/VACASK/src/commit/fb8cc2055a4f10cff1de8017b554d22ea57ce448/benchmark/rc/ngspice/runme.sim');
    assert.equal(sourceUrl(sourceByKey('kicad'), 'demos/simulation/a b.cir'), 'https://gitlab.com/kicad/code/kicad/-/blob/240efadec4b408919fef7e79deb54ac7c1269597/demos/simulation/a%20b.cir');
    assert.equal(sourceUrl(sourceByKey('esim'), 'Examples/RC/RC.cir.out'), 'https://github.com/FOSSEE/eSim/blob/1a25a46ce15e0ccc35296dd513f40249c089a5a7/Examples/RC/RC.cir.out');
  });

  it('considers deck extensions (with .sim and .cir.out) under the source roots only', () => {
    const esim = sourceByKey('esim');
    assert.ok(isCandidatePath(esim, 'Examples/RC/RC.cir.out'));
    assert.ok(isCandidatePath(esim, 'Examples/RC/RC.cir'));
    assert.ok(!isCandidatePath(esim, 'library/SubcircuitLibrary/lm741/lm741.cir.out'));
    assert.ok(!isCandidatePath(esim, 'Examples/RC/RC.out'));
    assert.ok(isCandidatePath(sourceByKey('vacask'), 'benchmark/graetz/ngspice/runme.sim'));
    assert.ok(!isCandidatePath(sourceByKey('kicad'), 'qa/data/eeschema/issue13162.spice'));
  });
});

describe('corpus-i static rules', () => {
  it('reuses the corpus-f deck rules: notices, companions, analyses', () => {
    assert.equal(candidate('esim', 'Examples/a.cir.out', 't\n* Copyright 2023 IHP PDK Authors\n.op\n').verdict.reason, 'licence');
    assert.equal(candidate('vacask', 'benchmark/c6288/ngspice/runme.sim', 't\n.include "models.inc"\n.op\n').verdict.reason, 'not-self-contained');
    assert.equal(candidate('esim', 'Examples/a.cir.out', 't\n.subckt x 1 2\nR1 1 2 1\n.ends\n').verdict.reason, 'no-analysis');
    assert.deepEqual(candidate('esim', 'Examples/a.cir.out', 't\nR1 1 0 1\nV1 1 0 1\n.op\n.tran 1n 1u\n').verdict, { reason: null, analyses: ['op', 'tran'], unmappedAnalyses: [] });
  });

  it('drops decks already in a corpus (also without the terminal newline), then duplicates across sources', () => {
    const deck = 't\nR1 1 0 1\nV1 1 0 1\n.op\n';
    const { eligible, exclusions } = staticSelection(
      [
        candidate('vacask', 'b.sim', deck),
        candidate('esim', 'Examples/a.cir.out', deck),
        candidate('rioslinares', 'known.cir', 'known\n.op\n'),
      ],
      { hashes: new Set([sha256('known\n.op')]), names: new Map() },
    );
    assert.deepEqual(eligible.map(entry => entry.sourcePath), ['esim/Examples/a.cir.out']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['rioslinares/known.cir', 'already-in-corpus'],
      ['vacask/b.sim', 'duplicate-content'],
    ]);
  });
});

describe('corpus-i gap buckets', () => {
  it('names corpus-i failures from the spice-ts error line alone', () => {
    assert.equal(gapBucket("Parse error at line 45: XSPICE code model 'd_jkff' (.model 'u3') is not supported (supported: gain, summer,", 'unsupported'), 'device: XSPICE code models not yet implemented (d_jkff, lcouple, zener, ...)');
    assert.equal(gapBucket("XSPICE event-driven instance 'a1' (d_xor) is supported in .op and .tran only, not .ac", 'failed'), 'analysis: .ac with XSPICE event-driven digital instances');
    assert.equal(gapBucket("Capacitor 'X1.C1' references unknown model 'cval'", 'unsupported'), 'expression: bare .param names as R/C/L values (R1 a b rval)');
    assert.equal(gapBucket('<--- Last few GCs --->', 'failed'), 'harness: spice-ts child exhausts the V8 heap on a long transient');
  });

  it('falls back to the corpus-h (and corpus-g/f) rules from the spice-ts error line alone', () => {
    assert.equal(gapBucket("Parse error at line 5: Unsupported .options field: 'INTERP' .option INTERP", 'unsupported'), 'directive: other .options fields ngspice-47 accepts (INTERP, ysep, ...)');
    assert.equal(gapBucket('Timestep too small at t=0: dt=1e-15', 'failed'), 'convergence');
    assert.equal(gapBucket(undefined, 'success'), undefined);
  });
});

describe('corpus-i reference selection', () => {
  const a1 = candidate('esim', 'Examples/a/a1.cir.out', 'a1\nR1 1 0 1\nV1 1 0 1\n.op\n');
  const a2 = candidate('esim', 'Examples/a/a2.cir.out', 'a2\nR1 1 0 2\nV1 1 0 1\n.op\n');
  const a3 = candidate('esim', 'Examples/a/a3.cir.out', 'a3\nR1 1 0 3\nV1 1 0 1\n.op\n');
  const b1 = candidate('esim', 'Examples/a/sub/b1.cir.out', 'b1\nR1 1 0 4\nV1 1 0 1\n.op\n');

  it('keeps only decks with an ngspice reference and caps each upstream directory in path order', () => {
    const probes = new Map([a1, a2, a3, b1].map(entry => [entry.sourcePath, probe(entry, entry === a1 ? 'unsupported' : 'success', entry === a1 ? 'Error: unknown device' : undefined)]));
    const { circuits, exclusions } = finalSelection([b1, a3, a2, a1], probes, new Map([['b1.cir.out', ['benchmarks/corpus/x/fixtures/b1.cir.out']]]), 1);
    assert.deepEqual(circuits.map(circuit => [circuit.id, circuit.localPath, circuit.licence]), [
      ['esim-examples-a-a2-cir-out', 'benchmarks/corpus/corpus-i/fixtures/esim/Examples/a/a2.cir.out', 'GPL-3.0-only'],
      ['esim-examples-a-sub-b1-cir-out', 'benchmarks/corpus/corpus-i/fixtures/esim/Examples/a/sub/b1.cir.out', 'GPL-3.0-only'],
    ]);
    assert.deepEqual(circuits[1].sameNameAs, ['benchmarks/corpus/x/fixtures/b1.cir.out']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['esim/Examples/a/a1.cir.out', 'ngspice-no-reference'],
      ['esim/Examples/a/a3.cir.out', 'directory-cap'],
    ]);
    assert.equal(capDirectory('esim/Examples/a/sub/b1.cir.out'), 'esim/Examples/a/sub');
    assert.match(exclusions[0].detail, /ngspice unsupported: Error: unknown device/);
  });

  it('refuses a probe recorded for different bytes', () => {
    const stale = new Map([[a1.sourcePath, { ...probe(a1, 'success'), sha256: '0'.repeat(64) }]]);
    assert.throws(() => finalSelection([a1], stale, new Map()), /no ngspice probe for these bytes/);
  });
});

describe('corpus-i committed artifacts', () => {
  it('pins every fixture and licence file byte-for-byte, accounts for every candidate and never overlaps another corpus', async () => {
    const committed = await manifest();
    assert.deepEqual(committed.sources.map(source => [source.key, source.revision, source.license]), SOURCES.map(source => [source.key, source.revision, source.licence]));
    for (const source of committed.sources) {
      for (const file of source.licenseFiles) assert.equal(sha256(await readFile(resolve(file.localPath))), file.sha256, file.localPath);
      assert.equal(source.selected, committed.circuits.filter(circuit => circuit.source === source.key).length, source.key);
    }
    assert.ok(committed.circuits.length >= 20, `expected >= 20 fixtures (#834), found ${committed.circuits.length}`);
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
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusIReport;
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

  it('links an issue for every gap bucket that ngspice runs (#834: one issue per new gap bucket)', async () => {
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusIReport;
    for (const bucket of report.gapBuckets.filter(entry => entry.ngspiceSuccess > 0)) {
      assert.ok(GAP_ISSUES[bucket.bucket], `no issue linked for bucket "${bucket.bucket}"`);
    }
  });
});
