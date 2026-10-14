import { readFile, writeFile } from 'node:fs/promises';
import { runControlReference, hasControlBlock } from '../corpus/corpus-f/control-vectors.js';
import { compareExecutions } from '../aggregate-report.js';
import { normalizedSignalErrors, pairedReferenceSeries } from '../corpus/corpus-f/lib.js';
import { runNativeSpiceTs as baselineAdapter } from './.reference/baseline-adapter.js';
import { runNativeSpiceTs as currentAdapter } from './.reference/current-adapter.js';
import { compareExecutions as baselineCompare } from './.reference/baseline-compare.js';
import type { ClassicCircuit, EngineExecution } from '../corpus/classic/report.js';

async function main() {
  const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-j/manifest.json', 'utf8'));
  const rows = [];
  for (const circuit of manifest.circuits) {
    const input = await readFile(circuit.localPath);
    if (!hasControlBlock(input.toString('utf8'))) continue;
    const ng = await runControlReference(input, circuit);
    const ownBefore = await baselineAdapter(input, circuit as ClassicCircuit, { parseFirst: false });
    const ownAfter = await currentAdapter(input, circuit as ClassicCircuit, { parseFirst: false });
    const referenceBefore: EngineExecution = { ...ng.execution, analyses: ng.execution.analyses.filter(a => a.plotId === `${a.type}1`).map(({ plotId: _id, series, ...rest }) => ({ ...rest, series: { grid: series.grid, signals: series.signals } })) };
    const before = ownBefore.status === 'success' && ng.status === 'success' ? baselineCompare(ownBefore, referenceBefore) : [];
    const after = ownAfter.status === 'success' && ng.status === 'success' ? compareExecutions(ownAfter, ng.execution) : [];
    const summary = (comparisons: typeof after, own: EngineExecution, reference: EngineExecution) => {
      const { errors, missing } = normalizedSignalErrors(comparisons, pairedReferenceSeries(own, reference));
      return { status: own.status, error: own.error, plots: comparisons.length, aligned: comparisons.reduce((sum, c) => sum + c.metrics.grid.alignedPoints, 0), missing, normalized: errors.length ? Math.max(...errors.map(e => e.normalized)) : null };
    };
    const oldSummary = summary(before, ownBefore, referenceBefore);
    const newSummary = summary(after, ownAfter, ng.execution);
    const direction = oldSummary.normalized !== null && newSummary.normalized !== null ? newSummary.normalized < oldSummary.normalized ? 'lower-error' : newSummary.normalized > oldSummary.normalized ? 'higher-error' : 'unchanged-error' : 'unscored';
    rows.push({ id: circuit.id, ngspiceStatus: ng.status, before: oldSummary, after: newSummary, direction, beforeComparisons: before, afterComparisons: after });
    console.log(JSON.stringify({ id: circuit.id, before: oldSummary, after: newSummary, direction }));
    await writeFile('benchmarks/plot-970/corpus-j-delta.json', JSON.stringify({ scope: 'all five corpus-j control fixtures, not an exhaustive other-corpus inventory', core: 'cc1896298a1e7e884f1989593228a1bc2b97419f', rows }, null, 2) + '\n');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
