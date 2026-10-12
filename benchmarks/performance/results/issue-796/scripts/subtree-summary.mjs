#!/usr/bin/env node
/**
 * Issue #796: self time inside one frame's subtree of a V8 .cpuprofile.
 *
 *   node benchmarks/performance/results/issue-796/scripts/subtree-summary.mjs <file.cpuprofile> <function> [top]
 *
 * Sums the self time of every frame called (transitively) from `<function>`,
 * so the cost of one phase (e.g. `compile`) can be split by callee.
 */
import { readFileSync } from 'node:fs';

const [file, target, topArg] = process.argv.slice(2);
if (!file || !target) throw new Error('usage: subtree-summary.mjs <file.cpuprofile> <function> [top]');
const top = Number(topArg ?? 20);
const profile = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(profile.nodes.map(node => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const label = node => {
  const frame = node.callFrame;
  const url = frame.url ? frame.url.replace(/^.*\/(packages|benchmarks)\//, '$1/') : '';
  return `${frame.functionName || '(anonymous)'} ${url ? `${url}:${frame.lineNumber + 1}` : ''}`.trim();
};
const inTarget = id => {
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    if (byId.get(cur).callFrame.functionName === target) return true;
  }
  return false;
};
const self = new Map();
let total = 0;
profile.samples.forEach((id, index) => {
  if (!inTarget(id)) return;
  const us = profile.timeDeltas[index] ?? 0;
  total += us;
  const key = label(byId.get(id));
  self.set(key, (self.get(key) ?? 0) + us);
});
console.log(`${target}: ${(total / 1000).toFixed(1)} ms sampled`);
for (const [key, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) {
  console.log(`${(us / 1000).toFixed(1).padStart(9)} ms ${(100 * us / total).toFixed(1).padStart(5)}%  ${key}`);
}
