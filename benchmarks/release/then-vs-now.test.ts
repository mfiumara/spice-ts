import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { median, summarize, renderHeadline, POLICY } from './then-vs-now.js';
import type { EngineExecution } from '../corpus/classic/report.js';

test('release plan avoids a peer-only UI major without running changeset version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-plan-'));
  try {
    const output = join(directory, 'status.json');
    const result = spawnSync('pnpm', ['changeset', 'status', '--output', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(readFileSync(output, 'utf8'));
    for (const name of ['@spice-ts/core', '@spice-ts/mcp']) {
      const current = JSON.parse(readFileSync(`packages/${name.split('/')[1]}/package.json`, 'utf8'));
      const release = plan.releases.find((entry: { name: string }) => entry.name === name);
      if (current.version === '0.3.0' && release) assert.equal(release.newVersion, '0.4.0');
    }
    const ui = plan.releases.find((entry: { name: string }) => entry.name === '@spice-ts/ui');
    // After Mattia versions the release, there may be no pending UI release.
    if (ui) assert.ok(['patch', 'minor'].includes(ui.type), JSON.stringify(ui));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function execution(value: number): EngineExecution {
  return { status: 'success', convergence: 'converged', analyses: [{ type: 'op', plotName: 'Operating Point',
    series: { grid: [0], signals: { 'v(out)': [{ re: value, im: 0 }] } } }] };
}

test('medians keep empty samples unavailable', () => {
  assert.equal(median([]), null);
  assert.equal(median([90, 10, 20]), 20);
  assert.equal(median([2, 4]), 3);
});

test('one global matching policy rejects missing plots, failures and large errors', () => {
  assert.equal(summarize(execution(1), execution(1)).matched, true);
  assert.equal(summarize(execution(1 + POLICY.relativeMax / 2), execution(1)).matched, true);
  assert.equal(summarize(execution(1.1), execution(1)).matched, false);
  assert.equal(summarize(execution(0.5e-6), execution(0)).matched, true);
  assert.equal(summarize(execution(2e-6), execution(0)).matched, false);
  const missing: EngineExecution = { status: 'unsupported', convergence: 'not-run', analyses: [] };
  assert.equal(summarize(missing, execution(1)).matched, false);
  assert.equal(summarize(execution(1), missing).matched, false);
  assert.equal(summarize(execution(Number.NaN), execution(1)).matched, false);
});

test('voltage headline does not label pole frequencies or noise densities as volts', () => {
  const summary = summarize(execution(3), execution(1));
  const signals = [...summary.signals, ...summary.signals.map(signal => ({ ...signal, key: 'pz:1:v(zero(1))',
    ...(signal.status === 'compared' ? { absoluteError: { max: 9000, rms: 9000 } } : {}) }))];
  const run = { ...summary, signals, runtimeMs: 1 };
  const text = renderHeadline({ environment: {}, rows: [{ name: 'test', sha256: '', baseline: run, candidate: run,
    ngspice: { status: 'success', runtimeMs: 1 } }], scaling: [] });
  assert.match(text, /absolute max \(V\) \| 2\.000000e\+0/);
});
