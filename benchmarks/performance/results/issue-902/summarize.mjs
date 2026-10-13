// Shape: nine circuit/size summaries plus all unsuccessful process receipts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { M2_CIRCUITS, m2Netlist } from '../../scaling-m2-fixture.mjs';
const dir = new URL('./', import.meta.url);
const rows = readFileSync(new URL('samples.jsonl', dir), 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length, 63, '54 original samples + 3 profiles + 6 mesh retries');
const stats = values => {
  assert(values.length > 0 && values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
};
const summaries = [];
for (const circuit of M2_CIRCUITS) for (const size of [1000, 10000, 50000]) {
  const fixture = m2Netlist(circuit, size);
  const hash = createHash('sha256').update(fixture.netlist).digest('hex');
  assert.equal(createHash('sha256').update(readFileSync(new URL(`decks/${circuit}-${size}.cir`, dir))).digest('hex'), hash);
  const selected = rows.filter(r => r.circuit === circuit && r.size === size && !r.profile && Boolean(r.retry) === (circuit === 'resistor-mesh-op' && size === 50000));
  assert.equal(selected.length, 6);
  for (const row of selected) assert.equal(row.netlistSha256, hash);
  const engines = {};
  for (const engine of ['spice-ts', 'ngspice']) {
    const samples = selected.filter(r => r.engine === engine);
    assert.equal(samples.length, 3);
    const ok = samples.filter(r => r.status === 'ok');
    engines[engine] = { statuses: samples.map(r => r.status), ...(ok.length ? { internalMs: stats(ok.map(r => r.ms)), wallMs: stats(ok.map(r => r.wallMs)), peakRssMiB: stats(ok.map(r => r.peakRssMiB)), points: ok.map(r => r.grid.length) } : {}) };
  }
  const a = selected.find(r => r.engine === 'spice-ts' && r.status === 'ok');
  const b = selected.find(r => r.engine === 'ngspice' && r.status === 'ok');
  let parity = { unavailable: 'no completed ngspice reference within 45 s budget' };
  if (a && b) {
    assert.equal(a.grid.length, b.grid.length);
    let maxTimeDelta = 0, maxAbs = 0, squared = 0, peak = 0;
    for (let i = 0; i < a.grid.length; i++) {
      assert(Number.isFinite(a.values[i]) && Number.isFinite(b.values[i]));
      const delta = Math.abs(a.grid[i] - b.grid[i]);
      assert(delta <= 1e-6 * Math.max(Math.abs(a.grid[i]), 1e-15), 'printed grid must match to its precision');
      maxTimeDelta = Math.max(maxTimeDelta, delta);
      const diff = Math.abs(a.values[i] - b.values[i]);
      maxAbs = Math.max(maxAbs, diff); squared += diff * diff; peak = Math.max(peak, Math.abs(b.values[i]));
    }
    const rmsAbs = Math.sqrt(squared / a.grid.length);
    parity = { probe: fixture.probe, points: a.grid.length, maxTimeDelta, maxAbs, rmsAbs, maxPeakRelative: maxAbs / peak, rmsPeakRelative: rmsAbs / peak,
      precision: 'ngspice unmodified .print / OP listing, about 6 significant digits; not full-precision or all-node parity' };
  }
  summaries.push({ circuit, size, actualNodes: fixture.actualNodes, sha256: hash, engines, parity });
}
const profiles = [];
for (const circuit of M2_CIRCUITS) {
  const file = `profiles/${circuit}-50000.cpuprofile`;
  const p = JSON.parse(readFileSync(new URL(file, dir)));
  const nodes = new Map(p.nodes.map(n => [n.id, n.callFrame]));
  const self = new Map(); let total = 0;
  p.samples.forEach((id, i) => {
    const f = nodes.get(id), key = `${f.functionName || '(anonymous)'} ${f.url}:${f.lineNumber + 1}`;
    const us = p.timeDeltas[i]; total += us; self.set(key, (self.get(key) ?? 0) + us);
  });
  profiles.push({ circuit, file, sampledMs: total / 1000, topSelf: [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([frame, us]) => ({ frame, ms: us / 1000, percent: 100 * us / total })) });
}
const report = { processReceipts: rows.length, summaries, profiles, failures: rows.filter(r => r.status !== 'ok').map(({ grid, values, ...receipt }) => receipt) };
writeFileSync(new URL('summary.json', dir), JSON.stringify(report, null, 2) + '\n');
for (const s of summaries) console.log(s.circuit, s.size, JSON.stringify(s.engines), JSON.stringify(s.parity));
for (const p of profiles) console.log(p.circuit, JSON.stringify(p.topSelf.slice(0, 8)));
console.log('Verified', rows.length, 'process receipts,', summaries.length, 'matrix pairs and', profiles.length, 'profiles');
