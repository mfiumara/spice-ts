import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { compareExecutions } from '../aggregate-report.js';
import { hasControlBlock, runControlReference } from '../corpus/corpus-f/control-vectors.js';
import { normalizedSignalErrors, pairedReferenceSeries, MATCH_THRESHOLD, scoredPlotTypes, outcome, corpusFPlotType } from '../corpus/corpus-f/lib.js';
import { analysisType, type ClassicCircuit, type EngineExecution } from '../corpus/classic/report.js';
import { PACKED_SAMPLES, packEncoded, lazyExecution, compareInBatches, type PackedExecution } from '../corpus/corpus-f/packed.js';
import { runNgspicePacked } from '../corpus/corpus-f/outcomes.js';
import type { CorpusFCircuit } from '../corpus/corpus-f/ingest.js';
import { packedControlReference } from './packed-control.js';


export const ROOT = 'benchmarks/plot-identity-970';
export const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e', 'xyce-spice3', 'corpus-d-spice3', 'corpus-e-spice3', 'corpus-f', 'corpus-g', 'corpus-h', 'corpus-i', 'corpus-j', 'corpus-k'];
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export async function catalogue() {
  const rows = [];
  for (const corpus of CORPORA) {
    const manifest = JSON.parse(await readFile(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8'));
    for (const circuit of manifest.circuits) {
      const absent = !circuit.localPath;
      const localPath = circuit.localPath ?? circuit.originalLocalPath ?? circuit.original?.localPath;
      const sha256 = circuit.sha256 ?? circuit.originalSha256 ?? circuit.original?.sha256;
      const input = await readFile(localPath);
      assert.equal(hash(input), sha256);
      const control = !absent && hasControlBlock(input.toString('utf8'));
      rows.push({ key: `${corpus}/${circuit.id}`, corpus, circuit: { ...circuit, localPath, sha256, analyses: control ? scoredPlotTypes(circuit) : circuit.analyses, unmappedAnalyses: circuit.unmappedAnalyses ?? [] } as ClassicCircuit & { unmappedAnalyses: string[] }, control, absentReason: absent ? `unsupported translation; no runnable translated deck: ${circuit.translation.reasons.join('; ')}` : null });
    }
  }
  assert.equal(rows.filter(row => row.corpus !== 'corpus-k').length, 700);
  // The task's substring census (248) includes classic/resistor-noise's
  // commented `*.control`. The real control-block predicate finds 247.
  assert.equal(rows.filter(row => row.control).length, 247);
  assert.equal(rows.length, 720);
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  return rows;
}
export type Raw = { packed?: false; beforeEngine: EngineExecution; afterEngine: EngineExecution; beforeReference: EngineExecution; afterReference: EngineExecution }
  | { packed: true; beforeEngine: PackedExecution; afterEngine: PackedExecution; beforeReference: PackedExecution; afterReference: PackedExecution };
export function metricDigest(comparisons: ReturnType<typeof compareExecutions>) {
  return hash(JSON.stringify(comparisons.map(c => ({ analysis: c.analysis, signals: c.signals, grid: c.metrics.grid, metrics: c.metrics.signals, linearGrid: c.linearMetrics.grid, linearMetrics: c.linearMetrics.signals }))));
}
export function summarize(comparisons: ReturnType<typeof compareExecutions>, own: EngineExecution, reference: EngineExecution, normalization = normalizedSignalErrors(comparisons, pairedReferenceSeries(own, reference))) {
  const { errors, missing } = normalization;
  const normalized = errors.length ? Math.max(...errors.map(error => error.normalized)) : null;
  const paired = comparisons.filter(c => !c.unmatched);
  return {
    engineStatus: own.status, referenceStatus: reference.status,
    alignedPoints: paired.reduce((n, c) => n + c.metrics.grid.alignedPoints, 0),
    excludedPoints: comparisons.reduce((n, c) => n + c.metrics.grid.excludedOutOfRange, 0),
    normalizedMismatch: normalized, plotsPaired: paired.length,
    plotsUnmatched: comparisons.filter(c => c.unmatched).length,
    groupsUnmatched: comparisons.reduce((n, c) => n + (c.metrics.sweepGroups?.filter(g => g.unmatched).length ?? 0), 0),
    missing, matched: outcome({ ngspice: reference.status, spiceTs: own.status, comparedAnalyses: comparisons.length, spiceTsAnalyses: new Set(own.analyses.map(a => a.type)).size, worstNormalized: normalized, missingSignals: missing }) === 'matched',
    signalErrors: errors,
    ordinalAligned: comparisons.some(c => c.metrics.sweepAlignment === 'reset-ordinal'),
    // Identity labels alone are not a numeric delta; all grid/signal metrics are.
    metricSha256: metricDigest(comparisons),
  };
}
export function bucket(before: ReturnType<typeof summarize>, after: ReturnType<typeof summarize>) {
  if (before.normalizedMismatch === null && after.normalizedMismatch === null) return 'not-comparable';
  const numeric = ({ ordinalAligned: _tag, ...rest }: ReturnType<typeof summarize>) => rest;
  if (JSON.stringify(numeric(before)) === JSON.stringify(numeric(after))) return 'unchanged';
  if (!before.matched && after.matched) return 'changed-improved';
  if (before.matched && !after.matched) return 'changed-regressed';
  return 'changed-neutral';
}
async function evaluate(index: number) {
  // The parent validates the complete catalogue once; children recheck their
  // own bytes instead of rereading all 720 decks for each serial replay.
  const entry: Awaited<ReturnType<typeof catalogue>>[number] = process.argv[4] ? JSON.parse(process.argv[4]) : (await catalogue())[index];
  assert.ok(entry);
  assert.equal(hash(await readFile(entry.circuit.localPath)), entry.circuit.sha256);
  if (entry.absentReason) {
    await writeFile(`${ROOT}/raw/${index}.json`, JSON.stringify({ key: entry.key, corpus: entry.corpus, control: entry.control, localPath: entry.circuit.localPath, inputSha256: entry.circuit.sha256, bucket: 'not-comparable', reason: entry.absentReason, before: null, after: null, tags: [] }) + '\n');
    return;
  }
  const rawPath = `${ROOT}/raw/${index}.v8.gz`;
  let raw: Raw;
  let source = 'saved-receipt-replay';
  try { raw = deserialize(gunzipSync(await readFile(rawPath))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (process.env.AUDIT_REPLAY_ONLY === '1') throw new Error(`missing raw replay receipt: ${entry.key}`);
    if (entry.corpus === 'corpus-j' && entry.circuit.id === 'j-14') {
      raw = JSON.parse(gunzipSync(await readFile('benchmarks/plot-970/j14-raw.json.gz')).toString());
      source = 'parent-j14-raw-replay (core cc1896298a1e7e884f1989593228a1bc2b97419f)';
    } else {
      source = 'single-live-simulation-shared-by-both-adapters';
      const old = await import('./.snapshot/base/benchmarks/corpus/corpus-f/plot-adapter.js');
      const current = await import('./.snapshot/current-plot-adapter.js');
      const native = await import('./.snapshot/current-adapter.js');
      const input = await readFile(entry.circuit.localPath);
      if (process.env.AUDIT_PACKED === '1') {
        // Uniform packed encoding, not circuit tuning.
        // Both adapters still map the one memoized live simulation result.
        const beforeEngine = packEncoded(await old.runCorpusFSpiceTs(input, entry.circuit, PACKED_SAMPLES));
        const afterEngine = packEncoded(await current.runCorpusFSpiceTs(input, entry.circuit, PACKED_SAMPLES));
        const names = new Set([...beforeEngine.analyses, ...afterEngine.analyses].flatMap(a => Object.keys(a.signals).map(signal => `${a.type}:${signal}`)));
        const afterReference = entry.control
          ? await packedControlReference(input, entry.circuit, (plotName, signal) => names.has(`${corpusFPlotType(plotName, analysisType)}:${signal}`))
          : (await runNgspicePacked(input, entry.circuit as unknown as CorpusFCircuit, (type, signal) => names.has(`${type}:${signal}`))).execution;
        const beforeReference = entry.control ? { ...afterReference, analyses: afterReference.analyses.filter(a => a.plotId === `${a.type}1`).map(a => ({ type: a.type, plotName: a.plotName, grid: a.grid, signals: a.signals })) } : afterReference;
        const memo = await import('./.snapshot/core.js');
        assert.ok(memo.calls <= 1, 'both packed adapters must reuse one simulation Promise');
        raw = { packed: true, beforeEngine, afterEngine, beforeReference, afterReference };
      } else {
        // Both adapter modules import the same memoizing core shim. simulate is called once.
        const beforeEngine = await old.runCorpusFSpiceTs(input, entry.circuit);
        const afterEngine = await current.runCorpusFSpiceTs(input, entry.circuit);
        const memo = await import('./.snapshot/core.js');
        assert.ok(memo.calls <= 1, 'both adapters must reuse exactly one simulation Promise');
        // No numeric comparison can exist if both mappings fail. Do not spend a
        // native run on that case; publish the absence, not a guessed reference.
        const afterReference: EngineExecution = beforeEngine.status !== 'success' && afterEngine.status !== 'success'
          ? { status: 'unsupported', convergence: 'not-run', analyses: [], error: 'reference not run: neither adapter produced a successful spice-ts execution' }
          : entry.control ? (await runControlReference(input, entry.circuit)).execution : await native.runNativeNgspice(input, entry.circuit);
        const beforeReference = entry.control ? { ...afterReference, analyses: afterReference.analyses.filter(a => a.plotId === `${a.type}1`).map(a => ({ type: a.type, plotName: a.plotName, series: { grid: a.series.grid, signals: a.series.signals } })) } : afterReference;
        raw = { beforeEngine, afterEngine, beforeReference, afterReference };
      }
    }
    await writeFile(rawPath, gzipSync(serialize(raw)));
  }
  const baseline = await import('./.snapshot/base/benchmarks/aggregate-report.js');
  const oldLib = await import('./.snapshot/base/benchmarks/corpus/corpus-f/lib.js');
  const oldPacked = await import('./.snapshot/base/benchmarks/corpus/corpus-f/packed.js');
  const beforeOwn = raw.packed ? lazyExecution(raw.beforeEngine) : raw.beforeEngine;
  const afterOwn = raw.packed ? lazyExecution(raw.afterEngine) : raw.afterEngine;
  const beforeReference = raw.packed ? lazyExecution(raw.beforeReference) : raw.beforeReference;
  const afterReference = raw.packed ? lazyExecution(raw.afterReference) : raw.afterReference;
  const beforeComparisons = raw.beforeEngine.status === 'success' && raw.beforeReference.status === 'success' ? raw.packed ? oldPacked.compareInBatches(raw.beforeEngine, raw.beforeReference, 1) : baseline.compareExecutions(beforeOwn, beforeReference) : [];
  const afterComparisons = raw.afterEngine.status === 'success' && raw.afterReference.status === 'success' ? raw.packed ? compareInBatches(raw.afterEngine, raw.afterReference, 1) : compareExecutions(afterOwn, afterReference) : [];
  // Use the exact baseline normalizer as well as the exact baseline comparison.
  const oldErrors = oldLib.normalizedSignalErrors(beforeComparisons, oldLib.pairedReferenceSeries(beforeOwn, beforeReference));
  const before = summarize(beforeComparisons, beforeOwn, beforeReference, oldErrors);
  before.normalizedMismatch = oldErrors.errors.length ? Math.max(...oldErrors.errors.map((e: { normalized: number }) => e.normalized)) : null;
  before.missing = oldErrors.missing;
  before.signalErrors = oldErrors.errors;
  before.matched = oldLib.outcome({ ngspice: raw.beforeReference.status, spiceTs: raw.beforeEngine.status, comparedAnalyses: beforeComparisons.length, spiceTsAnalyses: new Set(raw.beforeEngine.analyses.map(a => a.type)).size, worstNormalized: before.normalizedMismatch, missingSignals: before.missing }) === 'matched';
  const after = summarize(afterComparisons, afterOwn, afterReference);
  const classification = bucket(before, after);
  const reason = classification === 'not-comparable' ? [raw.beforeEngine.error, raw.afterEngine.error, raw.afterReference.error, 'no aligned scored signals on either side'].filter(Boolean).join(' / ') : null;
  const direction = before.normalizedMismatch === null || after.normalizedMismatch === null ? 'coverage-change' : after.normalizedMismatch < before.normalizedMismatch ? 'lower-error' : after.normalizedMismatch > before.normalizedMismatch ? 'higher-error' : 'same-error';
  const row = { ...entry, circuit: undefined, localPath: entry.circuit.localPath, inputSha256: entry.circuit.sha256, engineCoreSha: entry.key === 'corpus-j/j-14' ? 'cc1896298a1e7e884f1989593228a1bc2b97419f' : process.env.AUDIT_CORE_SHA, source, encoding: raw.packed ? 'packed' : 'object', rawSha256: hash(await readFile(rawPath)), before, after, bucket: classification, reason, direction, tags: after.ordinalAligned ? ['ordinal-aligned'] : [], beforeComparisons, afterComparisons };
  await writeFile(`${ROOT}/raw/${index}.json`, JSON.stringify(row) + '\n');
  console.log(`${index} ${entry.key}: ${classification}`);
}
async function main() {
  await mkdir(`${ROOT}/raw`, { recursive: true });
  if (process.argv[2] === '--child') return evaluate(Number(process.argv[3]));
  const entries = await catalogue();
  for (let index = 0; index < entries.length; index += 1) {
    if (process.argv.includes('--replay')) {
      try { await readFile(`${ROOT}/raw/${index}.v8.gz`); } catch { continue; }
    } else {
      try { await readFile(`${ROOT}/raw/${index}.json`); continue; } catch { /* resume */ }
    }
    let timedOut = false;
    let diagnostic = '';
    const deadline = Number(process.env.AUDIT_CHILD_MS ?? 180_000);
    assert.ok(Number.isFinite(deadline) && deadline > 0);
    const status = await new Promise<number | null>((done, reject) => {
      const child = spawn(process.execPath, [`--max-old-space-size=${Number(process.env.AUDIT_HEAP_MB ?? 4096)}`, ...process.execArgv, fileURLToPath(import.meta.url), '--child', String(index), JSON.stringify(entries[index])], { detached: true, stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, ...(process.argv.includes('--replay') ? { AUDIT_REPLAY_ONLY: '1' } : {}) } });
      child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000); process.stderr.write(chunk); });
      const timer = setTimeout(() => { timedOut = true; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* exited */ } } }, deadline);
      child.on('error', reject);
      child.on('close', code => { clearTimeout(timer); done(code); });
    });
    if (status !== 0) {
      // Execution bound / resource failure is visible, never inferred to be unchanged.
      const entry = entries[index];
      await writeFile(`${ROOT}/raw/${index}.json`, JSON.stringify({ key: entry.key, corpus: entry.corpus, control: entry.control, localPath: entry.circuit.localPath, inputSha256: entry.circuit.sha256, bucket: 'not-comparable', reason: `audit child exited ${status}; timedOut=${timedOut}; ${deadline} ms process-group / ${process.env.AUDIT_HEAP_MB ?? 4096} MiB heap bound; no comparison receipt; ${diagnostic}`, before: null, after: null, tags: [] }) + '\n');
    }
  }
  const rows = await Promise.all(entries.map((_, index) => readFile(`${ROOT}/raw/${index}.json`, 'utf8').then(JSON.parse)));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
  const report = { baseSha: 'bd4ac625f15e344043a7431b24f64828966e2d41', implementationHead: 'd5aa4c8c064a269e8e32bf74f1be12d9f6fc3d9a', core: process.env.AUDIT_CORE_SHA, node: process.version, threshold: MATCH_THRESHOLD, originalCount: 700, supplementalK: 20, controlCount: 247, counts, rows };
  await writeFile(`${ROOT}/inventory.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(counts));
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
