#!/usr/bin/env node
/**
 * Summarise a V8 .cpuprofile: top self-time frames and top inclusive frames.
 *
 *   node benchmarks/performance/profile-summary.mjs <file.cpuprofile> [top]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const top = Number(process.argv[3] ?? 12);
if (!file) throw new Error('usage: profile-summary.mjs <file.cpuprofile> [top]');
const profile = JSON.parse(readFileSync(file, 'utf8'));

const byId = new Map(profile.nodes.map(node => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);

// Sample weights: V8 records the delta before each sample in timeDeltas (µs).
const selfUs = new Map();
profile.samples.forEach((id, index) => {
  selfUs.set(id, (selfUs.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
});
const label = node => {
  const frame = node.callFrame;
  const url = frame.url ? frame.url.replace(/^.*\/(packages|benchmarks)\//, '$1/') : '';
  return `${frame.functionName || '(anonymous)'} ${url ? `${url}:${frame.lineNumber + 1}` : ''}`.trim();
};

const self = new Map();
const inclusive = new Map();
let totalUs = 0;
for (const [id, us] of selfUs) {
  totalUs += us;
  const key = label(byId.get(id));
  self.set(key, (self.get(key) ?? 0) + us);
  const seen = new Set();
  for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
    const ancestor = label(byId.get(cursor));
    if (seen.has(ancestor)) continue;
    seen.add(ancestor);
    inclusive.set(ancestor, (inclusive.get(ancestor) ?? 0) + us);
  }
}

const print = (title, map) => {
  console.log(`\n${title}`);
  for (const [key, us] of [...map].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.log(`${(us / 1000).toFixed(1).padStart(10)} ms ${((100 * us) / totalUs).toFixed(1).padStart(5)}%  ${key}`);
  }
};
console.log(`${file}: ${profile.samples.length} samples, ${(totalUs / 1000).toFixed(1)} ms sampled`);
print('Top self time', self);
print('Top inclusive time', inclusive);
