// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve('benchmarks/dc-floating-recovery-917');
const run = resolve(root, '.run');
mkdirSync(run, { recursive: true });
writeFileSync(resolve(run, '.spiceinit'), 'set ngbehavior=ltps\nset filetype=ascii\n');
const original = readFileSync('benchmarks/vendor-singular-917/floating-rc.cir', 'utf8');
const receipts = [];
for (const [name, text] of [
  ['identical', original],
  ['op', original.replace('.ac dec 10 1 1k', '.op')],
  ['op-small', original.replace('1u', '1n').replace('2u', '2n').replace('.ac dec 10 1 1k', '.op')],
  ['op-bias', original.replace('DC 1', 'DC 3').replace('.ac dec 10 1 1k', '.op')],
] as const) {
  const deck = resolve(run, name + '.cir');
  const raw = resolve(run, name + '.raw');
  writeFileSync(deck, text);
  const start = performance.now();
  const result = spawnSync('ngspice', ['-b', '-r', raw, deck], { cwd: run, encoding: 'utf8', timeout: 30000 });
  receipts.push({ name, sha256: createHash('sha256').update(text).digest('hex'), exit: result.status, signal: result.signal, error: result.error?.message ?? null, ms: performance.now() - start, log: result.stdout + result.stderr, raw: result.status === 0 ? readFileSync(raw, 'utf8') : null });
}
writeFileSync(resolve(root, 'reference-probes.json'), JSON.stringify({ version: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout, receipts }, null, 2) + '\n');
console.log(receipts.map(r => ({name:r.name, exit:r.exit, raw:r.name === 'identical' ? r.raw?.slice(0,400) : r.raw})));
