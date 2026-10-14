import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { outcomeDigest } from '../corpus-f/outcomes.js';
import { staticVerdict, stripTerminalNewline } from '../corpus-h/lib.js';
import { ROOT, gapBucket, renderMarkdown, report } from './parity.js';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('20 original standalone decks have pinned licence and byte provenance, no duplicate padding', async () => {
  const manifest = JSON.parse(await readFile(`${ROOT}/manifest.json`, 'utf8'));
  assert.equal(manifest.circuits.length, 20);
  assert.equal(manifest.mechanicalAdaptation, 'none');
  const existing = new Set<string>();
  for (const corpus of await readdir('benchmarks/corpus')) {
    if (corpus === 'corpus-k') continue;
    let files;
    try { files = await readdir(`benchmarks/corpus/${corpus}/fixtures`, { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files.filter(f => f.isFile())) {
      const bytes = await readFile(resolve(file.parentPath, file.name));
      existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    }
  }
  for (const c of manifest.circuits) {
    const bytes = await readFile(c.localPath);
    assert.equal(hash(bytes), c.sha256); assert.equal(bytes.length, c.bytes);
    assert(!existing.has(hash(bytes)) && !existing.has(hash(stripTerminalNewline(bytes))), c.sourcePath);
    existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    assert.equal(staticVerdict(bytes, c.upstreamPath, new Set<string>()).reason, null);
    assert.deepEqual(c.includeClosure, []);
    assert.equal(c.licence, 'GPL-3.0-or-later');
    assert(c.sourceUrl.includes(`${c.revision}/${c.upstreamPath}`));
    assert.match(c.revision, /^[a-f0-9]{40}$/);
  }
  assert.equal((await readdir(`${ROOT}/fixtures`, { recursive: true, withFileTypes: true })).filter(f => f.isFile()).length, 20);
  for (const s of manifest.sources) {
    assert.equal(hash(await readFile(s.licensePath)), s.licenseSha256);
    assert.equal(hash(await readFile(s.licenseTextPath)), s.licenseTextSha256);
    assert(s.basis.includes('GPL'));
  }
  for (const receipt of [manifest.exclusions, manifest.rejectedSourceSurvey]) {
    assert.equal(hash(await readFile(receipt.receipt)), receipt.receiptSha256);
  }
  assert.equal(hash(await readFile(manifest.rejectedSourceSurvey.licensePath)), manifest.rejectedSourceSurvey.licenseSha256);
  const ng = JSON.parse(await readFile(manifest.rejectedSourceSurvey.receipt, 'utf8'));
  assert.equal(ng.candidates.length, 509);
  assert.equal(ng.candidates.filter((c: { reason: string | null }) => c.reason === null).length, 0);
  const xyce = JSON.parse(await readFile(manifest.exclusions.receipt, 'utf8'));
  assert.equal(xyce.candidates.length, 4133);
  assert.deepEqual(manifest.exclusions.selectedPaths, manifest.circuits.map((c: { upstreamPath: string }) => c.upstreamPath));
  const sources = await readFile('benchmarks/SOURCES.md', 'utf8');
  for (const c of manifest.circuits) assert(sources.includes(`| ${c.id} | ${c.upstreamPath} | GPL-3.0-or-later; Xyce README grant |`));
});

test('gap buckets identify error classes rather than circuit identities', () => {
  assert.equal(gapBucket("MOSFET level 2 model 'p': series resistance parameter RSH is not supported", 'failed'), 'MOS2: drain/source series resistance');
  assert.equal(gapBucket("Unsupported .options maxord value: '1'", 'unsupported'), 'integration: MAXORD=1 unsupported');
  assert.equal(gapBucket("Unsupported .options maxord value: '1'", 'success'), undefined);
});

test('all outcomes and losses are retained, hashed, uniformly compared and rendered', async () => {
  const manifestBytes = await readFile(`${ROOT}/manifest.json`);
  const manifest = JSON.parse(manifestBytes.toString());
  const result = JSON.parse(await readFile(`${ROOT}/outcomes.json`, 'utf8'));
  assert.equal(result.manifestSha256, hash(manifestBytes));
  assert.equal(result.outcomeSha256, outcomeDigest(result));
  assert.deepEqual(result.fixtures.map((r: { sha256: string }) => r.sha256), manifest.circuits.map((c: { sha256: string }) => c.sha256));
  assert.deepEqual(result.totals, report.summarize(result.fixtures).totals);
  assert.deepEqual(result.gapBuckets, report.summarize(result.fixtures).gapBuckets);
  assert.equal(result.tools.ngspice, 'ngspice-47');
  assert.equal(result.policy.fixtureAdaptation, 'none');
  assert.equal(result.policy.perCircuitToleranceTuning, false);
  assert.equal(result.policy.matchThreshold, 0.01);
  const readme = await readFile(`${ROOT}/README.md`, 'utf8');
  assert.equal(readme, renderMarkdown(result));
  for (const row of result.fixtures) {
    assert(readme.includes(row.sourcePath));
    assert(row.runtime.ngspiceChildWallMs >= 0 && row.runtime.spiceTsChildWallMs >= 0);
    if (row.comparedSignals === 0) { assert.equal(row.worstNormalizedError, null); assert.notEqual(row.outcome, 'matched'); }
    for (const comparison of row.comparisons) {
      for (const metric of Object.values(comparison.metrics.signals) as Array<{ status: string; absoluteError: { max: number; rms: number }; relativeError: object }>) {
        if (metric.status !== 'compared') continue;
        assert(Number.isFinite(metric.absoluteError.max)); assert(Number.isFinite(metric.absoluteError.rms));
        assert(Object.hasOwn(metric.relativeError, 'max')); assert(Object.hasOwn(metric.relativeError, 'rms'));
      }
    }
  }
});
