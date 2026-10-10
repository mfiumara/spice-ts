#!/usr/bin/env node
// Cold-start check for issue #369: in a fresh process, time the first N calls
// of tokenizeNetlist on the scaling ladder for one implementation. A
// hand-written scanner starts in the interpreter while regexes are native, so
// the first calls can be slower even when the warm path is faster.
// Usage (driver): pnpm exec tsx benchmarks/results/issue-369/cold-start.mjs <out.json>
// Usage (child):  pnpm exec tsx benchmarks/results/issue-369/cold-start.mjs --child <legacy|current> <nodes>
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scalingLadder } from '../../performance/scaling-fixture.mjs';

const CALLS = 13; // 3 warmups + 10 runs, like bench:scaling
const args = process.argv.slice(2);

if (args[0] === '--child') {
  const impl = args[1] === 'legacy'
    ? await import('./legacy-tokenizer.mts')
    : await import('../../../packages/core/src/parser/tokenizer.ts');
  const netlist = scalingLadder(Number(args[2]));
  const times = [];
  for (let i = 0; i < CALLS; i++) {
    const start = performance.now();
    const lines = impl.tokenizeNetlist(netlist, { firstLineIsTitle: true });
    for (const line of lines) if (line.tokens[0][0] === 'R') impl.parseNumber(line.tokens[3]);
    times.push(performance.now() - start);
  }
  process.stdout.write(JSON.stringify(times));
} else {
  const output = args[0];
  if (!output) throw new Error('usage: cold-start.mjs <output.json>');
  const processes = 10;
  const script = fileURLToPath(import.meta.url);
  const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const result = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    command: `pnpm exec tsx benchmarks/results/issue-369/cold-start.mjs ${output}`,
    node: process.version,
    methodology: `${processes} fresh processes per implementation and size, alternating legacy/current; each times ${CALLS} consecutive tokenizeNetlist+parseNumber passes. Reported: median over processes of call #1, median over processes of the median of calls 4..13 (the bench:scaling measured window).`,
    sizes: {},
  };
  for (const nodes of [1000, 5000, 10000]) {
    const samples = { legacy: [], current: [] };
    for (let p = 0; p < processes; p++) {
      for (const impl of p % 2 === 0 ? ['legacy', 'current'] : ['current', 'legacy']) {
        const run = spawnSync(process.execPath, [...process.execArgv, script, '--child', impl, String(nodes)], { encoding: 'utf8' });
        if (run.status !== 0) throw new Error(run.stderr);
        samples[impl].push(JSON.parse(run.stdout));
      }
    }
    const summarize = runs => ({
      firstCallMedianMs: median(runs.map(times => times[0])),
      measuredWindowMedianMs: median(runs.map(times => median(times.slice(3)))),
    });
    result.sizes[nodes] = { legacy: summarize(samples.legacy), current: summarize(samples.current), raw: samples };
    console.log(nodes, JSON.stringify({ legacy: result.sizes[nodes].legacy, current: result.sizes[nodes].current }));
  }
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}
