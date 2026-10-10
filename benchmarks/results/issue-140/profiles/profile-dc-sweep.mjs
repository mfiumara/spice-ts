import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate } from '../../../../packages/core/dist/index.js';

const output = process.argv[2];
if (!output) throw new Error('usage: profile-dc-sweep.mjs <output.json>');
const netlist = ['Issue 140 DC sweep', 'V1 in 0 DC 0', 'R1 in out 1k', 'R2 out 0 1k', '.dc V1 0 10 0.01', '.print dc v(out)', '.end'].join('\n');
const runs = 10;
const warmups = 3;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (let i = 0; i < warmups; i++) await simulate(netlist);
const spiceTimes = [];
for (let i = 0; i < runs; i++) {
  const start = performance.now();
  await simulate(netlist);
  spiceTimes.push(performance.now() - start);
}
const directory = mkdtempSync(join(tmpdir(), 'spice-ts-issue-140-'));
const deck = join(directory, 'sweep.cir');
writeFileSync(deck, netlist);
const ngTimes = [];
let ngPeakRssMiB = 0;
try {
  for (let i = 0; i < warmups + runs; i++) {
    const start = performance.now();
    const result = spawnSync('/usr/bin/time', ['-l', 'ngspice', '-b', deck], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
    if (i >= warmups) ngTimes.push(performance.now() - start);
    const match = result.stderr.match(/(\d+)\s+maximum resident set size/i);
    if (match) ngPeakRssMiB = Math.max(ngPeakRssMiB, Number(match[1]) / 1024 / 1024);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
writeFileSync(output, `${JSON.stringify({
  command: `node benchmarks/results/issue-140/profiles/profile-dc-sweep.mjs ${output}`,
  netlistSha256: createHash('sha256').update(netlist).digest('hex'),
  methodology: { warmups, runs, statistic: 'median wall time', circuit: '1,001-point linear resistor-divider DC sweep; byte-identical netlist' },
  spiceTs: { timesMs: spiceTimes, medianMs: median(spiceTimes), peakRssMiB: process.resourceUsage().maxRSS / 1024 },
  ngspice: { timesMs: ngTimes, medianMs: median(ngTimes), peakRssMiB: ngPeakRssMiB },
}, null, 2)}\n`);
