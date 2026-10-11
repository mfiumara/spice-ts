import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { existingCorpusIdentity, renderSources, selectDecks, type CorpusFManifest } from './ingest.js';
import {
  classifyNgspiceFailure,
  companionReferences,
  declaredAnalyses,
  firstNgspiceErrorLine,
  fixtureId,
  gapBucket,
  hostCommand,
  MATCH_THRESHOLD,
  needsExternalInput,
  normalizedSignalErrors,
  outcome,
  thirdPartyNotice,
} from './lib.js';
import { outcomeDigest, renderMarkdown, summarize, type CorpusFReport } from './outcomes.js';

const ROOT = 'benchmarks/corpus/corpus-f';

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function manifest(): Promise<CorpusFManifest> {
  return JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8')) as CorpusFManifest;
}

describe('corpus-f deck classification', () => {
  it('reads dot-card and control-block analyses but never the title line', () => {
    const deck = '.tran in the title\nV1 1 0 1\n.op\n.AC dec 10 1 1k\n.control\ntran 1n 1u\nsens v(1)\n.endc\n.end\n';
    assert.deepEqual(declaredAnalyses(deck), { mapped: ['op', 'ac', 'tran'], unmapped: ['sens'] });
    assert.deepEqual(declaredAnalyses('title\n* .tran 1 2\nR1 1 0 1\n.end\n'), { mapped: [], unmapped: [] });
  });

  it('defers decks that need companion files or compiled OSDI models', () => {
    assert.equal(needsExternalInput('t\n.include models.lib\n'), '.include models.lib');
    assert.equal(needsExternalInput('t\n.control\npre_osdi ../x.osdi\n.endc\n'), 'pre_osdi ../x.osdi');
    assert.match(needsExternalInput('t\nN1 1 0 rmodel w=1u\n') ?? '', /OSDI device N1/);
    assert.equal(needsExternalInput('t\n.control\nnoise v(1) v1 dec 10 1 1k\n.endc\n'), undefined);
    const files = new Set(['examples/a/deck.cir', 'examples/a/stim.txt', 'examples/b/model.mod']);
    assert.deepEqual(companionReferences('t\na1 [1] filesource input_file="stim.txt"\n.inc ../b/model.mod\n', 'examples/a/deck.cir', files), [
      'examples/a/stim.txt',
      'examples/b/model.mod',
    ]);
  });

  it('flags host commands and third-party notices', () => {
    assert.equal(hostCommand('t\n.control\nrun\n  shell ls\n.endc\n'), 'shell ls');
    assert.equal(hostCommand('t\n.control\nrun\nplot v(1)\n.endc\n'), undefined);
    assert.equal(thirdPartyNotice('t\n* Copyright 1993 by Analog Devices, Inc.\n'), 'Copyright 1993 by Analog Devices, Inc.');
    assert.equal(thirdPartyNotice('t\nR1 1 0 1\n'), undefined);
  });

  it('derives stable path ids', () => {
    assert.equal(fixtureId('examples/xspice/various/xspice_c1.cir'), 'examples-xspice-various-xspice-c1-cir');
  });

  it('selects in path order, deduplicates by content, and keeps exclusions with reasons', () => {
    const deck = Buffer.from('t\nR1 1 0 1\nV1 1 0 1\n.op\n.end\n');
    const { circuits, exclusions } = selectDecks(
      [
        { sourcePath: 'tests/b.cir', bytes: deck },
        { sourcePath: 'tests/a.cir', bytes: deck },
        { sourcePath: 'tests/known.cir', bytes: Buffer.from('known\n.op\n') },
        { sourcePath: 'tests/lib.cir', bytes: Buffer.from('t\n.subckt x 1 2\nR1 1 2 1\n.ends\n') },
      ],
      new Set(['tests/a.cir', 'tests/b.cir', 'tests/known.cir', 'tests/lib.cir']),
      { hashes: new Set([sha256('known\n.op')]), ngspicePaths: new Set() },
    );
    assert.deepEqual(circuits.map(circuit => circuit.sourcePath), ['tests/a.cir']);
    assert.deepEqual(exclusions.map(exclusion => [exclusion.sourcePath, exclusion.reason]), [
      ['tests/b.cir', 'duplicate-content'],
      ['tests/known.cir', 'already-in-corpus'],
      ['tests/lib.cir', 'no-analysis'],
    ]);
  });
});

describe('corpus-f outcome rules', () => {
  it('extracts the first ngspice error line and classifies it', () => {
    const output = 'Circuit: t\nWarning: something\nError on line 3 :\n  q1 1 2 3 nomodel\nError: unknown device type\n';
    assert.equal(firstNgspiceErrorLine(output), 'Error on line 3 :');
    assert.equal(classifyNgspiceFailure(output), 'unsupported');
    assert.equal(classifyNgspiceFailure('doAnalyses: TRAN:  Timestep too small'), 'failed');
  });

  it('buckets spice-ts failures by their own error text', () => {
    assert.equal(gapBucket(undefined, 'success'), undefined);
    assert.equal(gapBucket("Parse error at line 19: Unsupported .control command 'dc': only bare", 'unsupported'), "control: analysis commands inside .control (tran/dc/op/ac/...)");
    assert.equal(gapBucket("Parse error at line 3: Unsupported .control command 'set': only bare", 'unsupported'), 'control: ngspice control-language scripting (set/let/save/foreach/meas/...)');
    assert.equal(gapBucket("Parse error at line 4: Unsupported device card: 'A' a1 1 2 gain_block", 'unsupported'), 'device: XSPICE A-element code models');
    assert.equal(gapBucket("Parse error at line 4: Unsupported dot command: '.global' .global vdd", 'unsupported'), 'directive: .global');
    assert.equal(gapBucket('weird', 'unsupported'), 'parse: other unsupported syntax');
    assert.equal(gapBucket('spice-ts exceeded the 120000 ms aggregate execution bound', 'failed'), 'timeout: spice-ts exceeded the 120 s bound');
    assert.equal(gapBucket('Transient analysis: timestep too small at t=1e-9', 'failed'), 'convergence');
  });

  it('normalises errors to the ngspice peak and applies one threshold to every fixture', () => {
    const reference = { grid: [0, 1], signals: { 'v(1)': [{ re: 0, im: 0 }, { re: 10, im: 0 }], 'v(2)': [{ re: 0, im: 0 }, { re: 0, im: 0 }] } };
    const compared = (max: number) => ({ status: 'compared' as const, sampleCount: 2, absoluteError: { max, rms: max }, relativeError: { max: null, rms: null, sampleCount: 0, excludedZeroReferences: 2 } });
    const { errors, missing } = normalizedSignalErrors(
      [{ analysis: 'tran', metrics: { grid: { spiceTsPoints: 2, ngspicePoints: 2, alignedPoints: 2, excludedOutOfRange: 0 }, signals: { 'v(1)': compared(0.05), 'v(2)': compared(0) } } }],
      () => reference,
    );
    assert.equal(missing, 0);
    assert.deepEqual(errors.map(error => [error.signal, error.normalized]), [['v(1)', 0.005], ['v(2)', 0]]);
    const base = { ngspice: 'success' as const, spiceTs: 'success' as const, comparedAnalyses: 1, spiceTsAnalyses: 1, missingSignals: 0 };
    assert.equal(outcome({ ...base, worstNormalized: MATCH_THRESHOLD }), 'matched');
    assert.equal(outcome({ ...base, worstNormalized: MATCH_THRESHOLD * 1.01 }), 'mismatch');
    assert.equal(outcome({ ...base, comparedAnalyses: 0, worstNormalized: null }), 'not-compared');
    assert.equal(outcome({ ...base, spiceTs: 'unsupported', worstNormalized: null }), 'spice-ts-loss');
    assert.equal(outcome({ ...base, ngspice: 'failed', worstNormalized: null }), 'ngspice-failed');
    assert.equal(outcome({ ...base, ngspice: 'failed', spiceTs: 'failed', worstNormalized: null }), 'both-failed');
  });
});

describe('corpus-f committed artifacts', () => {
  it('pins every fixture byte-for-byte and accounts for every candidate', async () => {
    const committed = await manifest();
    assert.equal(committed.source.revision, '3ef069fb1f04177a153f342a32d941fc20ff047e');
    assert.equal(sha256(await readFile(resolve(committed.source.licenseTextLocalPath))), committed.source.licenseTextSha256);
    assert.ok(committed.circuits.length >= 60, `expected >= 60 fixtures, found ${committed.circuits.length}`);
    assert.equal(committed.selection.selected, committed.circuits.length);
    assert.equal(committed.selection.candidates, committed.circuits.length + committed.exclusions.length);
    for (const [reason, count] of Object.entries(committed.selection.excluded)) {
      assert.equal(committed.exclusions.filter(exclusion => exclusion.reason === reason).length, count, reason);
    }
    const existing = await existingCorpusIdentity(resolve('.'));
    const hashes = new Set<string>();
    for (const circuit of committed.circuits) {
      const bytes = await readFile(resolve(circuit.localPath));
      assert.equal(sha256(bytes), circuit.sha256, circuit.id);
      assert.equal(circuit.licence, 'BSD-3-Clause');
      assert.ok(circuit.localPath.startsWith(`${ROOT}/fixtures/`), circuit.id);
      assert.ok(!hashes.has(circuit.sha256), `${circuit.id}: duplicate content`);
      assert.ok(!existing.hashes.has(circuit.sha256) && !existing.ngspicePaths.has(circuit.sourcePath), `${circuit.id}: already in a corpus`);
      hashes.add(circuit.sha256);
    }
    for (const exclusion of committed.exclusions.filter(candidate => candidate.reason === 'licence')) {
      assert.ok(!committed.circuits.some(circuit => circuit.sourcePath === exclusion.sourcePath));
    }
  });

  it('keeps SOURCES.md generated from the manifest', async () => {
    assert.equal(await readFile(resolve(ROOT, 'SOURCES.md'), 'utf8'), renderSources(await manifest()));
  });

  it('keeps README.md and totals generated from outcomes.json', async () => {
    const report = JSON.parse(await readFile(resolve(ROOT, 'outcomes.json'), 'utf8')) as CorpusFReport;
    const committed = await manifest();
    assert.equal(report.source.manifestSha256, sha256(await readFile(resolve(ROOT, 'manifest.json'))));
    assert.deepEqual(report.fixtures.map(fixture => fixture.id), committed.circuits.map(circuit => circuit.id));
    assert.equal(report.outcomeSha256, outcomeDigest(report));
    for (const fixture of report.fixtures) {
      assert.equal(fixture.gapBucket, gapBucket(fixture.spiceTs.firstErrorLine, fixture.spiceTs.status) ?? null, fixture.id);
    }
    const { totals, gapBuckets } = summarize(report.fixtures);
    assert.deepEqual(report.totals, totals);
    assert.deepEqual(report.gapBuckets, gapBuckets);
    assert.equal(await readFile(resolve(ROOT, 'README.md'), 'utf8'), renderMarkdown(report));
  });
});
