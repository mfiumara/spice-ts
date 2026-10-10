#!/usr/bin/env node
// Interleaved parse-front-end microbenchmark for issue #369: the pre-#369
// tokenizer (legacy-tokenizer.mts, verbatim base copy) versus the current
// packages/core/src/parser/tokenizer.ts, in the same process, alternating
// which runs first each round so machine load affects both sides equally.
// Workload: the 10k-node DC scaling ladder (benchmarks/performance) — the full
// tokenizeNetlist pass and parseNumber over every resistor value token.
// Run with: pnpm exec tsx benchmarks/results/issue-369/tokenizer-microbench.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as current from '../../../packages/core/src/parser/tokenizer.ts';
import * as legacy from './legacy-tokenizer.mts';
import { scalingLadder } from '../../performance/scaling-fixture.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: tokenizer-microbench.mjs <output.json>');
const nodes = 10000;
const warmups = 20;
const runs = 60;
const netlist = scalingLadder(nodes);
const values = current.tokenizeNetlist(netlist).filter(line => line.tokens[0].startsWith('R')).map(line => line.tokens[3]);
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

if (JSON.stringify(current.tokenizeNetlist(netlist)) !== JSON.stringify(legacy.tokenizeNetlist(netlist))) {
  throw new Error('implementations disagree on the benchmark netlist');
}

let sink = 0;
const workloads = {
  tokenizeNetlist: impl => () => { sink += impl.tokenizeNetlist(netlist, { firstLineIsTitle: true }).length; },
  parseNumber: impl => () => { for (const value of values) sink += impl.parseNumber(value); },
};

function time(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

const result = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain', 'packages/core/src/parser/tokenizer.ts'], { encoding: 'utf8' }).trim() !== '',
  command: `pnpm exec tsx benchmarks/results/issue-369/tokenizer-microbench.mjs ${output}`,
  node: process.version,
  methodology: { nodes, warmups, runs, statistic: 'median wall time per full pass; legacy/current interleaved, order alternating per round', parseNumberTokens: values.length },
  workloads: {},
};

for (const [name, make] of Object.entries(workloads)) {
  const legacyFn = make(legacy);
  const currentFn = make(current);
  for (let i = 0; i < warmups; i++) { legacyFn(); currentFn(); }
  const legacyTimes = [];
  const currentTimes = [];
  for (let i = 0; i < runs; i++) {
    if (i % 2 === 0) { legacyTimes.push(time(legacyFn)); currentTimes.push(time(currentFn)); }
    else { currentTimes.push(time(currentFn)); legacyTimes.push(time(legacyFn)); }
  }
  const before = median(legacyTimes);
  const after = median(currentTimes);
  result.workloads[name] = {
    before: { medianMs: before, timesMs: legacyTimes },
    after: { medianMs: after, timesMs: currentTimes },
    speedup: before / after,
  };
  console.log(`${name}: before ${before.toFixed(3)} ms, after ${after.toFixed(3)} ms, ${(before / after).toFixed(2)}x`);
}
result.sink = sink;
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
