import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runControlReference } from './corpus/corpus-f/control-vectors.js';
import { runNativeSpiceTs } from './corpus/classic/report.js';
import { compareExecutions } from './aggregate-report.js';
import type { ClassicCircuit } from './corpus/classic/report.js';

test('control export and native adapter retain all IDs and pair reordered plots', { skip: spawnSync('ngspice', ['--version']).status !== 0 || !existsSync('packages/core/dist/index.js') }, async () => {
  const input = Buffer.from('repeated DC\nV1 in 0 0\nR1 in 0 1k\n.control\ndc V1 0 1 0.5\ndc V1 0 2 1\n.endc\n.end\n');
  const circuit = { analyses: ['dc'], localPath: 'authored.cir' } as ClassicCircuit;
  const reference = await runControlReference(input, { ...circuit, unmappedAnalyses: [] });
  const own = await runNativeSpiceTs(input, circuit, { parseFirst: false });
  assert.equal(reference.status, 'success');
  assert.equal(own.status, 'success');
  assert.deepEqual(own.analyses.map(a => a.plotId), ['dc1', 'dc2']);
  assert.deepEqual(reference.execution.analyses.map(a => a.plotId), ['dc1', 'dc2']);
  const comparisons = compareExecutions(own, { ...reference.execution, analyses: [...reference.execution.analyses].reverse() });
  assert.equal(comparisons.length, 2);
  for (const comparison of comparisons) {
    assert.equal(comparison.unmatched, undefined);
    const metric = comparison.metrics.signals['v(in)'];
    assert.equal(metric.status, 'compared');
    if (metric.status === 'compared') assert.equal(metric.absoluteError.max, 0);
  }
});
