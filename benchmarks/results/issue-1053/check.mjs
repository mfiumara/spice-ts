// Offline evidence checker. Reject incomplete matrices, drift and unequal diagnostics.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { m2Netlist } from '../../performance/scaling-m2-fixture.mjs';
import { statistics, parseRaw, hashVectors } from '../../performance/rc1k-attribution-data.mjs';
const out = resolve(process.argv[2] ?? 'benchmarks/results/issue-1053/run');
const rows = readFileSync(join(out, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length, 82);
assert.equal(JSON.parse(readFileSync(join(out, 'completed.json'))).completed, 82);
assert.equal(new Set(rows.map(r => r.id)).size, 82);
for (const row of rows.filter(r => r.worker.mode === 'ngspice')) {
  const raw = gunzipSync(readFileSync(join(out, row.id + '.raw.gz')));
  assert.deepEqual(hashVectors(parseRaw(raw)), row.worker.output);
}
const prepared = JSON.parse(readFileSync(join(out, 'prepared.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [name, expected] of Object.entries(prepared.hashes)) {
  let bytes;
  try { bytes = readFileSync(join(out, name)); } catch { bytes = gunzipSync(readFileSync(join(out, name + '.gz'))); }
  assert.equal(hash(bytes), expected, name);
}
const summary = [];
for (const deck of prepared.decks) {
  assert.equal(hash(m2Netlist(deck.circuit, deck.size).netlist), deck.deckSha256);
  let deckBytes;
  try { deckBytes = readFileSync(join(out, deck.file)); } catch { deckBytes = gunzipSync(readFileSync(join(out, deck.file + '.gz'))); }
  assert.equal(hash(deckBytes), deck.deckSha256);
  const cells = rows.filter(r => r.worker.circuit === deck.circuit && r.worker.size === deck.size && r.round > 0);
  assert.equal(cells.length, 20);
  const byMode = {};
  for (const mode of ['control', 'ngspice']) {
    const samples = cells.filter(r => r.worker.mode === mode);
    assert.equal(samples.length, 10);
    assert.deepEqual(samples.map(r => r.round), [1,2,3,4,5,6,7,8,9,10]);
    for (const r of samples) { assert.equal(r.code, 0); assert.equal(r.worker.deckSha256, deck.deckSha256); }
    assert.equal(new Set(samples.map(r => r.worker.output.outputSha256)).size, 1);
    byMode[mode] = Object.fromEntries(Object.keys(samples[0].worker.phases).map(key => [key, statistics(samples.map(r => r.worker.phases[key]))]));
  }
  const spice = cells.find(r => r.worker.mode === 'control').worker;
  const native = cells.find(r => r.worker.mode === 'ngspice').worker;
  let accuracy = null;
  if (spice.grid) {
    const peak = Math.max(...native.probe.map(Math.abs));
    let sum = 0, max = 0, j = 0;
    for (let i = 0; i < spice.grid.length; i++) {
      const t = spice.grid[i];
      while (j + 1 < native.grid.length - 1 && native.grid[j + 1] < t) j++;
      const w = (t - native.grid[j]) / (native.grid[j + 1] - native.grid[j]);
      const expected = native.probe[j] + w * (native.probe[j + 1] - native.probe[j]);
      const error = Math.abs(spice.probe[i] - expected) / peak;
      max = Math.max(max, error); sum += error * error;
    }
    accuracy = { probe: deck.circuit.startsWith('cmos') ? 'v(s20)' : 'v(n10)', interpolation: 'native linear interpolation onto spice-ts grid; errors normalized to native probe peak', maxPeakRelative: max, rmsPeakRelative: Math.sqrt(sum / spice.grid.length) };
  }
  const diagnostics = rows.find(r => r.round === 0 && r.worker.circuit === deck.circuit && r.worker.size === deck.size)?.worker ?? null;
  if (diagnostics) {
    assert.equal(diagnostics.output.outputSha256, spice.output.outputSha256);
    assert.deepEqual(diagnostics.convergence, spice.convergence);
    assert.equal(spice.grid.length, 214);
    assert.equal(native.grid.length, 214);
    assert.equal(spice.convergence.transient.acceptedSteps, 213);
    assert.equal(spice.convergence.transient.rejectedSteps, 0);
    assert.equal(spice.convergence.transient.lteRetries, 0);
    assert.equal(spice.convergence.transient.newtonIterations, 466);
    assert.equal(native.native['Transient iterations'], 483);
    assert.equal(native.native['Rejected timepoints'], 0);
  }
  summary.push({ ...deck, times: byMode, spiceToNativeWall: byMode.control.api.median / byMode.ngspice.nativeWall.median, counts: { spice: spice.convergence, native: native.native, spiceOutputPoints: spice.grid?.length ?? null, nativeOutputPoints: native.grid?.length ?? null }, accuracy, diagnostics });
}
console.log(JSON.stringify({ verified: true, samples: rows.length, summary }, null, 2));
