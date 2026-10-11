#!/usr/bin/env node
// Reproduces the issue-356 public-output hash receipt: one public simulate()
// call per fixture after `pnpm build`, SHA-256 over JSON.stringify(result).
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { simulate } from '../../../packages/core/dist/index.js';
import { scalingLadder } from '../../performance/scaling-fixture.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: output-hashes.mjs <output.json>');

const dcSweep = ['Issue 140 DC sweep', 'V1 in 0 DC 0', 'R1 in out 1k', 'R2 out 0 1k', '.dc V1 0 10 0.01', '.print dc v(out)', '.end'].join('\n');
const fixtures = [
  ['1000-node-op', scalingLadder(1000)],
  ['5000-node-op', scalingLadder(5000)],
  ['10000-node-op', scalingLadder(10000)],
  ['1001-point-dc-sweep', dcSweep],
];

const results = [];
for (const [fixture, netlist] of fixtures) {
  const json = JSON.stringify(await simulate(netlist));
  results.push({ fixture, sha256: createHash('sha256').update(json).digest('hex'), bytes: Buffer.byteLength(json) });
}

const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(output, `${JSON.stringify({
  commit: baseCommit,
  command: `node benchmarks/results/issue-369/output-hashes.mjs ${output}`,
  methodology: 'One public simulate() call per fixture after pnpm build; hashes cover the complete JSON result (issue-356 method).',
  results,
}, null, 2)}\n`);
console.log(results.map(r => `${r.fixture} ${r.sha256} ${r.bytes}`).join('\n'));
