import assert from 'node:assert/strict';
export function distribution(values) {
  assert(values.length > 0 && values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { count: sorted.length, median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, min: sorted[0], max: sorted.at(-1) };
}
export function cpuSelf(profile) {
  assert.equal(profile.samples.length, profile.timeDeltas.length);
  const nodes = new Map(profile.nodes.map(n => [n.id, n.callFrame.functionName]));
  const totals = {};
  for (let i = 0; i < profile.samples.length; i++) {
    assert(nodes.has(profile.samples[i]));
    const name = nodes.get(profile.samples[i]);
    totals[name] = (totals[name] ?? 0) + profile.timeDeltas[i] / 1000;
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([name, ms]) => ({ name, ms }));
}
