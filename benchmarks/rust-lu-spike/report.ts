#!/usr/bin/env tsx
/**
 * Issue #802 spike: render the markdown tables of docs/spikes/rust-lu.md from
 * results/rust-lu-spike.json (bench.ts) and results/rust-lu-op-swap.json
 * (op-swap.ts). No measurement happens here.
 *
 * Usage: pnpm exec tsx benchmarks/rust-lu-spike/report.ts [--dir=results/base-45d6ea7]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice('--dir='.length);
const resultsDir = dirArg ? join(here, dirArg) : join(here, 'results');
interface Med { symbolic: number; factor: number; solve: number; refactor: number; refactorPerturbed: number; marshal?: number }
interface Cell {
  backend: string; deck: string; n: number; nnz: number; luNnz: number; median: Med;
  refactorReusedPivots: boolean; refactorPerturbedReusedPivots: boolean; relResidual: number;
  syntheticRhs: boolean; solverHeapBytes: number; wasmLinearMemoryBytes?: number; peakRssMiB?: number;
}
interface Bench {
  cells: Cell[];
  accuracy: { deck: string; backend: string; colPermMatchesTs: boolean; maxRelDiff: number; bitIdentical: number; n: number }[];
  ngspice: { deck: string; solver: string; median: Record<string, number>; error?: string }[];
  opProfile: Record<string, unknown>[];
}
interface OpCell {
  backend: string; deck: string; status: string; runs: number;
  median?: { totalMs: number; luMs: number; nonLuMs: number };
  vsTs?: { nodes: number; bitIdentical: number; maxAbsDiffV: number };
}

const bench = JSON.parse(readFileSync(join(resultsDir, 'rust-lu-spike.json'), 'utf8')) as Bench;
const op = JSON.parse(readFileSync(join(resultsDir, 'rust-lu-op-swap.json'), 'utf8')) as { cells: OpCell[] };

const f = (v: number | undefined, d = 3): string => (v === undefined ? '-' : v < 0.01 ? v.toExponential(1) : v.toFixed(d));
const x = (a: number, b: number): string => `${(a / b).toFixed(1)}x`;
const decks = [...new Set(bench.cells.map(c => c.deck))];
const cell = (deck: string, backend: string): Cell => bench.cells.find(c => c.deck === deck && c.backend === backend)!;

console.log('### LU phases, median ms (5 runs after 10 warm-ups; fresh solver per run)\n');
console.log('| deck | n | nnz | L+U nnz | backend | symbolic | factor | solve | refactor (Newton) | refactor (perturbed) | factor+solve vs TS | refactor(p)+solve vs TS |');
console.log('|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|');
for (const d of decks) {
  const ts = cell(d, 'ts');
  for (const b of ['ts', 'rust-pure', 'rust-native', 'rust-wasm']) {
    const c = cell(d, b);
    const m = c.median;
    const fs = x(ts.median.factor + ts.median.solve, m.factor + m.solve);
    const rs = x(ts.median.refactorPerturbed + ts.median.solve, m.refactorPerturbed + m.solve);
    const reuse = c.refactorReusedPivots ? '' : ' (full)';
    console.log(`| ${d} | ${c.n} | ${c.nnz} | ${c.luNnz} | ${b} | ${f(m.symbolic)} | ${f(m.factor)} | ${f(m.solve)} | ${f(m.refactor)}${reuse} | ${f(m.refactorPerturbed)} | ${b === 'ts' ? '1.0x' : fs} | ${b === 'ts' ? '1.0x' : rs} |`);
  }
}

console.log('\n### Go/no-go: Rust speed-up over TS on the 10k and 50k decks (LU from Node, incl. marshalling)\n');
console.log('| deck | native: symbolic+factor+solve | native: refactor(p)+solve | wasm: symbolic+factor+solve | wasm: refactor(p)+solve |');
console.log('|---|---:|---:|---:|---:|');
for (const d of decks.filter(dk => /-(10|50)k$/.test(dk))) {
  const t = cell(d, 'ts').median;
  const row = ['rust-native', 'rust-wasm'].flatMap(b => {
    const m = cell(d, b).median;
    return [x(t.symbolic + t.factor + t.solve, m.symbolic + m.factor + m.solve), x(t.refactorPerturbed + t.solve, m.refactorPerturbed + m.solve)];
  });
  console.log(`| ${d} | ${row.join(' | ')} |`);
}

console.log('\n### Accuracy vs the TS solution x (first OP Newton system)\n');
console.log('| deck | backend | same column order as TS | bit-identical x entries | max rel diff | rel residual ‖Ax−b‖/‖b‖ | synthetic RHS |');
console.log('|---|---|---|---:|---:|---:|---|');
for (const a of bench.accuracy) {
  const c = cell(a.deck, a.backend);
  console.log(`| ${a.deck} | ${a.backend} | ${a.colPermMatchesTs ? 'yes' : 'NO'} | ${a.bitIdentical}/${a.n} | ${a.maxRelDiff.toExponential(1)} | ${c.relResidual.toExponential(1)} | ${c.syntheticRhs ? 'yes' : 'no'} |`);
}

console.log('\n### Memory (solver-owned bytes after the run; child peak RSS includes Node + parsed matrices)\n');
console.log('| deck | TS solver MiB | Rust solver MiB | WASM linear memory MiB | peak RSS TS / native / wasm MiB |');
console.log('|---|---:|---:|---:|---|');
const mib = (b: number | undefined): string => (b === undefined ? '-' : (b / 1048576).toFixed(1));
for (const d of decks) {
  const t = cell(d, 'ts');
  const n = cell(d, 'rust-native');
  const w = cell(d, 'rust-wasm');
  console.log(`| ${d} | ${mib(t.solverHeapBytes)} | ${mib(n.solverHeapBytes)} | ${mib(w.wasmLinearMemoryBytes)} | ${f(t.peakRssMiB, 0)} / ${f(n.peakRssMiB, 0)} / ${f(w.peakRssMiB, 0)} |`);
}

console.log('\n### End-to-end DC OP with the LU swapped (parse + simulate, median ms)\n');
console.log('| deck | runs | TS total | TS in LU | LU share | native total | native in LU | wasm total | wasm in LU | OP speed-up native / wasm | node voltages bit-identical |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
for (const d of [...new Set(op.cells.map(c => c.deck))]) {
  const get = (b: string): OpCell | undefined => op.cells.find(c => c.deck === d && c.backend === b && c.status === 'ok');
  const t = get('ts');
  const n = get('rust-native');
  const w = get('rust-wasm');
  if (!t?.median || !n?.median || !w?.median) { console.log(`| ${d} | failed cell, see JSON |`); continue; }
  const ident = [n, w].map(c => `${c.vsTs!.bitIdentical}/${c.vsTs!.nodes}`).join(' / ');
  console.log(`| ${d} | ${t.runs} | ${f(t.median.totalMs, 1)} | ${f(t.median.luMs, 1)} | ${(100 * t.median.luMs / t.median.totalMs).toFixed(0)}% | ${f(n.median.totalMs, 1)} | ${f(n.median.luMs, 1)} | ${f(w.median.totalMs, 1)} | ${f(w.median.luMs, 1)} | ${x(t.median.totalMs, n.median.totalMs)} / ${x(t.median.totalMs, w.median.totalMs)} | ${ident} |`);
}

console.log('\n### ngspice-47 OP for context (same OP decks, median ms of .options acct)\n');
console.log('| deck | solver | total analysis | reorder | factor | solve | load |');
console.log('|---|---|---:|---:|---:|---:|---:|');
for (const g of bench.ngspice) {
  if (g.error) { console.log(`| ${g.deck} | ${g.solver} | error: ${g.error} | | | | |`); continue; }
  const m = g.median;
  console.log(`| ${g.deck} | ${g.solver} | ${f(m.total, 1)} | ${f(m.reorder)} | ${f(m.factor)} | ${f(m.solve)} | ${f(m.load, 1)} |`);
}
