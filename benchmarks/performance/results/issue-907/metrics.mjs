import assert from 'node:assert/strict';
// Extract one real-valued plot/probe without expanding every node's raw vector.
export function binaryProbe(raw, probe) {
  const marker = Buffer.from('Binary:\n');
  const offset = raw.indexOf(marker);
  assert(offset >= 0, 'missing binary raw payload');
  const header = raw.subarray(0, offset).toString('utf8');
  assert.match(header, /Flags:\s+real\s/);
  const variables = Number(header.match(/No\. Variables:\s+(\d+)/)?.[1]);
  const points = Number(header.match(/No\. Points:\s+(\d+)/)?.[1]);
  assert(Number.isInteger(variables) && variables > 0 && Number.isInteger(points) && points > 0);
  const entries = [...header.matchAll(/^\s*(\d+)\s+(\S+)\s+(\S+)\s*$/gm)];
  const index = Number(entries.find(row => row[2].toLowerCase() === `v(${probe})`.toLowerCase())?.[1]);
  assert(Number.isInteger(index) && index >= 0 && index < variables, 'missing voltage probe');
  const timeIndex = Number(entries.find(row => row[2] === 'time')?.[1]);
  const start = offset + marker.length;
  assert.equal(raw.length, start + points * variables * 8, 'unexpected raw payload length or multiple plots');
  const grid = [], values = [];
  for (let point = 0; point < points; point++) {
    grid.push(Number.isInteger(timeIndex) ? raw.readDoubleLE(start + (point * variables + timeIndex) * 8) : 0);
    values.push(raw.readDoubleLE(start + (point * variables + index) * 8));
  }
  assert(grid.every(Number.isFinite) && values.every(Number.isFinite));
  return { grid, values, variables, points };
}
export function errors(actual, reference) {
  assert.equal(actual.values.length, reference.values.length, 'probe count mismatch');
  assert.equal(actual.grid.length, reference.grid.length, 'grid count mismatch');
  const peak = Math.max(...reference.values.map(Math.abs));
  let maxAbs = 0, square = 0, maxGridAbs = 0;
  for (let i = 0; i < actual.values.length; i++) {
    assert(Number.isFinite(actual.values[i]) && Number.isFinite(reference.values[i]));
    const gridDiff = Math.abs(actual.grid[i] - reference.grid[i]);
    assert(gridDiff <= Math.max(1e-24, Math.abs(reference.grid[i]) * 1e-12), 'unmatched time grid');
    maxGridAbs = Math.max(maxGridAbs, gridDiff);
    const diff = Math.abs(actual.values[i] - reference.values[i]);
    maxAbs = Math.max(maxAbs, diff); square += diff * diff;
  }
  const rmsAbs = Math.sqrt(square / actual.values.length);
  return { points: actual.values.length, maxAbs, rmsAbs, maxPeakRelative: maxAbs / peak, rmsPeakRelative: rmsAbs / peak, maxGridAbs };
}
