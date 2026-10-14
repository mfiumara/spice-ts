// Accuracy row = deck pin + mode + every common voltage/current signal's matched-grid errors.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseRaw, hashVectors } from '../../performance/rc1k-attribution-data.mjs';
const directory = resolve(process.argv[2]);
const rows = readFileSync(join(directory, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const prepared = JSON.parse(readFileSync(join(directory, 'prepared.json')));
const report = [];
for (const deck of prepared.decks) {
  const row = rows.find(r => r.circuit === deck.circuit && r.size === deck.size && r.mode === 'ngspice');
  const payload = gunzipSync(readFileSync(join(directory, 'native-payloads', row.rawPayloadSha256 + '.bin.gz')));
  const raw = Buffer.concat([gunzipSync(readFileSync(join(directory, row.id + '.header.gz'))), payload]);
  if (createHash('sha256').update(raw).digest('hex') !== row.rawSha256) throw new Error('native pin drift');
  const reference = new Map(parseRaw(raw));
  const nativeGrid = reference.get('time');
  for (const mode of ['control', 'candidate']) {
    const core = await import(pathToFileURL(join(directory, mode, 'index.js')));
    const result = await core.simulate(await core.parseAsync(readFileSync(join(directory, deck.file), 'utf8')));
    const vectors = [];
    if (result.dc) {
      for (const [name, value] of result.dc.voltages) vectors.push(['dc-v:' + name, [value]]);
      for (const [name, value] of result.dc.currents) vectors.push(['dc-i:' + name, [value]]);
    }
    if (result.transient) {
      vectors.push(['time', result.transient.time]);
      for (const [name, data] of result.transient.voltages) vectors.push(['tran-v:' + name, data]);
      for (const [name, data] of result.transient.currents) vectors.push(['tran-i:' + name, data]);
    }
    const output = hashVectors(vectors);
    const pinned = rows.find(r => r.circuit === deck.circuit && r.size === deck.size && r.mode === mode).worker.evidence.output;
    if (output.outputSha256 !== pinned.outputSha256) throw new Error('TS output drift');
    const signals = [];
    for (const [name, actual] of vectors) {
      if (name === 'time' || (nativeGrid && name.startsWith('dc-'))) continue;
      const expected = reference.get(name.replace(/^dc-/, 'tran-'));
      if (!expected) throw new Error('missing native signal ' + name);
      let k = 1, peak = 0, maxAbs = 0, sq = 0, count = 0;
      for (let i = 0; i < expected.length; i++) {
        const t = nativeGrid?.[i];
        const grid = result.transient?.time;
        let value = actual[i];
        if (grid) {
          if (t < grid[0] || t > grid.at(-1)) continue;
          while (k < grid.length - 1 && grid[k] < t) k++;
          value = grid[k] === grid[k - 1] ? actual[k] : actual[k - 1] + (actual[k] - actual[k - 1]) * (t - grid[k - 1]) / (grid[k] - grid[k - 1]);
        }
        const error = Math.abs(value - expected[i]);
        if (!Number.isFinite(error)) throw new Error('nonfinite error');
        peak = Math.max(peak, Math.abs(expected[i])); maxAbs = Math.max(maxAbs, error); sq += error * error; count++;
      }
      if (!count) throw new Error('no matched points');
      const scale = Math.max(peak, name.includes('-i:') ? 1e-12 : 1e-6);
      signals.push({ name, count, maxAbs, rmsAbs: Math.sqrt(sq / count), scale, maxNormalized: maxAbs / scale, rmsNormalized: Math.sqrt(sq / count) / scale });
    }
    report.push({ circuit: deck.circuit, size: deck.size, mode, deckSha256: deck.deckSha256, output, signals });
  }
}
writeFileSync(join(directory, '../accuracy.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Compared all signals for', report.length, 'engine/deck cells');
