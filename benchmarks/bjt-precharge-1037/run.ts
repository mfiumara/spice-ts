import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseNgspiceRaw } from '../comparison-harness.js';
import { REST } from '../../packages/core/src/analysis/transient-centered-1037.fixtures.js';
import { probePrecharge } from '../../packages/core/src/analysis/transient-precharge-1037.fixtures.js';

async function main() {
  const here = resolve('benchmarks/bjt-precharge-1037');
  const local = resolve(here, 'local');
  mkdirSync(local, { recursive: true });
  const rows = [];
  for (const [id, text] of [
    ['rest', REST],
    ['nanosecond-control', REST.replace('.tran 100f 10p', '.tran 1n 100n')],
    ['moving-control', REST.replace('V1 c 0 46.5', 'V1 c 0 PWL(0 46.5 2p 46.5 5p 46.4 10p 46.4)')],
  ]) {
    const path = resolve(local, `${id}.cir`);
    const raw = resolve(local, `${id}.raw`);
    writeFileSync(path, text);
    const before = await probePrecharge(text, false);
    const candidate = await probePrecharge(text, true);
    const args = ['-n', '-b', '-r', raw, path];
    const start = performance.now();
    const native = spawnSync('ngspice', args, { encoding: 'utf8', timeout: 120_000, env: { ...process.env, SPICE_ASCIIRAWFILE: '1' } });
    const runtimeMs = performance.now() - start;
    assert.equal(native.status, 0, native.stderr);
    const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(plot => /transient/i.test(plot.plotName));
    assert.ok(plot);
    writeFileSync(resolve(local, `${id}.stdout`), native.stdout);
    writeFileSync(resolve(local, `${id}.stderr`), native.stderr);
    const points = plot.grid.map((time, i) => ({ time, vbe: plot.signals['v(@q1[vbe])'][i].re, vbc: plot.signals['v(@q1[vbc])'][i].re }));
    rows.push({ id, deck: text, sha256: createHash('sha256').update(text).digest('hex'), before, candidate, native: { command: ['ngspice', ...args], exitCode: native.status, runtimeMs, rawSha256: createHash('sha256').update(readFileSync(raw)).digest('hex'), points } });
    console.log(id, 'baseline', before.error, before.points.length, 'candidate', candidate.error, candidate.points.length, 'native', points.length);
  }
  const sources = ['packages/core/src/analysis/transient-precharge-1037.fixtures.ts', 'packages/core/src/analysis/transient-centered-1037.fixtures.ts', 'packages/core/src/devices/bjt.ts', 'packages/core/src/devices/charge-state.ts', 'packages/core/src/mna/companion.ts', 'benchmarks/bjt-precharge-1037/run.ts'];
  writeFileSync(resolve(here, 'receipt.json.gz'), gzipSync(JSON.stringify({ base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sources: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), environment: { node: process.version, cpu: cpus()[0].model, platform: process.platform, arch: process.arch, ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).trim() }, hypothesis: 'Instance-local charge-boundary residual before absolute geq*v; static/C system centered after assembly. Evidence only, not production correction.', rows }, null, 2) + '\n'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
