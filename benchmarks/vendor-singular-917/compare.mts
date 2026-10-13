// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { hostname, platform, release, cpus } from 'node:os';
import { simulate } from '../../packages/core/src/simulate.js';

type ReferenceReceipt = { name: string; inputHashBefore: string; inputHashAfter: string; includesBefore: Record<string, string>; includesAfter: Record<string, string>; invocation: string[]; cwd: string; exit: number | null; signal: string | null; milliseconds: number; acRows: number | null; log: string; maxError: null; rmsError: null };
const here = resolve('benchmarks/vendor-singular-917');
const run = resolve(here, '.run');
mkdirSync(run, { recursive: true });
writeFileSync(resolve(run, '.spiceinit'), 'set ngbehavior=ltps\nset filetype=ascii\n');
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const receipts: ReferenceReceipt[] = [];
for (const name of ['base_159.cir', 'variant_159.cir', 'floating-rc.cir']) {
  const deck = name === 'floating-rc.cir' ? resolve(here, name) : resolve('.receipt-882/ngspice/784', name);
  const raw = resolve(run, `${name}.raw`);
  const invocation = ['ngspice', '-b', '-r', raw, deck];
  const inputHashBefore = hash(deck);
  const includeHashes = () => Object.fromEntries([...readFileSync(deck, 'utf8').matchAll(/^\s*\.include\s+"([^"]+)"/gim)].map(m => [m[1].split('/').at(-1)!, hash(m[1])]));
  const includesBefore = includeHashes();
  const start = performance.now();
  const result = spawnSync(invocation[0], invocation.slice(1), { cwd: run, encoding: 'utf8', timeout: 120000 });
  const milliseconds = performance.now() - start;
  const rawText = result.status === 0 ? readFileSync(raw, 'utf8') : '';
  const acRows = /Plotname: AC Analysis[\s\S]*?No\. Points:\s*(\d+)/i.exec(rawText)?.[1];
  // The reference log contains diagnostics, not deck/library source bytes.
  receipts.push({ name, inputHashBefore, inputHashAfter: hash(deck), includesBefore, includesAfter: includeHashes(), invocation, cwd: run, exit: result.status, signal: result.signal, milliseconds, acRows: acRows ? Number(acRows) : null, log: result.stdout + result.stderr + (result.error?.message ?? ''), maxError: null, rmsError: null });
}
const deck = readFileSync(resolve(here, 'floating-rc.cir'), 'utf8');
const start = performance.now();
let reduction;
try { await simulate(deck); reduction = { status: 'success' }; }
catch (e) { reduction = { status: 'failure', error: (e as Error).message, stack: (e as Error).stack, maxError: null, rmsError: null }; }
const reductionMilliseconds = performance.now() - start;
writeFileSync(resolve(here, 'comparison.json'), JSON.stringify({ baseline: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), host: { hostname: hostname(), platform: platform(), release: release(), cpu: cpus()[0].model, node: process.version }, ngspiceVersion: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout, configuration: 'set ngbehavior=ltps\nset filetype=ascii\n', runtimeBoundary: 'reference subprocess wall time including startup and raw output; reduction native simulate parse/compile/DC-before-AC', references: receipts, reduction: { ...reduction, milliseconds: reductionMilliseconds } }, null, 2) + '\n');
console.log(receipts.map(r => ({ name: r.name, exit: r.exit, acRows: r.acRows, milliseconds: r.milliseconds })), reduction);
