// Verification = certified matrix + cold-wall gate + profile self-time + all-signal accuracy summary.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verify } from '../../performance/linear-10k-verify.mjs';
const root = resolve(process.argv[2]);
const read = path => path.endsWith('.gz') ? gunzipSync(readFileSync(path)) : existsSync(path) ? readFileSync(path) : gunzipSync(readFileSync(path + '.gz'));
const json = path => JSON.parse(read(path));
const matrix = join(root, 'matrix');
const rows = read(join(matrix, 'receipts.jsonl')).toString().trim().split('\n').map(JSON.parse);
const prepared = json(join(matrix, 'prepared.json'));
const budget = json(join(matrix, 'budget.json'));
const result = verify(rows, prepared, budget);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [name, pin] of Object.entries(prepared.hashes)) assert.equal(hash(read(join(matrix, name))), pin);
for (const deck of prepared.decks) assert.equal(hash(read(join(matrix, deck.file))), deck.deckSha256);
for (const row of rows.filter(r => r.mode === 'ngspice')) {
  const payload = read(join(matrix, 'native-payloads', row.rawPayloadSha256 + '.bin'));
  assert.equal(hash(payload), row.rawPayloadSha256);
  assert.equal(hash(Buffer.concat([read(join(matrix, row.id + '.header')), payload])), row.rawSha256);
}
const walls = Object.fromEntries(Object.entries(result.summary).map(([name, modes]) => [name, {
  before: modes.control.wall, candidate: modes.candidate.wall, native: modes.ngspice.nativeWall,
  reductionPercent: 100 * (1 - modes.candidate.wall.median / modes.control.wall.median),
  beforeNativeLoss: modes.control.wall.median / modes.ngspice.nativeWall.median,
  candidateNativeLoss: modes.candidate.wall.median / modes.ngspice.nativeWall.median,
}]));
const thresholdMet = Object.entries(walls).some(([name, row]) => name.endsWith('-10000') && row.reductionPercent >= 15);
assert.equal(thresholdMet, false, 'receipt ships only a rejected candidate');
const accuracy = json(join(root, 'accuracy.json'));
assert.equal(accuracy.length, 12);
const errors = [];
for (const deck of prepared.decks) {
  const pair = accuracy.filter(r => r.circuit === deck.circuit && r.size === deck.size);
  assert.equal(pair.length, 2);
  assert.deepEqual(pair[0].signals, pair[1].signals);
  assert.deepEqual(pair[0].output, pair[1].output);
  assert.equal(pair[0].output.outputSha256, result.outputHashes[`${deck.circuit}-${deck.size}`].control);
  const signals = pair[0].signals;
  assert.equal(signals.length, deck.actualNodes + 1);
  const worst = key => signals.reduce((a, b) => a[key] > b[key] ? a : b);
  errors.push({ circuit: deck.circuit, size: deck.size, signals: signals.length, unchanged: true,
    worstMaxAbsolute: worst('maxAbs'), worstRmsAbsolute: worst('rmsAbs'),
    worstMaxNormalized: worst('maxNormalized'), worstRmsNormalized: worst('rmsNormalized') });
}
const profiles = [];
for (const name of readdirSync(join(root, 'profile')).filter(n => /\.cpuprofile(?:\.gz)?$/.test(n))) {
  const profile = json(join(root, 'profile', name));
  const nodes = new Map(profile.nodes.map(n => [n.id, n.callFrame]));
  const totals = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const frame = nodes.get(profile.samples[i]);
    const key = `${frame.functionName} @ ${frame.url.split('/').at(-1)}:${frame.lineNumber + 1}`;
    const us = profile.timeDeltas[i]; total += us;
    totals.set(key, (totals.get(key) ?? 0) + us);
  }
  profiles.push({ name, sampledMicroseconds: total, top: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([frame, us]) => ({ frame, selfPercent: 100 * us / total })) });
}
assert.equal(profiles.length, 6);
writeFileSync(join(root, 'summary.json'), JSON.stringify({ baseSha: json(join(root, 'profile/prepared.json')).baseSha, samples: result.samples, budget, walls, thresholdMet, errors, profiles }, null, 2) + '\n');
console.log('Verified 180 cells, 60 native archives, 6 profiles, 12 accuracy cells. Gate missed; all signals unchanged.');
