import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { catalogue, summarize } from '../plot-identity-970/audit.js';
import { compareExecutions } from '../aggregate-report.js';
import { normalizedSignalErrors, pairedReferenceSeries, MATCH_THRESHOLD } from '../corpus/corpus-f/lib.js';
import { pairPlots } from '../plot-pairing.js';
import { compareInBatches, packExecution } from '../corpus/corpus-f/packed.js';

async function main() {
const root = 'benchmarks/dot-analysis-1009';
const beforeAdapter = await import('./.snapshot/before.js');
const afterAdapter = await import('./.snapshot/after.js');
const memo = await import('./.snapshot/core.js');
const keys = new Set(['corpus-e/bjt-diffpair-current-source', 'corpus-e-spice3/vcvs-operating-point', 'corpus-e-spice3/diode-temperature-sweep', 'corpus-e-spice3/mos1-nand-transient', 'corpus-e-spice3/dual-lc-uic-rejection']);
const entries = (await catalogue()).filter(entry => keys.has(entry.key));
assert.equal(entries.length, 5);
await mkdir(`${root}/raw`, { recursive: true });
const rows = [];
for (const entry of entries) {
  memo.reset();
  const input = await readFile(entry.circuit.localPath);
  const before = await beforeAdapter.runNativeSpiceTs(input, entry.circuit);
  const after = await afterAdapter.runNativeSpiceTs(input, entry.circuit);
  assert.equal(memo.calls, 1, 'before/after adapters must share one native simulation');
  const reconstructed = { ...after, analyses: entry.circuit.analyses.flatMap(type => after.analyses.filter(a => a.type === type && (a.plotId === undefined || !a.plotId.startsWith('dot:') || a.plotId === `dot:${type}:1`)).map(({ plotId, ...a }) => plotId?.startsWith('dot:') ? a : { ...a, ...(plotId === undefined ? {} : { plotId }) })) };
  assert.deepEqual(reconstructed, before, 'diagnostic baseline reconstruction must equal the exact main adapter');
  const reference = await afterAdapter.runNativeNgspice(input, entry.circuit);
  const beforeComparisons = compareExecutions(before, reference);
  const afterComparisons = compareExecutions(after, reference);
  assert.deepEqual(compareInBatches(packExecution(after), packExecution(reference), 1), afterComparisons);
  const previousReferences = new Set(pairPlots(before.analyses, reference.analyses).filter(pair => pair.left && pair.right).map(pair => reference.analyses.indexOf(pair.right!)));
  const newlyPaired = afterComparisons.filter(c => !c.unmatched && !previousReferences.has(c.plot?.ngspiceIndex ?? 0)).map(c => {
    const normalization = normalizedSignalErrors([c], pairedReferenceSeries(after, reference));
    const worst = normalization.errors.reduce((a, b) => a === null || b.normalized > a.normalized ? b : a, null as typeof normalization.errors[number] | null);
    return { analysis: c.analysis, plot: c.plot, worst, missing: normalization.missing, mismatch: normalization.missing > 0 || (worst?.normalized ?? 0) > MATCH_THRESHOLD };
  });
  const raw = { before, after, reference, beforeComparisons, afterComparisons };
  const rawText = JSON.stringify(raw);
  await writeFile(`${root}/raw/${entry.circuit.id}.json`, rawText);
  rows.push({ key: entry.key, localPath: entry.circuit.localPath, inputSha256: createHash('sha256').update(input).digest('hex'), simulationCalls: memo.calls, rawSha256: createHash('sha256').update(rawText).digest('hex'), before: summarize(beforeComparisons, before, reference), after: summarize(afterComparisons, after, reference), newlyPaired });
  console.log(JSON.stringify({ key: entry.key, before: [rows.at(-1)!.before.plotsPaired, rows.at(-1)!.before.plotsUnmatched], after: [rows.at(-1)!.after.plotsPaired, rows.at(-1)!.after.plotsUnmatched], newlyPaired }));
}
const report = { baseline: '169d683d89b77c8ccb5a9459bc3888c4ec0aba62', node: process.version, ngspice: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout.match(/ngspice-\d+/)?.[0], threshold: MATCH_THRESHOLD, rows };
await writeFile(`${root}/inventory.json`, JSON.stringify(report, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
