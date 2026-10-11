#!/usr/bin/env node
// Issue #469: ngspice tests/general/rc.cir (`pulse (0 1)`, `.tran 0.1 7.0`, R=1, C=1)
// against its closed-form answer. ngspice-47 ramps v(1) over TR = TSTEP = 0.1,
// so v(2) = 10*(t - 1 + exp(-t)) up to 0.1 s, then 1 - (1 - v2(0.1))*exp(-(t - 0.1)).
// Usage (after `pnpm -C packages/core build`): node benchmarks/results/issue-469/rc-exact.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = 'benchmarks/corpus/ngspice/fixtures/tests/general/rc.cir';
const exact = t => {
  const ramp = s => 10 * (s - 1 + Math.exp(-s));
  return t <= 0.1 ? ramp(t) : 1 - (1 - ramp(0.1)) * Math.exp(-(t - 0.1));
};
const worst = (time, values) => {
  let max = 0;
  for (let i = 0; i < time.length; i++) max = Math.max(max, Math.abs(values[i] - exact(time[i])));
  return max;
};

const text = readFileSync(resolve(FIXTURE), 'utf8');
const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
const { transient } = await core.simulate(text);
const spiceTime = Array.from(transient.time);
const spiceV2 = Array.from(transient.voltage('2'));

const dir = mkdtempSync(join(tmpdir(), 'issue-469-rc-'));
writeFileSync(join(dir, 'deck.cir'), text.replace(/\.end\s*$/i, `.control\nrun\nwrdata ${join(dir, 'out.txt')} v(2)\n.endc\n.end\n`));
const run = spawnSync('ngspice', ['-b', 'deck.cir'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir } });
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const rows = readFileSync(join(dir, 'out.txt'), 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
console.log(JSON.stringify({
  spiceTs: { points: spiceTime.length, worstAbsErrorV2: worst(spiceTime, spiceV2) },
  ngspice: { points: rows.length, worstAbsErrorV2: worst(rows.map(r => r[0]), rows.map(r => r[1])) },
}, null, 2));
