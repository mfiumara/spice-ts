import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { outcomeDigest } from '../corpus-f/outcomes.js';
import { stripTerminalNewline, staticVerdict } from '../corpus-h/lib.js';
import { CHILD_BOUND_MS, WALL_BUDGET_MS, consumedWall, reduceRow, summarize, ROOT, type Circuit } from './parity.js';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(`${ROOT}/manifest.json`);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const historicalCircuits = manifest.circuits.slice(0, 11);

test('historical partial delivery preserves its 11 genuinely novel decks', async () => {
  assert.equal(manifest.requestedFixtures, 20);
  assert.equal(historicalCircuits.length, 11);
  const existing = new Set<string>();
  for (const directory of await readdir('benchmarks/corpus')) {
    if (directory === 'corpus-j') continue;
    let files;
    try { files = await readdir(resolve('benchmarks/corpus', directory, 'fixtures'), { recursive: true, withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of files) {
      if (!file.isFile()) continue;
      const bytes = await readFile(resolve(file.parentPath, file.name));
      existing.add(hash(bytes)); existing.add(hash(stripTerminalNewline(bytes)));
    }
  }
  const seen = new Set<string>();
  for (const circuit of historicalCircuits) {
    const bytes = await readFile(circuit.localPath);
    assert.equal(hash(bytes), circuit.sha256);
    assert.equal(bytes.length, circuit.bytes);
    assert(!existing.has(hash(bytes)) && !existing.has(hash(stripTerminalNewline(bytes))), circuit.sourcePath);
    assert(!seen.has(hash(stripTerminalNewline(bytes))), circuit.sourcePath);
    seen.add(hash(stripTerminalNewline(bytes)));
    assert.equal(staticVerdict(bytes, circuit.upstreamPath, new Set<string>()).reason, null);
    assert(!/\bpwl\s+file\s*=/i.test(bytes.toString('utf8')));
    assert.deepEqual(circuit.includeClosure, []);
    assert.equal(circuit.licence, 'MIT');
    assert.match(circuit.revision, /^[a-f0-9]{40}$/);
    assert(circuit.sourceUrl.includes(`${circuit.revision}/${circuit.upstreamPath}`));
  }
  const files = await readdir(`${ROOT}/fixtures`, { recursive: true, withFileTypes: true });
  assert.equal(files.filter(file => file.isFile()).length, manifest.circuits.length, 'no stale/unmanifested companion or fixture');
});

test('licence notices and exclusion provenance are hashed and pinned', async () => {
  for (const source of manifest.sources) {
    assert.equal(hash(await readFile(source.licensePath)), source.licenseSha256);
    assert(source.basis.length > 20);
  }
  assert.equal(manifest.exclusions.filter((e: { source: string }) => e.source === 'esim').length, 65);
  assert(manifest.exclusions.some((e: { detail: string }) => e.detail.includes('PWL file source')));
  assert(manifest.exclusions.some((e: { detail: string }) => e.detail.includes('IHP-Open-PDK')));
  assert.equal(manifest.mechanicalAdaptation, 'none');
});

test('success without comparable waveforms never means matched; unsupported losses retained', () => {
  const circuit = manifest.circuits[0] as Circuit;
  const success = { status: 'success' as const, convergence: 'converged' as const, analyses: [] };
  assert.equal(reduceRow(circuit, { status: 'success', execution: success }, success).outcome, 'not-compared');
  const failed = { status: 'unsupported' as const, convergence: 'unsupported' as const, analyses: [], error: 'Unsupported model' };
  assert.equal(reduceRow(circuit, { status: 'success', execution: success }, failed).outcome, 'spice-ts-loss');
  assert.equal(reduceRow(circuit, { status: 'failed', execution: failed }, failed).outcome, 'both-failed');
});

test('wall accounting preserves interrupted attempt reservation instead of resetting budget', () => {
  assert.equal(consumedWall([{ event: 'start' }]), CHILD_BOUND_MS);
  assert.equal(consumedWall([{ event: 'start' }, { event: 'end', wallMs: 750 }, { event: 'start' }]), 750 + CHILD_BOUND_MS);
});

test('committed report preserves all rows, every loss and metric/runtime boundaries', async () => {
  const report = JSON.parse(await readFile(`${ROOT}/outcomes.json`, 'utf8'));
  assert.equal(report.manifestSha256, manifest.historicalManifestSha256);
  assert.equal(report.outcomeSha256, outcomeDigest(report));
  assert.deepEqual(report.fixtures.map((r: { sha256: string }) => r.sha256), historicalCircuits.map((c: { sha256: string }) => c.sha256));
  assert.deepEqual(report.totals, summarize(report.fixtures).totals);
  assert.deepEqual(report.gapBuckets, summarize(report.fixtures).gapBuckets);
  assert.equal(report.policy.fixtureAdaptation, 'none');
  assert.equal(report.policy.perCircuitToleranceTuning, false);
  assert.equal(report.tools.ngspice, 'ngspice-47');
  const entries = (await readFile(`${ROOT}/wall.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(entries.filter(e => e.event === 'start').length, entries.filter(e => e.event === 'end').length);
  assert.equal(report.actualCumulativeChildWallMs, consumedWall(entries));
  assert(consumedWall(entries) <= WALL_BUDGET_MS);
  for (const entry of entries.filter(e => e.event === 'end')) assert(entry.wallMs <= CHILD_BOUND_MS, JSON.stringify(entry));
  for (const row of report.fixtures) {
    assert(row.runtime.ngspiceChildWallMs >= 0 && row.runtime.spiceTsChildWallMs >= 0);
    if (row.comparedSignals === 0) { assert.equal(row.worstNormalizedError, null); assert.notEqual(row.outcome, 'matched'); }
    for (const comparison of row.comparisons) {
      for (const metric of Object.values(comparison.metrics.signals) as Array<any>) {
        if (metric.status !== 'compared') continue;
        assert(Number.isFinite(metric.absoluteError.max)); assert(Number.isFinite(metric.absoluteError.rms));
        assert(Object.hasOwn(metric.relativeError, 'max')); assert(Object.hasOwn(metric.relativeError, 'rms'));
      }
    }
  }
  const readme = await readFile(`${ROOT}/README.md`, 'utf8');
  assert(!readme.includes('static rules plus an ngspice-47 reference probe'));
  assert(!readme.includes('Bounds: ngspice 600 s'));
  assert(!readme.includes('## Transient fine-step reference'));
  assert(readme.includes('19 s execution deadline'));
  for (const row of report.fixtures.filter((r: { outcome: string }) => r.outcome !== 'matched')) assert(readme.includes(row.sourcePath));
});
