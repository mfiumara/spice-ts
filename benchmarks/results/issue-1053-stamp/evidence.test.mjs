import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { quantile, summarize } from './check.mjs';
const directory = fileURLToPath(new URL('./run/', import.meta.url));
const load = file => {
  const path = join(directory, file);
  return existsSync(path) ? readFileSync(path) : gunzipSync(readFileSync(path + '.gz'));
};
const { decks } = JSON.parse(load('prepared.json'));
const rows = load('ab-receipts.jsonl').toString().trim().split('\n').map(JSON.parse);
const summary = JSON.parse(readFileSync(new URL('./summary.json', import.meta.url)));
test('80 complete cold cells reproduce the rejection and exact waveform identity', () => {
  assert.deepEqual(summarize(rows, decks), summary);
  assert.equal(summary.ship, false);
  assert.equal(summary.targetPass, false);
  assert.equal(summary.controlsPass, false);
  assert.equal(JSON.parse(load('ab-completed.json')).completed, 80);
  rows.forEach((row, i) => {
    const round = Math.floor(i / 8) + 1;
    const deck = decks[Math.floor((i % 8) / 2)];
    const modes = round % 2 === 1 ? ['control', 'candidate'] : ['candidate', 'control'];
    assert.equal(row.round, round);
    assert.equal(row.worker.circuit, deck.circuit);
    assert.equal(row.worker.size, deck.size);
    assert.equal(row.worker.mode, modes[i % 2]);
  });
});
test('decks and both retained bundles match their pre-measurement SHA-256 pins', () => {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const deck of decks) assert.equal(hash(load(deck.file)), deck.deckSha256);
  for (const mode of ['control', 'candidate']) {
    const bundle = JSON.parse(load(mode + '-bundle.json'));
    assert.equal(bundle.baseSha, '1e16230d7d396506e6f86f931d45ebf166b05eae');
    for (const [name, sha] of Object.entries(bundle.hashes)) assert.equal(hash(load(mode + '/' + name)), sha);
  }
});
test('checker rejects missing, duplicated, changed-output, and changed-deck samples', () => {
  assert.throws(() => summarize(rows.slice(1), decks));
  for (const corrupt of [
    data => { data[1] = structuredClone(data[0]); },
    data => { data[1].worker.output.outputSha256 = 'bad'; },
    data => { data[1].worker.deckSha256 = 'bad'; },
    data => { data[1].worker.convergence = null; },
  ]) {
    const data = structuredClone(rows); corrupt(data);
    assert.throws(() => summarize(data, decks));
  }
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
});
