import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { summarize, validate } from './metrics.mjs';
const load = () => readFileSync(new URL('./samples.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);

test('actual archive identity and cumulative budget match immutable run receipts', () => {
  const json = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
  const host = json('./host.json'), build = json('./build.json'), identity = json('./source-identity.json'), budget = json('./budget.json');
  assert.equal(host.baselineRevision, 'e1597e192c26a231dd576c668524d887b6e63844');
  assert.equal(build.baselineRevision, host.baselineRevision);
  assert.equal(identity.baselineRevision, host.baselineRevision);
  assert.equal(identity.solverIdentical, true);
  assert.equal(identity.allCoreSourceFilesIdentical, false, 'parser-only baseline drift must remain disclosed');
  assert(identity.differences.every(d => d.path.startsWith('packages/core/src/parser/') || d.path === 'packages/core/src/analysis/noise.test.ts'));
  const rows = load();
  assert.equal(budget.planned, rows.length);
  assert.equal(budget.allStartedProcessGroupsGone, true);
  assert.equal(budget.totalChildWallSeconds, rows.at(-1).cumulativeChildWallSeconds);
  assert(Math.abs(budget.totalChildWallSeconds - rows.reduce((s,r) => s+r.childWallMs,0)/1000) < 1e-9);
  assert(budget.totalChildWallSeconds < budget.limitSeconds);
});

test('fixed plan, bounded owned children and phase-file reconciliation', () => {
  const rows = load();
  validate(rows);
  assert.equal(rows.length, 72);
  for (const row of rows.filter(r => r.pid)) {
    const key = `${row.mode}-${row.circuit}-${row.size}-${row.repeat}-${row.variant}`;
    const file = new URL(`./logs/${key}.jsonl`, import.meta.url);
    let phases = [];
    try { phases = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    assert.deepEqual(row.phases, phases);
  }
});

test('diagnostic phase attribution reproduces raw CPU/wall without mixing control times', () => {
  const rows = load(), summary = summarize(rows);
  const warm50 = summary.groups.find(g => g.mode === 'isolate' && g.variant === 'diagnostic' && g.size === 50000 && g.phase === 'warm');
  const input = rows.filter(r => r.mode === 'isolate' && r.variant === 'diagnostic' && r.size === 50000).map(r => r.phases[1]);
  assert.equal(warm50.metrics.rowsCpuMs.median, input.map(p => p.regions.rowsCpuUs / 1000).sort((a,b) => a-b)[1]);
  assert(warm50.metrics.rowsCpuMs.median > warm50.metrics.triangularCpuMs.median);
  assert(warm50.metrics.rowsMs.median > warm50.metrics.triangularMs.median);
  assert(summary.groups.filter(g => g.variant !== 'diagnostic').every(g => !('rowsCpuMs' in g.metrics)));
  assert.equal(summary.isolatedBitIdenticalPairs, 18);
});

test('complete patterns and bits detect corruption; digest is not just the probe', () => {
  const rows = structuredClone(load());
  rows.find(r => r.mode === 'isolate' && r.variant === 'diagnostic').phases[0].factorSha256 = '0'.repeat(64);
  assert.throws(() => validate(rows), /factorSha256/);
  const controls = structuredClone(load());
  controls.find(r => r.mode === 'simulate' && r.variant === 'control' && r.status === 'ok').phases[0].outputSha256 = '0'.repeat(64);
  assert.throws(() => validate(controls), /outputSha256/);
});

test('CPU boundary/unit and call-count mutations fail validation', () => {
  for (const mutate of [p => { p.regions.rowsCpuUs = p.factorCpu.user + p.factorCpu.system + 1; }, p => { p.regions.calls++; }, p => { p.regions.triangularMs = -1; }]) {
    const rows = structuredClone(load());
    mutate(rows.find(r => r.variant === 'diagnostic').phases[0]);
    assert.throws(() => validate(rows));
  }
});

test('partial timeout phases retained, missing warm is not a zero timing', () => {
  const rows = structuredClone(load());
  const row = rows.find(r => r.mode === 'simulate' && r.status === 'ok');
  row.status = 'timeout'; row.exit = -9; row.phases = row.phases.slice(0,1);
  validate(rows);
  const summary = summarize(rows);
  const cold = summary.groups.find(g => g.mode === row.mode && g.variant === row.variant && g.circuit === row.circuit && g.size === row.size && g.phase === 'cold');
  const warm = summary.groups.find(g => g.mode === row.mode && g.variant === row.variant && g.circuit === row.circuit && g.size === row.size && g.phase === 'warm');
  assert.equal(cold.completed, 3);
  assert.equal(warm.completed, 2);
});
