#!/usr/bin/env node
/**
 * Issue #486 paired A/B: fresh-process samples of two @spice-ts/core builds
 * on the M2 scaling cells, appending one JSON line per sample to <out.jsonl>.
 *
 *   node benchmarks/results/issue-486/ab.mjs <before-dist> <after-dist> <rounds> <out.jsonl> [--concurrent] [circuit:nodes ...]
 *
 * Default: before and after run one after the other, order alternating per
 * round. --concurrent starts both samples of a pair at the same moment (two
 * processes on separate cores), so both see the same machine load; use it on
 * a shared, loaded machine.
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [before, after, roundsArg, out, ...rest] = process.argv.slice(2);
if (!before || !after || !roundsArg || !out) {
  throw new Error('usage: ab.mjs <before> <after> <rounds> <out.jsonl> [--concurrent] [circuit:nodes ...]');
}
const concurrent = rest.includes('--concurrent');
const cellArgs = rest.filter(arg => arg !== '--concurrent');
const cells = (cellArgs.length > 0 ? cellArgs : [
  'rc-ladder-tran:1000', 'rc-ladder-tran:10000', 'rc-ladder-tran:50000',
  'resistor-mesh-op:1000', 'resistor-mesh-op:10000', 'resistor-mesh-op:50000',
  'cmos-inverter-chain-tran:1000', 'cmos-inverter-chain-tran:10000',
]).map(cell => cell.split(':'));
const sample = join(dirname(fileURLToPath(import.meta.url)), 'sample.mjs');
const variants = [['before', before], ['after', after]];

function runSample(variant, dist, circuit, nodes, round) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [sample, dist, circuit, nodes]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => {
      if (code !== 0) reject(new Error(`${variant} ${circuit} ${nodes}: ${stderr}`));
      else resolvePromise({ round, variant, mode: concurrent ? 'concurrent' : 'sequential', ...JSON.parse(stdout.trim().split('\n').pop()) });
    });
  });
}

function record(row) {
  appendFileSync(out, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify(row));
}

for (let round = 0; round < Number(roundsArg); round++) {
  for (const [circuit, nodes] of cells) {
    const order = round % 2 === 0 ? variants : [...variants].reverse();
    if (concurrent) {
      const rows = await Promise.all(order.map(([variant, dist]) => runSample(variant, dist, circuit, nodes, round)));
      rows.forEach(record);
    } else {
      for (const [variant, dist] of order) record(await runSample(variant, dist, circuit, nodes, round));
    }
  }
}
