#!/usr/bin/env tsx
/**
 * Issue #802 spike: dump the real MNA matrices spice-ts factorizes during the
 * DC operating point of the M2 scaling decks to MatrixMarket files.
 *
 * Dev-only. It imports @spice-ts/core from source and wraps
 * GilbertPeierlsSolver.prototype.factorize/solve in this process only, to
 * copy each (A, b) pair the OP Newton loop hands to the solver. Core
 * behaviour is unchanged. The transient decks are turned into OP decks by
 * replacing their `.tran` card with `.op` (the transient's own initial OP).
 *
 * Output (gitignored, regenerate with this script):
 *   matrices/<deck>.first.A.mtx / .first.b.mtx  first Newton system of the OP
 *   matrices/<deck>.last.A.mtx  / .last.b.mtx   last Newton system of the OP
 *   matrices/<deck>.refactor.A.mtx              same pattern, new values (see below)
 *   matrices/<deck>.perturbed.A.mtx             first matrix, +-3e-6 relative perturbation
 *   matrices/<deck>.json                        metadata (n, nnz, #factorizations)
 *
 * Usage: pnpm exec tsx benchmarks/rust-lu-spike/dump-matrices.ts [--sizes=1000,10000,50000]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAsync, simulate } from '../../packages/core/src/index.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';
import { M2_CIRCUITS, m2Netlist } from '../performance/scaling-m2-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'matrices');
const sizesArg = process.argv.find(a => a.startsWith('--sizes='))?.slice('--sizes='.length);
const sizes = (sizesArg ?? '1000,10000,50000').split(',').map(Number);

interface Captured { colPtr: Int32Array; rowIdx: Int32Array; values: Float64Array; b?: Float64Array }

let captured: Captured[] = [];
// Time spent inside the TS solver (factorize + solve), excluding the copies
// above, to bound how much of the OP an LU speed-up can remove (Amdahl).
let solverMs = 0;
let copyMs = 0;
let factorizeCalls = 0;
// Solver counters at the end of the OP (one solver instance per analysis).
let numeric = 0;
let pivotReuse = 0;
const proto = GilbertPeierlsSolver.prototype as unknown as {
  factorize(A: CscMatrix): void;
  solve(b: Float64Array): Float64Array;
};
const origFactorize = proto.factorize;
const origSolve = proto.solve;
proto.factorize = function (this: unknown, A: CscMatrix): void {
  const c0 = performance.now();
  const n = A.size;
  const nnz = A.colPtr[n];
  factorizeCalls++;
  // Keep only the first system and the latest one (bounded memory at 50k).
  if (captured.length === 2) captured.pop();
  captured.push({
    colPtr: A.colPtr.slice(0, n + 1),
    rowIdx: A.rowIdx.slice(0, nnz),
    values: A.values.slice(0, nnz),
  });
  copyMs += performance.now() - c0;
  const t0 = performance.now();
  origFactorize.call(this, A);
  solverMs += performance.now() - t0;
  const self = this as GilbertPeierlsSolver;
  numeric = self.numericFactorizations;
  pivotReuse = self.pivotReuseFactorizations;
};
proto.solve = function (this: unknown, b: Float64Array): Float64Array {
  const last = captured[captured.length - 1];
  if (last && !last.b) {
    const c0 = performance.now();
    last.b = b.slice();
    copyMs += performance.now() - c0;
  }
  const t0 = performance.now();
  const x = origSolve.call(this, b);
  solverMs += performance.now() - t0;
  return x;
};

function writeMatrix(path: string, m: Captured): void {
  const n = m.colPtr.length - 1;
  const nnz = m.colPtr[n];
  const lines = ['%%MatrixMarket matrix coordinate real general', `${n} ${n} ${nnz}`];
  for (let j = 0; j < n; j++) {
    for (let p = m.colPtr[j]; p < m.colPtr[j + 1]; p++) {
      lines.push(`${m.rowIdx[p] + 1} ${j + 1} ${m.values[p]}`);
    }
  }
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function writeVector(path: string, b: Float64Array): void {
  const lines = ['%%MatrixMarket matrix array real general', `${b.length} 1`];
  for (const v of b) lines.push(String(v));
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function opDeck(netlist: string): string {
  return netlist.replace(/^\.tran .*$/m, '.op').replace(/^\.print .*$/m, '');
}

mkdirSync(outDir, { recursive: true });
const short: Record<string, string> = {
  'rc-ladder-tran': 'rc-ladder',
  'resistor-mesh-op': 'resistor-mesh',
  'cmos-inverter-chain-tran': 'cmos-chain',
};
async function main(): Promise<void> {
  for (const circuit of M2_CIRCUITS) {
    for (const size of sizes) {
      const deck = `${short[circuit]}-${size >= 1000 ? `${size / 1000}k` : size}`;
      const { netlist, actualNodes } = m2Netlist(circuit, size);
      captured = [];
      solverMs = 0;
      copyMs = 0;
      factorizeCalls = 0;
      numeric = 0;
      pivotReuse = 0;
      const started = performance.now();
      await simulate(await parseAsync(opDeck(netlist)));
      const elapsed = performance.now() - started;
      const withRhs = captured.filter(c => c.b);
      if (withRhs.length === 0) throw new Error(`${deck}: no factorize/solve captured`);
      const first = withRhs[0];
      const last = withRhs[withRhs.length - 1];
      writeMatrix(join(outDir, `${deck}.first.A.mtx`), first);
      writeVector(join(outDir, `${deck}.first.b.mtx`), first.b!);
      writeMatrix(join(outDir, `${deck}.last.A.mtx`), last);
      writeVector(join(outDir, `${deck}.last.b.mtx`), last.b!);
      // Refactor input: the last Newton matrix when it differs from the first
      // (nonlinear decks); otherwise the first matrix with a deterministic
      // +-3e-6 relative perturbation, so the same-pattern refactor path runs.
      const lastDiffers = first.values.some((v, i) => v !== last.values[i]);
      const perturbed: Captured = { ...first, values: first.values.map((v, p) => v * (1 + 1e-6 * ((p % 7) - 3))) };
      writeMatrix(join(outDir, `${deck}.perturbed.A.mtx`), perturbed);
      writeMatrix(join(outDir, `${deck}.refactor.A.mtx`), lastDiffers ? last : perturbed);
      const n = first.colPtr.length - 1;
      const meta = {
        deck, circuit, requestedNodes: size, actualNodes, n, nnz: first.colPtr[n],
        factorizeCalls,
        numericFactorizations: numeric,
        pivotReuseFactorizations: pivotReuse,
        // opWallMs excludes this script's own matrix copies (copyMs).
        opWallMs: elapsed - copyMs, solverMs, copyMs,
        solverShareOfOp: solverMs / (elapsed - copyMs),
        lastDiffersFromFirst: lastDiffers,
        refactorSource: lastDiffers ? 'last Newton matrix' : 'first matrix, deterministic 1e-6 perturbation',
      };
      writeFileSync(join(outDir, `${deck}.json`), `${JSON.stringify(meta, null, 2)}\n`);
      console.log(JSON.stringify(meta));
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
