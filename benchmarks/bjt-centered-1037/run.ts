import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseNgspiceRaw } from '../comparison-harness.js';
import { probe, REST } from '../../packages/core/src/analysis/transient-centered-1037.fixtures.js';

async function main() {
const here = resolve('benchmarks/bjt-centered-1037');
const local = resolve(here, 'local');
mkdirSync(local, { recursive: true });
const rows = [];
for (const [id, text] of [['rest', REST], ['nanosecond-control', REST.replace('.tran 100f 10p', '.tran 1n 100n')]]) {
  const path = resolve(local, `${id}.cir`);
  const raw = resolve(local, `${id}.raw`);
  writeFileSync(path, text);
  const before = await probe(text, false);
  const candidate = await probe(text, true);
  const args = ['-n', '-b', '-r', raw, path];
  const start = performance.now();
  const native = spawnSync('ngspice', args, { encoding: 'utf8', timeout: 120_000, env: { ...process.env, SPICE_ASCIIRAWFILE: '1' } });
  const runtimeMs = performance.now() - start;
  assert.equal(native.status, 0, native.stderr);
  const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(plot => /transient/i.test(plot.plotName))!;
  assert.ok(plot);
  writeFileSync(resolve(local, `${id}.stdout`), native.stdout);
  writeFileSync(resolve(local, `${id}.stderr`), native.stderr);
  rows.push({ id, sha256: createHash('sha256').update(text).digest('hex'), before, candidate, native: { command: ['ngspice', ...args], exitCode: native.status, runtimeMs, points: plot.grid.length, time: plot.grid.at(-1), firstPoints: plot.grid.slice(0, 5).map((time, i) => ({ time, signals: Object.fromEntries(Object.entries(plot.signals).map(([name, values]) => [name, values[i].re])) })) } });
  console.log(id, before.error, candidate.error, 'native', plot.grid.length);
}
const sources = ['packages/core/src/analysis/transient-centered-1037.fixtures.ts', 'benchmarks/bjt-centered-1037/run.ts'];
writeFileSync(resolve(here, 'receipt.json.gz'), gzipSync(JSON.stringify({ base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sources: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), environment: { node: process.version, cpu: cpus()[0].model, platform: process.platform, arch: process.arch, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim() }, hypothesis: 'Post-assembly centering x = anchor + solve(A, b - A*anchor); not device-centered assembly', rows }, null, 2) + '\n'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
