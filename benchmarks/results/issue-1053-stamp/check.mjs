import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
export function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
export function summarize(rows, decks) {
  assert.equal(rows.length, 80);
  const keys = new Set();
  for (const row of rows) {
    assert.equal(row.code, 0);
    assert.ok(Number.isInteger(row.round) && row.round >= 1 && row.round <= 10);
    const w = row.worker;
    assert.ok(['control', 'candidate'].includes(w.mode));
    const deck = decks.find(d => d.circuit === w.circuit && d.size === w.size);
    assert.ok(deck, 'unknown deck');
    assert.equal(w.deckSha256, deck.deckSha256);
    assert.ok(Number.isFinite(w.phases.api) && w.phases.api > 0);
    const key = [row.round, w.circuit, w.size, w.mode].join('/');
    assert.ok(!keys.has(key), 'duplicate cell'); keys.add(key);
  }
  const result = decks.map(deck => {
    const cells = rows.filter(r => r.worker.circuit === deck.circuit && r.worker.size === deck.size);
    const reference = cells[0].worker;
    for (const { worker: w } of cells) {
      assert.deepEqual(w.output, reference.output, 'complete output differs');
      assert.deepEqual(w.convergence, reference.convergence, 'convergence differs');
      assert.deepEqual(w.grid, reference.grid);
      assert.deepEqual(w.probe, reference.probe);
    }
    const modes = Object.fromEntries(['control', 'candidate'].map(mode => {
      const samples = cells.filter(r => r.worker.mode === mode).map(r => r.worker.phases.api);
      assert.equal(samples.length, 10);
      const q1 = quantile(samples, 0.25), q3 = quantile(samples, 0.75);
      return [mode, { medianMs: quantile(samples, 0.5), q1Ms: q1, q3Ms: q3, iqrMs: q3 - q1, samples }];
    }));
    return { ...deck, ...modes, changePercent: (modes.candidate.medianMs / modes.control.medianMs - 1) * 100, output: reference.output, convergence: reference.convergence };
  });
  const target = result.find(d => d.circuit.startsWith('cmos') && d.size === 10000);
  const controls = result.filter(d => !d.circuit.startsWith('cmos'));
  const targetPass = target.changePercent <= -15;
  const controlsPass = controls.every(d => d.changePercent <= 3);
  return { cells: rows.length, rounds: 10, bitIdentical: true, targetPass, controlsPass, ship: targetPass && controlsPass, results: result };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.argv[2]);
  const rows = readFileSync(join(out, 'ab-receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const { decks } = JSON.parse(readFileSync(join(out, 'prepared.json')));
  const summary = summarize(rows, decks);
  writeFileSync(join(out, '..', 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
