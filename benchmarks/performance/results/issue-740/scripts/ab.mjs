#!/usr/bin/env node
/**
 * Issue #740 paired A/B: fresh-process samples of two @spice-ts/core builds
 * on the AC cells, one JSON line per sample appended to <out.jsonl> (probe
 * values dropped, see sample.mjs). Both samples of a pair start at the same
 * moment (two processes, separate cores), so they see the same machine load;
 * the order of a pair alternates per round. Run it under spice-heavy.
 *
 *   node benchmarks/performance/results/issue-740/scripts/ab.mjs <before-dist> <after-dist> <rounds> <out.jsonl> [--no-warmup] circuit:nodes ...
 *
 * Summarise with benchmarks/results/issue-486/ab-summary.mjs <out.jsonl> [--cpu].
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [before, after, roundsArg, out, ...rest] = process.argv.slice(2);
const cellArgs = rest.filter(arg => !arg.startsWith('--'));
const sampleFlags = rest.filter(arg => arg === '--no-warmup');
if (!before || !after || !roundsArg || !out || cellArgs.length === 0) {
  throw new Error('usage: ab.mjs <before> <after> <rounds> <out.jsonl> [--no-warmup] circuit:nodes ...');
}
const cells = cellArgs.map(cell => cell.split(':'));
const sample = join(dirname(fileURLToPath(import.meta.url)), 'sample.mjs');
const variants = [['before', before], ['after', after]];

function runSample(variant, dist, circuit, nodes, round) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=8192', sample, dist, circuit, nodes, ...sampleFlags]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code !== 0) {
        resolvePromise({ round, variant, mode: 'concurrent', circuit, nodes: Number(nodes), failed: stderr.trim().split('\n').slice(-3).join(' ') });
        return;
      }
      const { probeValues, frequencies, ...row } = JSON.parse(stdout.trim().split('\n').pop());
      resolvePromise({ round, variant, mode: 'concurrent', ...row });
    });
    child.on('error', reject);
  });
}

for (let round = 0; round < Number(roundsArg); round++) {
  for (const [circuit, nodes] of cells) {
    const order = round % 2 === 0 ? variants : [...variants].reverse();
    const rows = await Promise.all(order.map(([variant, dist]) => runSample(variant, dist, circuit, nodes, round)));
    for (const row of rows) {
      appendFileSync(out, `${JSON.stringify(row)}\n`);
      console.log(JSON.stringify(row));
    }
  }
}
