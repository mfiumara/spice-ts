// Offline summary only. Does not launch simulators or remove samples.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize, statistics, rederiveEpoch } from './rc1k-attribution-data.mjs';
import { residualTargets, targets } from './rc1k-attribution-prepare.mjs';
const directory = process.argv[2];
const rows = readFileSync(join(directory, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).map(rederiveEpoch);
for (const row of rows) {
  if (row.mode === 'ngspice') row.boundaries.engineAndHash = row.boundaries.nativeWall + row.boundaries.outputHash;
  else row.boundaries.engineAndHash = row.boundaries.wall;
  if (row.mode === 'instrumented') row.boundaries.outputMaterializationAndHash = row.boundaries.outputMaterialization + row.boundaries.outputHash;
}
const summary = summarize(rows);
const hashes = Object.fromEntries(['control', 'instrumented', 'ngspice'].map(mode => [mode,
  [...new Set(rows.filter(row => row.mode === mode).map(row => row.worker?.evidence?.output?.outputSha256))]]));
const native = rows.filter(row => row.mode === 'ngspice');
const pairedOverhead = rows.filter(row => row.mode === 'instrumented').map(row => row.boundaries.wall - rows.find(control => control.mode === 'control' && control.round === row.round).boundaries.wall);
// Signed overhead is NOT a duration distribution. Keep every round.
const signed = [...pairedOverhead].sort((a, b) => a - b);
const middle = Math.floor(signed.length / 2);
const overhead = {
  differenceOfMediansMs: summary.instrumented.boundaries.wall.median - summary.control.boundaries.wall.median,
  pairedDifferencesMs: pairedOverhead,
  pairedMedianMs: signed.length % 2 ? signed[middle] : (signed[middle - 1] + signed[middle]) / 2,
  minMs: signed[0], maxMs: signed.at(-1),
};
const loads = rows.flatMap(row => [row.before.loadavg[0], row.after.loadavg[0]]);
const processes = rows.flatMap(row => [row.before.processCount, row.after.processCount]);
const counts = { topLevel: rows.length, native: native.filter(row => row.worker?.evidence?.native).length, total: rows.length + native.filter(row => row.worker?.evidence?.native).length, certified: rows.filter(row => row.certified).length };
const residualKeys = [...new Set(Object.entries(residualTargets).filter(([name]) => !(name in targets)).map(([, key]) => key))];
const residualRows = rows.filter(r => r.mode === 'instrumented' && r.boundaries.driverAdvanceSelf !== undefined);
const residual = residualRows.length ? Object.fromEntries([...residualKeys, 'simulateResidual'].map(key => [key, {
  milliseconds: statistics(residualRows.map(r => r.boundaries[key])),
  percentOfSimulate: statistics(residualRows.map(r => 100 * r.boundaries[key] / r.boundaries.simulate)),
  observationsAtLeast20Percent: residualRows.filter(r => r.boundaries[key] >= 0.2 * r.boundaries.simulate).length,
}])) : null;
const output = { summary, hashes, overhead, counts, residual, flagged: rows.filter(r => r.status !== 'ok').map(r => ({ id: r.id, status: r.status, certificationError: r.certificationError, derivedCorrection: r.derivedCorrection })), hostLoad1: statistics(loads), processCount: statistics(processes) };
writeFileSync(join(directory, 'summary.json'), JSON.stringify(output, null, 2) + '\n');
const table = ['| Boundary (ms) | Control median / IQR | Instrumented median / IQR | ngspice wrapper median / IQR |', '|---|---:|---:|---:|'];
const keys = ['wall', 'engineAndHash', 'spawnFirstUserCode', 'import', 'deckRead', 'parse', 'compile', 'simulate', 'loadStamp', 'factor', 'solve', 'reorder', 'simulateResidual', 'outputMaterialization', 'outputHash', 'outputMaterializationAndHash', 'exit', 'nativeWall', 'nativeAnalysis'];
for (const key of Object.keys(summary.instrumented.boundaries)) if (!keys.includes(key)) keys.push(key);
for (const key of keys) {
  const cells = ['control', 'instrumented', 'ngspice'].map(mode => {
    const s = summary[mode].boundaries[key];
    return s ? `${s.median.toFixed(3)} / ${s.iqr.toFixed(3)} (n=${s.n})` : 'unavailable';
  });
  table.push(`| ${key} | ${cells.join(' | ')} |`);
}
writeFileSync(join(directory, 'table.md'), table.join('\n') + '\n');
console.log(JSON.stringify(output, null, 2));
