// Verification = {samples, deckHashes, outputHashes, summary, eligibleSolverBuckets}.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { statistics } from './rc1k-attribution-data.mjs';

export function verify(rows, prepared, budget) {
  if (rows.length !== 60 || budget.started !== 60 || budget.completed !== 60 || budget.nativeAttempted !== 20 || !budget.deadlineAndBudgetCertified || budget.stopReason || budget.actualRunSeconds >= 300) throw new Error('incomplete or uncertified fixed matrix');
  const summary = {}, outputHashes = {}, deckHashes = {};
  for (const circuit of ['rc-ladder-tran', 'resistor-mesh-op']) {
    const deck = prepared.decks.find(d => d.circuit === circuit && d.size === 10000);
    deckHashes[circuit] = deck.deckSha256;
    const engineHashes = {};
    summary[circuit] = {};
    for (const mode of ['control', 'instrumented', 'ngspice']) {
      const group = rows.filter(r => r.circuit === circuit && r.size === 10000 && r.mode === mode);
      if (group.length !== 10 || new Set(group.map(r => r.round)).size !== 10 || group.some(r => !Number.isInteger(r.round) || r.round < 1 || r.round > 10)) throw new Error('missing or duplicate round');
      for (const row of group) {
        if (row.status !== 'ok' || row.stopReason || row.code !== 0 || !row.processGroupGone || row.worker.status !== 'ok' || row.worker.evidence.deckSha256 !== deck.deckSha256) throw new Error('failed/deck-drift sample');
        const b = row.boundaries;
        if (b.wall >= 30000 || Object.values(b).some(v => v !== null && (!Number.isFinite(v) || v < 0))) throw new Error('invalid phase');
        const elapsed = row.end.continuous - row.start.continuous;
        const lifetime = row.worker.lifetime;
        if (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(elapsed * 1000 - b.wall) > 0.001 ||
            ['monotonic', 'realtime'].some(key => Math.abs(row.end[key] - row.start[key] - elapsed) > 0.1) ||
            Math.abs(lifetime.performanceMs - lifetime.realtimeMs) > 100 ||
            lifetime.performanceMs > b.wall + 100) throw new Error('clock disagreement');
        if (mode === 'instrumented') {
          const covered = ['compile', 'matrixBuild', 'ordering', 'loadStamp', 'factor', 'solve', 'outputMaterialization', 'simulateResidual'].reduce((sum, key) => sum + b[key], 0);
          if (Math.abs(covered - b.simulate) > 0.001) throw new Error('overlapping or missing simulation phases');
        }
      }
      const hashes = new Set(group.map(r => r.worker.evidence.output.outputSha256));
      if (hashes.size !== 1) throw new Error('output changed between rounds');
      engineHashes[mode] = [...hashes][0];
      const boundaries = {};
      for (const key of Object.keys(group[0].boundaries)) {
        const values = group.map(r => r.boundaries[key]);
        boundaries[key] = values.every(v => typeof v === 'number') ? statistics(values) : null;
      }
      summary[circuit][mode] = boundaries;
    }
    if (engineHashes.control !== engineHashes.instrumented) throw new Error('instrumentation changed full output');
    outputHashes[circuit] = engineHashes;
  }
  const eligibleSolverBuckets = [];
  for (const [circuit, modes] of Object.entries(summary)) for (const key of ['matrixBuild', 'ordering', 'factor', 'solve']) {
    const fraction = modes.instrumented[key].median / modes.instrumented.wall.median;
    if (fraction >= 0.2) eligibleSolverBuckets.push({ circuit, key, fraction });
  }
  return { samples: rows.length, deckHashes, outputHashes, summary, eligibleSolverBuckets };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const out = resolve(process.argv[2]);
  const stored = name => existsSync(join(out, name)) ? readFileSync(join(out, name)) : gunzipSync(readFileSync(join(out, name + '.gz')));
  const prepared = JSON.parse(readFileSync(join(out, 'prepared.json')));
  for (const [name, hash] of Object.entries(prepared.hashes)) if (createHash('sha256').update(stored(name)).digest('hex') !== hash) throw new Error('bundle drift');
  for (const deck of prepared.decks) if (createHash('sha256').update(readFileSync(join(out, deck.file))).digest('hex') !== deck.deckSha256) throw new Error('deck drift');
  const rows = readFileSync(join(out, 'receipts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  for (const row of rows.filter(r => r.mode === 'ngspice' && r.status === 'ok')) {
    const raw = stored(row.id + '.raw'), marker = raw.indexOf(Buffer.from('Binary:\n'));
    if (marker < 0 || createHash('sha256').update(raw.subarray(marker + 8)).digest('hex') !== row.worker.evidence.output.outputSha256) throw new Error('native raw output drift');
  }
  const result = verify(rows, prepared, JSON.parse(readFileSync(join(out, 'budget.json'))));
  writeFileSync(join(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  const f = s => s ? `${s.median.toFixed(3)} / ${s.iqr.toFixed(3)}` : 'not separately available';
  const lines = ['# #991 fixed ten-round attribution', '', 'All times ms, median / IQR (linear interpolation). No samples trimmed.', ''];
  for (const [circuit, modes] of Object.entries(result.summary)) {
    lines.push(`## ${circuit}`, '', '| Phase | Unchanged control | Instrumented copy | ngspice wrapper |', '|---|---:|---:|---:|');
    for (const key of new Set(Object.values(modes).flatMap(m => Object.keys(m)))) lines.push(`| ${key} | ${f(modes.control[key])} | ${f(modes.instrumented[key])} | ${f(modes.ngspice[key])} |`);
    lines.push('', `Control parent wall / direct native wall = ${(modes.control.wall.median / modes.ngspice.nativeWall.median).toFixed(3)}x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.`, '');
    lines.push('| Instrumented exclusive phase | % of instrumented parent wall |', '|---|---:|');
    for (const key of ['parse', 'compile', 'matrixBuild', 'ordering', 'loadStamp', 'factor', 'solve', 'outputMaterialization', 'simulateResidual']) lines.push(`| ${key} | ${(100 * modes.instrumented[key].median / modes.instrumented.wall.median).toFixed(2)}% |`);
    lines.push('');
  }
  writeFileSync(join(out, 'table.md'), lines.join('\n').trimEnd() + '\n');
  console.log(`Verified ${result.samples} samples, unchanged full-output hashes, ${result.eligibleSolverBuckets.length} solver buckets >=20% of parent wall.`);
}
