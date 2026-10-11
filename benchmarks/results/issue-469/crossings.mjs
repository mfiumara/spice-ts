#!/usr/bin/env node
// Issue #469 probe: first rising 0.33 V crossing of v(8) on the unchanged
// ngspice mesa-oscillator fixture, spice-ts vs ngspice-47 on the same bytes.
// Usage (after `pnpm -C packages/core build`):
//   node benchmarks/results/issue-469/crossings.mjs [--converged]
// --converged appends `.options reltol=1e-6` and TMAX 0.1 ps to BOTH decks
// (the same edit in both engines), giving the reference both engines approach.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIXTURE = 'benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir';
const THRESHOLD = 0.33;
const converged = process.argv.includes('--converged');

function deck() {
  let text = readFileSync(resolve(FIXTURE), 'utf8');
  if (converged) {
    text = text.replace('.tran 1p 5n 1n 20p', '.options reltol=1e-6\n.tran 1p 5n 1n 0.1p');
  }
  return text;
}

function crossings(time, values, count = 3) {
  const result = [];
  for (let i = 1; i < time.length && result.length < count; i++) {
    if (values[i - 1] < THRESHOLD && values[i] >= THRESHOLD) {
      const f = (THRESHOLD - values[i - 1]) / (values[i] - values[i - 1]);
      result.push(time[i - 1] + f * (time[i] - time[i - 1]));
    }
  }
  return result;
}

async function spiceTs(text) {
  const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
  const started = performance.now();
  const result = await core.simulate(text);
  const elapsed = performance.now() - started;
  const time = Array.from(result.transient.time);
  const v8 = Array.from(result.transient.voltage('8'));
  return { points: time.length, ms: Math.round(elapsed), crossings: crossings(time, v8) };
}

function ngspice(text) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-469-'));
  const control = `\n.control\nrun\nwrdata ${join(dir, 'out.txt')} v(8)\n.endc\n`;
  // wrdata replaces the deck's .print (40001 printed rows make ngspice exit non-zero).
  const body = text.replace(/^\.print.*$/im, '').replace(/\.end\s*$/i, `${control}.end\n`);
  writeFileSync(join(dir, 'deck.cir'), body);
  const run = spawnSync('ngspice', ['-b', 'deck.cir'], { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir } });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
  const rows = readFileSync(join(dir, 'out.txt'), 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  return { points: rows.length, crossings: crossings(rows.map(r => r[0]), rows.map(r => r[1])) };
}

const text = deck();
const ng = ngspice(text);
const st = await spiceTs(text);
const ps = value => (value * 1e12).toFixed(2);
console.log(JSON.stringify({
  converged,
  ngspice: { points: ng.points, crossingsPs: ng.crossings.map(ps) },
  spiceTs: { points: st.points, ms: st.ms, crossingsPs: st.crossings.map(ps) },
  firstCrossingDeltaPs: ps(st.crossings[0] - ng.crossings[0]),
}, null, 2));
