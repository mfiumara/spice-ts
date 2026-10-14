import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairPlots } from './plot-pairing.js';
import { runNativeSpiceTs, type EngineAnalysis, type EngineExecution, type ClassicCircuit } from './corpus/classic/report.js';
import { compareExecutions } from './aggregate-report.js';
import { compareInBatches, packExecution } from './corpus/corpus-f/packed.js';

const plot = (type: EngineAnalysis['type'], value: number, plotId?: string): EngineAnalysis => ({
  type, plotName: 'nonunique descriptive name', ...(plotId ? { plotId } : {}),
  series: { grid: [0], signals: { 'v(out)': [{ re: value, im: 0 }] } },
});
const execution = (analyses: EngineAnalysis[]): EngineExecution => ({ status: 'success', convergence: 'converged', analyses });

test('interleaved README source ranks map to reversed same-type raw occurrences', () => {
  const left = [plot('ac', 10, 'dot:ac:2'), plot('op', 1, 'dot:op:3'), plot('dc', 0, 'dot:dc:2'), plot('ac', 30, 'dot:ac:1'), plot('op', 2, 'dot:op:2'), plot('dc', 2, 'dot:dc:1'), plot('op', 3, 'dot:op:1')];
  const right = [plot('ac', 30), plot('ac', 10), plot('dc', 2), plot('dc', 0), plot('op', 3), plot('op', 2), plot('op', 1)];
  assert.deepEqual(pairPlots(left, right).map(pair => right.indexOf(pair.right!)), [1, 6, 3, 0, 5, 2, 4]);
});

test('identical duplicate cards pair one-to-one without using Plotname', () => {
  const right = [plot('op', 1), plot('op', 1), plot('op', 1)];
  const left = [3, 2, 1].map(n => plot('op', 1, `dot:op:${n}`));
  assert.deepEqual(pairPlots(left, right).map(pair => right.indexOf(pair.right!)), [2, 1, 0]);
});

test('unsupported, absent and control-ID targets stay unmatched', () => {
  for (const [left, right] of [
    [[plot('noise', 1, 'dot:noise:1')], [plot('noise', 1)]],
    [[plot('dc', 1, 'dot:dc:2')], [plot('dc', 1)]],
    [[plot('dc', 1, 'dot:dc:1')], [plot('dc', 1, 'dc1')]],
  ]) {
    assert.deepEqual(pairPlots(left, right), [{ left: left[0], right: undefined }, { right: right[0] }]);
  }
});

test('packed singleton batches preserve resolved mixed-type occurrence identity', () => {
  const own = execution([plot('dc', 20, 'dot:dc:2'), plot('op', 3, 'dot:op:1'), plot('dc', 10, 'dot:dc:1')]);
  const reference = execution([plot('dc', 10), plot('dc', 20), plot('op', 3)]);
  const comparisons = compareExecutions(own, reference);
  assert.ok(comparisons.every(c => !c.unmatched));
  assert.deepEqual(compareInBatches(packExecution(own), packExecution(reference), 1), comparisons);
});

test('adapter retains distinct 11-point first and 3-point second DC cards with OP duplicates', async () => {
  const input = Buffer.from('diode shape probe\nV1 out 0 0\nR1 out 0 1k\n.op\n.dc V1 0 10 1\n.dc V1 2 4 1\n.op\n.end\n');
  const circuit = { analyses: ['op', 'dc'] } as ClassicCircuit;
  const own = await runNativeSpiceTs(input, circuit);
  assert.equal(own.status, 'success');
  assert.deepEqual(own.analyses.map(a => [a.plotId, a.series.grid.length]), [['dot:op:2', 1], ['dot:dc:2', 11], ['dot:dc:1', 3], ['dot:op:1', 1]]);
  const reference = execution([own.analyses[2], own.analyses[1], own.analyses[3], own.analyses[0]].map(({ plotId: _id, ...a }) => a));
  assert.deepEqual(pairPlots(own.analyses, reference.analyses).map(p => p.right?.series.grid.length), [1, 11, 3, 1]);
});

test('single analysis, step and control continue to use legacy identities', async () => {
  for (const [cards, expected] of [
    ['.op', [undefined]],
    ['.step param resistance list 1000 2000\n.op', [undefined]],
    ['.control\nop\nop\n.endc', ['op1', 'op2']],
  ] as const) {
    const own = await runNativeSpiceTs(Buffer.from(`legacy\nV1 out 0 1\nR1 out 0 1k\n${cards}\n.end\n`), { analyses: ['op'] } as ClassicCircuit);
    assert.equal(own.status, 'success');
    assert.deepEqual(own.analyses.map(a => a.plotId), expected);
  }
});
