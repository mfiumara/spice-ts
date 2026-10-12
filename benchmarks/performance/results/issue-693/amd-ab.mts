#!/usr/bin/env -S pnpm exec tsx
/**
 * Issue #693: paired A/B of amdOrdering from two source trees on the #426
 * resistor-mesh OP matrix (side x side grid plus a voltage-source branch).
 * Each sample is a fresh child process that runs amdOrdering three times on
 * the same matrix (call 1 is cold, calls 2-3 warm), and the parent checks
 * that both trees return the identical order.
 *
 *   pnpm exec tsx benchmarks/performance/results/issue-693/amd-ab.mts \
 *     --base=<repo root A> --head=<repo root B> [--rounds=7] [--sides=100,224]
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

async function child(root: string, side: number): Promise<void> {
  const src = (file: string) => pathToFileURL(join(root, 'packages/core/src/solver', file)).href;
  const { SparseMatrix } = await import(src('sparse-matrix.ts'));
  const { toCsc } = await import(src('csc-matrix.ts'));
  const { amdOrdering } = await import(src('amd-ordering.ts'));
  const n = side * side;
  const m = new SparseMatrix(n + 1);
  const idx = (r: number, c: number) => r * side + c;
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= side || c2 >= side) continue;
        const i = idx(r, c);
        const j = idx(r2, c2);
        m.add(i, i, 1e-3); m.add(j, j, 1e-3); m.add(i, j, -1e-3); m.add(j, i, -1e-3);
      }
    }
  }
  m.add(n - 1, n - 1, 1e-3);
  m.add(0, n, 1); m.add(n, 0, 1);
  const A = toCsc(m).csc;
  const ms: number[] = [];
  let order: Int32Array = new Int32Array(0);
  for (let call = 0; call < 3; call++) {
    const t = performance.now();
    order = amdOrdering(A);
    ms.push(performance.now() - t);
  }
  const digest = createHash('sha256').update(new Uint8Array(order.buffer)).digest('hex').slice(0, 16);
  process.stdout.write(JSON.stringify({ cold: ms[0], warm: Math.min(ms[1], ms[2]), digest }));
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function main(): Promise<void> {
  const roots = { base: resolve(arg('base')!), head: resolve(arg('head')!) };
  const rounds = Number(arg('rounds', '7'));
  const sides = arg('sides', '100,224')!.split(',').map(Number);
  const script = fileURLToPath(import.meta.url);
  const tsx = join(roots.head, 'node_modules/.bin/tsx');
  for (const side of sides) {
    const samples: Record<'base' | 'head', { cold: number; warm: number; digest: string }[]> = { base: [], head: [] };
    for (let round = 0; round < rounds; round++) {
      for (const arm of (round % 2 ? ['head', 'base'] : ['base', 'head']) as Array<'base' | 'head'>) {
        const run = spawnSync(tsx, [script, '--child', roots[arm], String(side)], { encoding: 'utf8' });
        if (run.status !== 0) throw new Error(run.stderr);
        samples[arm].push(JSON.parse(run.stdout));
      }
    }
    const digests = new Set([...samples.base, ...samples.head].map(s => s.digest));
    const ratio = (key: 'cold' | 'warm') => median(samples.base.map((b, i) => b[key] / samples.head[i][key]));
    console.log(JSON.stringify({
      side, n: side * side + 1, identicalOrder: digests.size === 1, orderDigest: [...digests],
      coldMedianMs: { base: median(samples.base.map(s => s.cold)), head: median(samples.head.map(s => s.cold)) },
      warmMedianMs: { base: median(samples.base.map(s => s.warm)), head: median(samples.head.map(s => s.warm)) },
      pairedSpeedup: { cold: ratio('cold'), warm: ratio('warm') }, samples,
    }));
  }
}

if (args[0] === '--child') await child(args[1], Number(args[2]));
else await main();
