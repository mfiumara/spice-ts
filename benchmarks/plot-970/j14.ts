import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { cpus, arch, platform, release } from 'node:os';
import { runControlReference } from '../corpus/corpus-f/control-vectors.js';
import { compareExecutions } from '../aggregate-report.js';
import { normalizedSignalErrors, pairedReferenceSeries } from '../corpus/corpus-f/lib.js';
import { runNativeSpiceTs as baselineAdapter } from './.reference/baseline-adapter.js';
import { runNativeSpiceTs as currentAdapter } from './.reference/current-adapter.js';
import { compareExecutions as baselineCompare } from './.reference/baseline-compare.js';
import type { ClassicCircuit, EngineExecution } from '../corpus/classic/report.js';

async function main() {
const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
assert.match(version, /ngspice-47\b/);
const path = 'benchmarks/corpus/corpus-j/fixtures/ngspice-current/examples/mos/nmos_pmos_BSIM330.sp';
const input = await readFile(path);
assert.equal(createHash('sha256').update(input).digest('hex'), '64980e734428b4a24605d1fff5004cd393a1108be56e36618c1c280847fc0952');
const circuit = { analyses: ['dc'], localPath: path } as ClassicCircuit;
const ng = await runControlReference(input, { ...circuit, unmappedAnalyses: [] });
assert.equal(ng.status, 'success');
const beforeEngine = await baselineAdapter(input, circuit, { parseFirst: false });
const afterEngine = await currentAdapter(input, circuit, { parseFirst: false });
assert.equal(beforeEngine.status, 'success');
assert.equal(afterEngine.status, 'success');
const beforeReference: EngineExecution = { ...ng.execution, analyses: ng.execution.analyses.slice(0, 1).map(({ plotId: _id, series, ...rest }) => ({ ...rest, series: { grid: series.grid, signals: series.signals } })) };
const before = baselineCompare(beforeEngine, beforeReference);
const after = compareExecutions(afterEngine, ng.execution);
const summarize = (comparisons: typeof after, own: EngineExecution, reference: EngineExecution) => {
  const normalized = normalizedSignalErrors(comparisons, pairedReferenceSeries(own, reference));
  return { comparedPlots: comparisons.length, alignedPoints: comparisons.reduce((sum, c) => sum + c.metrics.grid.alignedPoints, 0), excludedPoints: comparisons.reduce((sum, c) => sum + c.metrics.grid.excludedOutOfRange, 0), worstNormalized: Math.max(...normalized.errors.map(e => e.normalized)), missing: normalized.missing };
};
const receipt = { fixture: path, sha256: createHash('sha256').update(input).digest('hex'), referenceCore: 'cc1896298a1e7e884f1989593228a1bc2b97419f', baseAdapter: 'c4858434e58fedeeedab142f2479252e0a59e851', tools: { node: process.version, ngspice: 'ngspice-47' }, environment: { arch: arch(), platform: platform(), release: release(), cpu: cpus()[0]?.model }, policy: 'identical original input; exact #968 reference core for both adapters; no tolerance/deck changes; baseline exports first plot and exposes latest result; reference secondary coordinates are reconstructed only from straight-line literal DC commands and observed primary resets', before: { ...summarize(before, beforeEngine, beforeReference), comparisons: before }, after: { ...summarize(after, afterEngine, ng.execution), comparisons: after } };
assert.equal(receipt.before.alignedPoints, 6);
assert.equal(receipt.before.excludedPoints, 180);
assert.equal(receipt.after.comparedPlots, 6);
assert.equal(receipt.after.alignedPoints, 1236);
assert.equal(receipt.after.excludedPoints, 0);
assert.equal(receipt.after.missing, 0);
await writeFile('benchmarks/plot-970/j14.json', JSON.stringify(receipt, null, 2) + '\n');
await writeFile('benchmarks/plot-970/j14-raw.json.gz', gzipSync(JSON.stringify({ beforeEngine, beforeReference, afterEngine, afterReference: ng.execution })));
console.log(JSON.stringify({ before: summarize(before, beforeEngine, beforeReference), after: summarize(after, afterEngine, ng.execution) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
