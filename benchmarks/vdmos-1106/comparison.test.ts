import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { reduceRow, type Circuit, type Manifest } from '../corpus/corpus-j/parity.js';
import { compareInBatches, unpackExecution, type PackedExecution } from '../corpus/corpus-f/packed.js';
import { compareExecutions } from '../aggregate-report.js';
import { type ReferenceRun } from '../corpus/corpus-f/outcomes.js';
import { declaredSecondaryGrid } from '../sweep-coordinates.js';
import { pairPlots } from '../plot-pairing.js';

const root = 'benchmarks/vdmos-1106';
const manifest = JSON.parse(readFileSync('benchmarks/corpus/corpus-n/manifest.json', 'utf8')) as Manifest;
function captured(id: string, engine: string): ReferenceRun<PackedExecution> {
  const run = JSON.parse(gunzipSync(readFileSync(`${root}/before-${id}-${engine}.json.gz`)).toString());
  for (const plot of run.execution.analyses) {
    plot.grid = Float64Array.from(plot.grid);
    if (plot.secondaryGrid) plot.secondaryGrid = Float64Array.from(plot.secondaryGrid);
    for (const signal of Object.values(plot.signals) as Array<{ re: number[]; im?: number[] }>) {
      Object.assign(signal, { re: Float64Array.from(signal.re), ...(signal.im ? { im: Float64Array.from(signal.im) } : {}) });
    }
  }
  return run;
}
for (const [id, count] of [['n-8', 10], ['n-9', 10], ['n-10', 8], ['n-11', 8], ['n-12', 10], ['n-13', 8]] as const) {
  test(`${id}: real captured exports compare common signals and retain missing plots`, () => {
    const circuit = manifest.circuits.find(c => c.id === id)! as Circuit;
    const ng = captured(id, 'ngspice');
    const own = captured(id, 'spiceTs');
    const text = readFileSync(circuit.localPath, 'utf8');
    for (const plot of ng.execution.analyses) {
      if (plot.type === 'dc') {
        const secondary = declaredSecondaryGrid(text, plot.plotName, Array.from(plot.grid), 'batch-dot');
        assert.ok(secondary, 'batch raw dot-card provenance must retain secondary coordinates');
        plot.secondaryGrid = Float64Array.from(secondary);
      }
    }
    const row = reduceRow(circuit, ng, own.execution);
    assert.equal(row.comparedSignals, count);
    assert.notEqual(row.worstNormalizedError, null);
    assert.deepEqual(compareInBatches(own.execution, ng.execution, 1), compareExecutions(unpackExecution(own.execution), unpackExecution(ng.execution)));
    if (id === 'n-12') {
      assert.equal(row.comparisons.length, 2);
      assert.equal(row.comparisons[1].unmatched, 'ngspice');
      assert.equal(row.comparisons[1].plot?.spiceTs, 'dc2');
      assert.equal(row.outcome, 'mismatch');
    }
  });
}
test('explicit control identities never pair with different explicit IDs', () => {
  const left = [{ type: 'dc' as const, plotName: 'DC transfer characteristic', plotId: 'dc6' }];
  const right = [{ type: 'dc' as const, plotName: 'DC transfer characteristic', plotId: 'dc1' }];
  assert.equal(pairPlots(left, right).filter(p => p.left && p.right).length, 0);
});
test('multiple descriptive raw plots and later control IDs are ambiguous', () => {
  const raw = { type: 'dc' as const, plotName: 'DC transfer characteristic' };
  for (const [left, right] of [
    [[{ ...raw, plotId: 'dc1' }], [raw, { ...raw }]],
    [[{ ...raw, plotId: 'dc2' }], [raw]],
  ]) assert.equal(pairPlots(left, right).filter(p => p.left && p.right).length, 0);
});
test('batch provenance retains default control-only behavior and dynamic guards', () => {
  const command = 'dc V1 0 1 1 V2 0 1 1';
  assert.deepEqual(declaredSecondaryGrid(`title\n.control\n${command}\n.endc`, 'dc1', [0, 1, 0, 1], 'batch-dot'), [0, 0, 1, 1]);
  for (const dynamic of ['repeat 2', 'source other.cir', 'reset', 'if 1']) {
    assert.equal(declaredSecondaryGrid(`title\n.${command}\n.control\n${dynamic}\n.endc`, 'DC transfer characteristic', [0, 1, 0, 1], 'batch-dot'), undefined);
  }
});
