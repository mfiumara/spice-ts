#!/usr/bin/env node
// Issue #890 (copied from issue-878): in-process interleaved A/B of two spice-ts dists on one M2
// scaling deck. Both dists are loaded into one process and simulate() is
// called alternately (order flipped every round) after one warm-up each, so
// both see the same host load over time. Reports wall and CPU (user+system)
// medians and the median of per-round ratios (base / branch, > 1 = branch
// faster).
//
//   node ab-inproc.mjs <circuit> <nodes> <rounds> <base-dist> <branch-dist>
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const [circuit, nodesText, roundsText, baseDist, branchDist] = process.argv.slice(2);
const netlist = m2Netlist(circuit, Number(nodesText)).netlist;
const builds = {
  base: (await import(pathToFileURL(`${baseDist}/index.js`).href)).simulate,
  branch: (await import(pathToFileURL(`${branchDist}/index.js`).href)).simulate,
};
for (const simulate of Object.values(builds)) await simulate(netlist);

async function measure(simulate) {
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  await simulate(netlist);
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  return { wall, cpu: (cpu.user + cpu.system) / 1000 };
}

const samples = { base: [], branch: [] };
for (let round = 0; round < Number(roundsText); round++) {
  const order = round % 2 ? ['branch', 'base'] : ['base', 'branch'];
  for (const build of order) samples[build].push(await measure(builds[build]));
}
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const report = { circuit, nodes: Number(nodesText), rounds: Number(roundsText) };
for (const key of ['wall', 'cpu']) {
  report[key] = {
    base: Number(median(samples.base.map(s => s[key])).toFixed(1)),
    branch: Number(median(samples.branch.map(s => s[key])).toFixed(1)),
    speedup: Number(median(samples.base.map((s, i) => s[key] / samples.branch[i][key])).toFixed(3)),
    speedupRange: [
      Math.min(...samples.base.map((s, i) => s[key] / samples.branch[i][key])).toFixed(3),
      Math.max(...samples.base.map((s, i) => s[key] / samples.branch[i][key])).toFixed(3),
    ],
  };
}
console.log(JSON.stringify(report));
