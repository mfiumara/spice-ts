// Verification = {samples, deckHashes, outputHashes, summary, eligibleSolverBuckets}.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { statistics } from './rc1k-attribution-data.mjs';
import { parsePhases } from './parse-1000-targets.mjs';

export function verify(rows, prepared, budget) {
  const sizes = prepared.comparison ? [1000, 10000, 50000] : [10000];
  const expected = sizes.length * 60;
  if (rows.length !== expected || budget.started !== expected || budget.completed !== expected || budget.nativeAttempted !== expected / 3 || !budget.deadlineAndBudgetCertified || budget.stopReason || budget.actualRunSeconds >= 300) throw new Error('incomplete or uncertified fixed matrix');
  const parserAttribution = prepared.attribution === 'parse';
  const summary = {}, outputHashes = {}, deckHashes = {}, parseHashes = {};
  for (const size of sizes) for (const circuit of ['rc-ladder-tran', 'resistor-mesh-op']) {
    const key = prepared.comparison ? `${circuit}-${size}` : circuit;
    const deck = prepared.decks.find(d => d.circuit === circuit && d.size === size);
    deckHashes[key] = deck.deckSha256;
    const engineHashes = {};
    summary[key] = {};
    for (const mode of prepared.comparison ? ['control', 'candidate', 'ngspice'] : ['control', 'instrumented', 'ngspice']) {
      const group = rows.filter(r => r.circuit === circuit && r.size === size && r.mode === mode);
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
          const phases = parserAttribution ? parsePhases : ['compile', 'matrixBuild', 'ordering', 'loadStamp', 'factor', 'solve', 'outputMaterialization', 'simulateResidual'];
          if (phases.some(key => !Number.isFinite(b[key]))) throw new Error('missing phase');
          const covered = phases.reduce((sum, key) => sum + b[key], 0);
          if (Math.abs(covered - (parserAttribution ? b.parse : b.simulate)) > 0.001) throw new Error('overlapping or missing phases');
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
      summary[key][mode] = boundaries;
    }
    if (engineHashes.control !== engineHashes[prepared.comparison ? 'candidate' : 'instrumented']) throw new Error('candidate/instrumentation changed full output');
    if (parserAttribution) {
      const hashes = new Set(rows.filter(r => r.circuit === circuit && r.size === size && r.mode !== 'ngspice').map(r => r.worker.evidence.parseSha256));
      if (hashes.size !== 1 || !/^[a-f0-9]{64}$/.test([...hashes][0] ?? '')) throw new Error('parse result missing or changed');
      parseHashes[key] = [...hashes][0];
    }
    outputHashes[key] = engineHashes;
  }
  const eligibleSolverBuckets = [];
  for (const [circuit, modes] of Object.entries(summary)) for (const key of ['matrixBuild', 'ordering', 'factor', 'solve']) {
    const fraction = (modes.instrumented?.[key]?.median ?? 0) / (modes.instrumented?.wall.median ?? 1);
    if (fraction >= 0.2) eligibleSolverBuckets.push({ circuit, key, fraction });
  }
  const comparison = prepared.comparison ? Object.fromEntries(Object.entries(summary).map(([key, modes]) => {
    const before = modes.control.parse, after = modes.candidate.parse;
    return [key, { reduction: 1 - after.median / before.median,
      nonOverlappingIQR: after.q3 < before.q1,
      regressionBeyondIQR: after.q1 > before.q3,
      beforeWallLoss: modes.control.wall.median / modes.ngspice.nativeWall.median,
      candidateWallLoss: modes.candidate.wall.median / modes.ngspice.nativeWall.median }];
  })) : undefined;
  const thresholdMet = comparison && Object.entries(comparison).every(([key, value]) =>
    key.endsWith('-10000') ? value.reduction >= 0.25 && value.nonOverlappingIQR : !value.regressionBeyondIQR);
  return { samples: rows.length, deckHashes, outputHashes, summary, eligibleSolverBuckets,
    ...(parserAttribution ? { parseHashes } : {}), ...(comparison ? { comparison, thresholdMet } : {}) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const out = resolve(process.argv[2]);
  const stored = name => existsSync(join(out, name)) ? readFileSync(join(out, name)) : gunzipSync(readFileSync(join(out, name + '.gz')));
  const prepared = JSON.parse(readFileSync(join(out, 'prepared.json')));
  for (const [name, hash] of Object.entries(prepared.hashes)) if (createHash('sha256').update(stored(name)).digest('hex') !== hash) throw new Error('bundle drift');
  for (const deck of prepared.decks) if (createHash('sha256').update(stored(deck.file)).digest('hex') !== deck.deckSha256) throw new Error('deck drift');
  const rows = readFileSync(join(out, 'receipts.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const rawHashes = existsSync(join(out, 'native-raw-sha256.json')) ? JSON.parse(readFileSync(join(out, 'native-raw-sha256.json'))) : undefined;
  for (const row of rows.filter(r => r.mode === 'ngspice' && r.status === 'ok')) {
    // Lossless archive form separates the changing header from identical numeric payloads.
    const rawName = row.id + '.raw';
    const raw = existsSync(join(out, rawName)) || existsSync(join(out, rawName + '.gz')) ? stored(rawName) :
      Buffer.concat([stored(row.id + '.header'), stored('native-payloads/' + row.worker.evidence.output.outputSha256 + '.bin')]);
    const marker = raw.indexOf(Buffer.from('Binary:\n'));
    if (rawHashes && createHash('sha256').update(raw).digest('hex') !== rawHashes[row.id]) throw new Error('native raw reconstruction drift');
    if (marker < 0 || createHash('sha256').update(raw.subarray(marker + 8)).digest('hex') !== row.worker.evidence.output.outputSha256) throw new Error('native raw output drift');
  }
  const result = verify(rows, prepared, JSON.parse(readFileSync(join(out, 'budget.json'))));
  writeFileSync(join(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  const f = s => s ? `${s.median.toFixed(3)} / ${s.iqr.toFixed(3)}` : 'not separately available';
  const parserAttribution = prepared.attribution === 'parse';
  const lines = [`# ${parserAttribution ? '#1000 parser' : '#991 solver'} fixed ten-round attribution`, '', 'All times ms, median / IQR (linear interpolation). No samples trimmed.', ''];
  for (const [circuit, modes] of Object.entries(result.summary)) {
    lines.push(`## ${circuit}`, '', `| Phase | Unchanged control | ${prepared.comparison ? 'Uninstrumented candidate' : 'Instrumented copy'} | ngspice wrapper |`, '|---|---:|---:|---:|');
    for (const key of new Set(Object.values(modes).flatMap(m => Object.keys(m)))) lines.push(`| ${key} | ${f(modes.control[key])} | ${f((modes.candidate ?? modes.instrumented)[key])} | ${f(modes.ngspice[key])} |`);
    lines.push('', `Control parent wall / direct native wall = ${(modes.control.wall.median / modes.ngspice.nativeWall.median).toFixed(3)}x. This includes cold Node startup, import and full-output hash; nativeWall includes native raw emission but not the Node wrapper.`, '');
    if (prepared.comparison) lines.push(`Candidate parent wall / direct native wall = ${result.comparison[circuit].candidateWallLoss.toFixed(3)}x. Candidate parse reduction = ${(100 * result.comparison[circuit].reduction).toFixed(3)}%.`, '');
    if (!prepared.comparison) {
      lines.push('| Instrumented exclusive phase | % of instrumented parent wall |', '|---|---:|');
      for (const key of parserAttribution ? parsePhases : ['parse', 'compile', 'matrixBuild', 'ordering', 'loadStamp', 'factor', 'solve', 'outputMaterialization', 'simulateResidual']) lines.push(`| ${key} | ${(100 * modes.instrumented[key].median / modes.instrumented.wall.median).toFixed(2)}% |`);
    }
    lines.push('');
  }
  writeFileSync(join(out, 'table.md'), lines.join('\n').trimEnd() + '\n');
  console.log(`Verified ${result.samples} samples, unchanged full-output hashes, ${result.eligibleSolverBuckets.length} solver buckets >=20% of parent wall.`);
}
