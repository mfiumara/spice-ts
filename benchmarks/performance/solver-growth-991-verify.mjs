// Verification = complete fixed matrix + full-output equality + unchanged gate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { statistics } from './rc1k-attribution-data.mjs';
import { m2Netlist } from './scaling-m2-fixture.mjs';
const circuits = ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran'];
const sizes = [1000, 10000, 50000];
const modes = ['control', 'candidate', 'ngspice'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function verify(rows, prepared, budget) {
  if (rows.length !== 270 || budget.planned !== 270 || budget.started !== 270 || budget.completed !== 270 || budget.nativeAttempted !== 90 || !budget.deadlineAndBudgetCertified || budget.stopReason || !Number.isFinite(budget.actualRunSeconds) || budget.actualRunSeconds < 0 || budget.actualRunSeconds >= 1800) throw new Error('incomplete or uncertified matrix');
  const clockKeys = ['continuous', 'monotonic', 'realtime'];
  if (![budget.start, budget.end].every(s => s && clockKeys.every(k => Number.isFinite(s[k]))) || Math.abs(budget.end.continuous - budget.start.continuous - budget.actualRunSeconds) > 0.001 || clockKeys.some(k => Math.abs(budget.end[k] - budget.start[k] - budget.actualRunSeconds) > 0.1)) throw new Error('invalid budget clock');
  if (rows.reduce((sum, r) => sum + r.boundaries.wall / 1000, 0) > budget.actualRunSeconds + 0.001) throw new Error('children outside budget');
  const summary = {}, outputHashes = {}, comparison = {};
  let index = 0;
  for (let round = 1; round <= 10; round++) for (const size of sizes) for (const circuit of circuits) for (const mode of [...modes.slice((round - 1) % 3), ...modes.slice(0, (round - 1) % 3)]) {
    const row = rows[index++];
    if (row.round !== round || row.size !== size || row.circuit !== circuit || row.mode !== mode) throw new Error('interleaving drift');
  }
  for (const size of sizes) for (const circuit of circuits) {
    const key = `${circuit}-${size}`;
    const deck = prepared.decks.find(d => d.circuit === circuit && d.size === size);
    if (!deck || !/^[a-f0-9]{64}$/.test(deck.deckSha256)) throw new Error('missing deck pin');
    summary[key] = {};
    outputHashes[key] = {};
    for (const mode of modes) {
      const group = rows.filter(r => r.circuit === circuit && r.size === size && r.mode === mode);
      if (group.length !== 10 || new Set(group.map(r => r.round)).size !== 10 || group.some(r => !Number.isInteger(r.round) || r.round < 1 || r.round > 10)) throw new Error('missing or duplicate round');
      for (const row of group) {
        if (row.status !== 'ok' || row.stopReason || row.code !== 0 || !row.processGroupGone || row.worker.status !== 'ok' || row.worker.evidence.deckSha256 !== deck.deckSha256) throw new Error('failed or drifted sample');
        const b = row.boundaries, elapsed = row.end.continuous - row.start.continuous;
        if (![row.start, row.end].every(s => clockKeys.every(k => Number.isFinite(s[k]))) || row.start.continuous < budget.start.continuous || row.end.continuous > budget.end.continuous) throw new Error('missing or outside clock');
        if (b.wall >= 120000 || !Number.isFinite(b.wall) || Object.values(b).some(v => v !== null && (!Number.isFinite(v) || v < 0))) throw new Error('invalid phase');
        if (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(elapsed * 1000 - b.wall) > 0.001 || ['monotonic', 'realtime'].some(k => Math.abs(row.end[k] - row.start[k] - elapsed) > 0.1)) throw new Error('clock disagreement');
        const lifetime = row.worker.lifetime;
        if (![lifetime.performanceMs, lifetime.realtimeMs].every(v => Number.isFinite(v) && v >= 0) || Math.abs(lifetime.performanceMs - lifetime.realtimeMs) > 100 || lifetime.performanceMs > b.wall + 100) throw new Error('worker clock disagreement');
        if (mode === 'ngspice') {
          if (row.worker.evidence.native.code !== 0 || !Number.isFinite(b.nativeWall) || b.nativeWall > b.wall) throw new Error('failed native');
        } else if (!Number.isFinite(b.factor) || !Number.isFinite(b.growth) || !Number.isFinite(b.simulate) || b.factor > b.simulate || b.growth > b.factor) throw new Error('missing or overlapping factor time');
      }
      const hashes = new Set(group.map(r => r.worker.evidence.output.outputSha256));
      if (hashes.size !== 1 || !/^[a-f0-9]{64}$/.test([...hashes][0])) throw new Error('unstable or missing full-output hash');
      outputHashes[key][mode] = [...hashes][0];
      summary[key][mode] = Object.fromEntries(Object.keys(group[0].boundaries).map(k => {
        const values = group.map(r => r.boundaries[k]);
        return [k, values.every(v => typeof v === 'number') ? statistics(values) : null];
      }));
    }
    if (outputHashes[key].control !== outputHashes[key].candidate) throw new Error('candidate changed full output');
    const before = summary[key].control, after = summary[key].candidate, native = summary[key].ngspice;
    comparison[key] = { factorReduction: 1 - after.factor.median / before.factor.median,
      nonOverlappingIQR: after.factor.q3 < before.factor.q1,
      wallReduction: 1 - after.wall.median / before.wall.median,
      beforeWallLoss: before.wall.median / native.nativeWall.median,
      candidateWallLoss: after.wall.median / native.nativeWall.median };
  }
  // Numeric LU has the largest combined permitted RC10k + Mesh10k time.
  // Require the same general candidate to clear the gate on both decks.
  const targets = ['rc-ladder-tran-10000', 'resistor-mesh-op-10000'].map(k => comparison[k]);
  return { samples: rows.length, summary, outputHashes, comparison,
    thresholdMet: targets.every(t => t.factorReduction >= 0.1 && t.nonOverlappingIQR) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const out = resolve(process.argv[2]);
  const stored = name => existsSync(join(out, name)) ? readFileSync(join(out, name)) : gunzipSync(readFileSync(join(out, name + '.gz')));
  const prepared = JSON.parse(stored('prepared.json'));
  for (const [name, hash] of Object.entries(prepared.hashes)) if (sha(stored(name)) !== hash) throw new Error('bundle drift');
  for (const deck of prepared.decks) {
    const bytes = existsSync(join(out, deck.file)) ? stored(deck.file) : m2Netlist(deck.circuit, deck.size).netlist;
    if (sha(bytes) !== deck.deckSha256) throw new Error('deck drift');
  }
  const rows = stored('receipts.jsonl').toString().trim().split('\n').map(line => JSON.parse(line));
  for (const row of rows.filter(r => r.mode === 'ngspice')) {
    const raw = Buffer.concat([stored(row.id + '.header'), stored('native-payloads/' + row.rawPayloadSha256 + '.bin')]);
    const marker = raw.indexOf(Buffer.from('Binary:\n'));
    if (marker < 0 || sha(raw) !== row.rawSha256 || sha(raw.subarray(marker + 8)) !== row.worker.evidence.output.outputSha256 || raw.length - marker - 8 !== row.worker.evidence.output.bytes) throw new Error('native raw archive drift');
  }
  const result = verify(rows, prepared, JSON.parse(stored('budget.json')));
  writeFileSync(join(out, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  const f = s => `${s.median.toFixed(3)} / ${s.iqr.toFixed(3)}`;
  const lines = ['# Fixed ten-round cold numeric LU experiment', '', 'Milliseconds, median / IQR. No trimming, retry or warmup.', '', '| Deck | Before factor | Candidate factor | Factor cut | Before wall | Candidate wall | Native wall | Before/native | Candidate/native |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const [key, m] of Object.entries(result.summary)) {
    const c = result.comparison[key];
    lines.push(`| ${key} | ${f(m.control.factor)} | ${f(m.candidate.factor)} | ${(100 * c.factorReduction).toFixed(3)}% | ${f(m.control.wall)} | ${f(m.candidate.wall)} | ${f(m.ngspice.nativeWall)} | ${c.beforeWallLoss.toFixed(3)}x | ${c.candidateWallLoss.toFixed(3)}x |`);
  }
  lines.push('', 'Target gate met: ' + result.thresholdMet + '.', '', '| Deck | Before growth | Candidate growth | Before factor Q1..Q3 | Candidate factor Q1..Q3 |', '|---|---:|---:|---:|---:|');
  for (const [key, m] of Object.entries(result.summary)) lines.push(`| ${key} | ${f(m.control.growth)} | ${f(m.candidate.growth)} | ${m.control.factor.q1.toFixed(3)}..${m.control.factor.q3.toFixed(3)} | ${m.candidate.factor.q1.toFixed(3)}..${m.candidate.factor.q3.toFixed(3)} |`);
  writeFileSync(join(out, 'table.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ samples: result.samples, thresholdMet: result.thresholdMet, comparison: result.comparison }, null, 2));
}
