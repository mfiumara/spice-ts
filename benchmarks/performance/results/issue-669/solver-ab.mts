#!/usr/bin/env -S pnpm exec tsx
/**
 * Issue #669: solver-only paired A/B of GilbertPeierlsSolver.factorize from
 * two source trees, on the matrices the scaling decks produce:
 *
 *  - mesh: the side x side resistor grid OP matrix (one full factorization,
 *    the resistor-mesh-op case), 50 176 nodes by default;
 *  - ladder: the RC-ladder transient matrix (path of conductances plus C/h on
 *    every diagonal and a voltage-source branch), refactorized with a new C/h
 *    every call, as a transient run does after every timestep change.
 *
 *   pnpm exec tsx benchmarks/performance/results/issue-669/solver-ab.mts \
 *     --base=<repo root A> --head=<repo root B> [--rounds=7]
 *
 * Each sample is a fresh child process; rounds alternate the arm order.
 */
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

interface Csc { size: number; colPtr: Int32Array; rowIdx: Int32Array; values: Float64Array }

async function child(root: string, kind: string): Promise<void> {
  const { SparseMatrix } = await import(pathToFileURL(join(root, 'packages/core/src/solver/sparse-matrix.ts')).href);
  const { toCsc } = await import(pathToFileURL(join(root, 'packages/core/src/solver/csc-matrix.ts')).href);
  const { GilbertPeierlsSolver } = await import(pathToFileURL(join(root, 'packages/core/src/solver/gilbert-peierls.ts')).href);
  const times: number[] = [];
  if (kind === 'mesh') {
    const side = 224;
    const n = side * side;
    const m = new SparseMatrix(n + 1);
    const idx = (r: number, c: number) => r * side + c;
    for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= side || c2 >= side) continue;
        const i = idx(r, c); const j = idx(r2, c2);
        m.add(i, i, 1e-3); m.add(j, j, 1e-3); m.add(i, j, -1e-3); m.add(j, i, -1e-3);
      }
    }
    m.add(n - 1, n - 1, 1e-3);
    m.add(0, n, 1); m.add(n, 0, 1);
    const A: Csc = toCsc(m).csc;
    for (let run = 0; run < 4; run++) {
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(A);
      const t = performance.now();
      solver.factorize(A);
      if (run > 0) times.push(performance.now() - t);
    }
  } else {
    const n = 50000;
    const m = new SparseMatrix(n + 1);
    for (let i = 0; i < n; i++) {
      m.add(i, i, 2e-3);
      if (i + 1 < n) { m.add(i, i + 1, -1e-3); m.add(i + 1, i, -1e-3); }
    }
    m.add(0, n, 1); m.add(n, 0, 1);
    const A: Csc = toCsc(m).csc;
    const diag: number[] = [];
    for (let j = 0; j < n; j++) for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) if (A.rowIdx[p] === j) diag.push(p);
    const base = A.values.slice();
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    solver.factorize(A);
    for (let run = 0; run < 4; run++) {
      const t = performance.now();
      const steps = 50;
      for (let s = 0; s < steps; s++) {
        const gc = 1e-12 / (1e-10 * (1 + ((run * steps + s) % 17)));
        for (const p of diag) A.values[p] = base[p] + gc;
        solver.factorize(A);
      }
      if (run > 0) times.push((performance.now() - t) / steps);
    }
  }
  times.sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({ ms: times[1] }));
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function main(): Promise<void> {
  const roots = { base: resolve(arg('base')!), head: resolve(arg('head')!) };
  const rounds = Number(arg('rounds', '7'));
  const script = fileURLToPath(import.meta.url);
  const tsx = join(roots.head, 'node_modules/.bin/tsx');
  for (const kind of ['mesh', 'ladder']) {
    const samples: Record<'base' | 'head', number[]> = { base: [], head: [] };
    for (let round = 0; round < rounds; round++) {
      for (const arm of (round % 2 ? ['head', 'base'] : ['base', 'head']) as Array<'base' | 'head'>) {
        const run = spawnSync(tsx, [script, '--child', roots[arm], kind], { encoding: 'utf8' });
        if (run.status !== 0) throw new Error(run.stderr);
        samples[arm].push(JSON.parse(run.stdout).ms);
      }
    }
    const ratios = samples.base.map((b, i) => b / samples.head[i]);
    console.log(JSON.stringify({ kind, unit: kind === 'mesh' ? 'ms per full factorization' : 'ms per refactorization',
      medianBase: median(samples.base), medianHead: median(samples.head), medianPairedSpeedup: median(ratios), samples }));
  }
}

if (args[0] === '--child') await child(args[1], args[2]);
else await main();
