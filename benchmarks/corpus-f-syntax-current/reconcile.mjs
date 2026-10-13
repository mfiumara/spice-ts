import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAIN_SHA = 'f0446a68f317b9fd558d1a14b540a0e4f1063e18';
export const BUCKET = 'parse: other unsupported syntax';
const ROOT = 'benchmarks/corpus-f-syntax-current';
const CORPUS = 'benchmarks/corpus/corpus-f';
const LIMITS = { parseMs: 8000, simulateMs: 12000, totalMs: 600000 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** SelectionRow = unchanged manifest identity + historical EngineOutcome evidence.
 * Probe = status, firstError (on failure), child exit/signal, wall time, analysis sizes.
 * ReceiptRow = SelectionRow + separate parse/simulation probes; never fresh parity.
 */
export function select(historical, manifest) {
  const rows = historical.fixtures.filter(row => row.gapBucket === BUCKET);
  assert.equal(rows.length, 59);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.equal(rows.filter(row => row.ngspice.status === 'success').length, 54);
  return rows.map(row => {
    const matches = manifest.circuits.filter(circuit => circuit.id === row.id);
    assert.equal(matches.length, 1, row.id);
    const circuit = matches[0];
    assert.equal(circuit.sha256, row.sha256, row.id);
    assert.equal(circuit.sourcePath, row.sourcePath, row.id);
    return { ...circuit, historical: { ngspice: row.ngspice, spiceTs: row.spiceTs, outcome: row.outcome, gapBucket: row.gapBucket } };
  });
}

export function validateReceipt(receipt, selected) {
  assert.equal(receipt.simulatorSha, MAIN_SHA);
  assert.deepEqual(receipt.limits, LIMITS);
  assert.deepEqual(receipt.fixtures.map(row => row.id), selected.map(row => row.id));
  for (const [index, row] of receipt.fixtures.entries()) {
    for (const key of Object.keys(selected[index])) assert.deepEqual(row[key], selected[index][key], `${row.id}: ${key}`);
    assert.equal(row.reference.provenance, 'historical-only');
    assert.equal(row.reference.freshStatus, 'not-run');
    for (const key of ['comparedAnalyses', 'comparedSignals', 'worstNormalizedError']) assert.equal(row[key], null);
    assert.ok(['spice-ts-loss', 'not-compared', 'timeout', 'not-run'].includes(row.currentOutcome));
    assert.ok(['success', 'unsupported', 'failed', 'timeout', 'not-run'].includes(row.parse.status));
    assert.ok(['success', 'unsupported', 'failed', 'timeout', 'not-run'].includes(row.simulation.status));
    if (row.parse.status !== 'success') assert.equal(row.simulation.status, 'not-run');
    for (const probe of [row.parse, row.simulation]) {
      if (['unsupported', 'failed', 'timeout'].includes(probe.status)) assert.ok(probe.firstError);
      if (probe.status === 'not-run') assert.ok(probe.reason);
    }
    const effective = row.parse.status === 'success' ? row.simulation : row.parse;
    const outcome = effective.status === 'success' ? 'not-compared' : effective.status === 'timeout' ? 'timeout' : effective.status === 'not-run' ? 'not-run' : 'spice-ts-loss';
    assert.equal(row.currentOutcome, outcome);
  }
}

function pinned(path) {
  const run = spawnSync('git', ['show', `${MAIN_SHA}:${path}`], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  return run.stdout;
}

export function bucket(row) {
  const probe = row.parse.status === 'success' ? row.simulation : row.parse;
  if (probe.status === 'success') return 'native success, parity not computed';
  if (probe.status === 'timeout') return 'timeout';
  if (probe.status === 'not-run') return 'total budget exhausted';
  const text = probe.firstError;
  const model = /XSPICE code model '([^']+)'/.exec(text);
  if (model) return `XSPICE code model: ${model[1]}`;
  if (/String-valued .param/.test(text)) return 'string/vector numparam';
  if (/references unknown model/.test(text)) return 'model resolution/instance forms';
  if (/maxord=3/.test(text)) return 'Gear integration order 3';
  if (/v\(\) takes one or two node names/.test(text)) return 'numparam function/node substitution';
  if (/Port type d is invalid|Bad real value/.test(text)) return 'XSPICE invalid-input validation';
  if (/Expected numeric value, got/.test(text)) return 'numeric-expression preprocessing';
  if (/PTF/.test(text)) return 'BJT excess phase PTF';
  if (/VBIC|LEVEL=4/.test(text)) return 'VBIC model/instance form';
  if (/self.heating|thermal|SHMOD/i.test(text)) return 'thermal/self-heating';
  if (/control|vector|plot|function/i.test(text)) return 'control/vector/function execution';
  if (/converg|singular|timestep/i.test(text)) return 'solver/convergence';
  return text;
}

async function child(mode, circuit) {
  const bytes = readFileSync(circuit.localPath);
  assert.equal(hash(bytes), circuit.sha256);
  if (mode === 'parse') {
    try {
      const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
      core.parse(bytes.toString('utf8'));
      return { status: 'success' };
    } catch (error) {
      const firstError = String(error.message ?? error);
      return { status: /unsupported|unknown|parse|expected|invalid/i.test(firstError) ? 'unsupported' : 'failed', firstError };
    }
  }
  const { runCorpusFSpiceTs } = await import('../corpus/corpus-f/plot-adapter.ts');
  const { PACKED_SAMPLES } = await import('../corpus/corpus-f/packed.ts');
  const { scoredPlotTypes } = await import('../corpus/corpus-f/lib.ts');
  const result = await runCorpusFSpiceTs(bytes, { ...circuit, category: 'corpus-f', analyses: scoredPlotTypes(circuit) }, PACKED_SAMPLES);
  return {
    status: result.status,
    convergence: result.convergence,
    firstError: result.error ?? null,
    analyses: result.analyses.map(analysis => ({ type: analysis.type, points: analysis.grid?.length ?? analysis.series?.grid?.length ?? 0, signals: Object.keys(analysis.signals ?? analysis.series?.signals ?? {}).length })),
  };
}

export function bounded(command, args, timeout) {
  const start = performance.now();
  const run = spawnSync(command, args, { encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024 });
  const execution = { exitCode: run.status, signal: run.signal, elapsedMs: performance.now() - start, stderr: run.stderr ?? '', childCapMs: timeout };
  if (run.error?.code === 'ETIMEDOUT') return { ...execution, status: 'timeout', firstError: `child exceeded ${timeout} ms cap` };
  const marker = (run.stdout ?? '').split('\n').findLast(line => line.startsWith('RECEIPT '));
  if (run.status !== 0 || !marker) return { ...execution, status: 'failed', firstError: `child failed: ${run.error?.message ?? run.stderr ?? run.signal}` };
  try {
    const result = JSON.parse(marker.slice(8));
    assert.ok(['success', 'failed', 'unsupported'].includes(result.status));
    return { ...execution, ...result };
  } catch (error) {
    return { ...execution, status: 'failed', firstError: `invalid child receipt: ${error.message}` };
  }
}

function probe(mode, circuit, timeout) {
  return bounded(process.execPath, ['--import', 'tsx', '--max-old-space-size=512', resolve(ROOT, 'reconcile.mjs'), '--child', mode, JSON.stringify(circuit)], timeout);
}

export function nextCap(phaseMs, elapsedMs) {
  return Math.max(0, Math.min(phaseMs, Math.floor(LIMITS.totalMs - elapsedMs)));
}

async function main() {
  if (process.argv[2] === '--child') {
    console.log(`RECEIPT ${JSON.stringify(await child(process.argv[3], JSON.parse(process.argv[4])))}`);
    return;
  }
  const historicBytes = pinned(`${CORPUS}/outcomes.json`);
  const manifestBytes = pinned(`${CORPUS}/manifest.json`);
  const manifest = JSON.parse(manifestBytes);
  const selected = select(JSON.parse(historicBytes), manifest);
  for (const circuit of selected) assert.equal(hash(readFileSync(circuit.localPath)), circuit.sha256);
  assert.equal(hash(readFileSync(manifest.source.licenseTextLocalPath)), manifest.source.licenseTextSha256);
  if (process.argv[2] === '--check') {
    validateReceipt(JSON.parse(readFileSync(`${ROOT}/receipt.json`)), selected);
    console.log('validated 59 complete historical-only receipts');
    return;
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  // Diagnosis-only branch commits may differ, but production bytes must equal the frozen main.
  const diff = spawnSync('git', ['diff', MAIN_SHA, '--', 'packages/core'], { encoding: 'utf8' });
  assert.equal(diff.status, 0);
  assert.equal(diff.stdout, '');
  const receipt = {
    schema: 'corpus-f-syntax-current/v1', simulatorSha: MAIN_SHA, runnerHeadAtExecution: head,
    source: manifest.source, historicalTools: JSON.parse(historicBytes).tools,
    outcomesSha256: hash(historicBytes), manifestSha256: hash(manifestBytes),
    selectionPredicate: `fixture.gapBucket === ${JSON.stringify(BUCKET)}`, limits: LIMITS,
    environment: { node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    policy: { fixtureAdaptation: 'none', freshReference: 'not run', metric: 'not computed; all comparisons null', tuning: false, simulation: 'only after native parse succeeds; existing corpus-f packed adapter' },
    fixtures: [],
  };
  const start = performance.now();
  for (const circuit of selected) {
    const budgetedProbe = mode => {
      // Compute once: timeout=0 disables spawnSync's bound rather than killing immediately.
      const cap = nextCap(mode === 'parse' ? LIMITS.parseMs : LIMITS.simulateMs, performance.now() - start);
      return cap > 0 ? probe(mode, circuit, cap) : { status: 'not-run', reason: 'total budget exhausted' };
    };
    const parse = budgetedProbe('parse');
    const simulation = parse.status !== 'success' ? { status: 'not-run', reason: 'parse did not succeed' } : budgetedProbe('simulate');
    const effective = parse.status === 'success' ? simulation : parse;
    const row = {
      ...circuit, parse, simulation,
      currentOutcome: effective.status === 'success' ? 'not-compared' : effective.status === 'timeout' ? 'timeout' : effective.status === 'not-run' ? 'not-run' : 'spice-ts-loss',
      reference: { provenance: 'historical-only', freshStatus: 'not-run' },
      comparedAnalyses: null, comparedSignals: null, worstNormalizedError: null,
    };
    row.currentBucket = bucket(row);
    receipt.fixtures.push(row);
    receipt.elapsedMs = performance.now() - start;
    writeFileSync(`${ROOT}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`${row.id}: parse=${parse.status}, simulate=${simulation.status}, ${row.currentBucket}`);
  }
  validateReceipt(receipt, selected);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
