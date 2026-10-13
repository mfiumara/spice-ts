// SPDX-License-Identifier: MIT
// Diagnosis only. No vendor expressions or complete vendor matrices are exported.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { parseAsync } from '../../packages/core/src/parser/index.js';
import { simulate } from '../../packages/core/src/simulate.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';
import { MNAAssembler } from '../../packages/core/src/mna/assembler.js';
import type { CscMatrix } from '../../packages/core/src/solver/csc-matrix.js';

type FactorReceipt = { size: number; nnz: number; nonfinite: number; initialMax: number; rhsMax: number; sourceScale: number; deviceGmin: number; row1: [number, number][]; row2: [number, number][]; column2: [number, number][]; error?: string };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const directory = resolve('benchmarks/corpus/ngspice-bugs/fetched/784/extracted');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir, e.name)) : [resolve(dir, e.name)]);
}
const paths = files(directory);
const resolver = async (name: string) => {
  const path = paths.find(p => basename(p).toLowerCase() === basename(name.replaceAll('\\', '/')).toLowerCase());
  if (!path) throw new Error(`Missing include ${name}`);
  return readFileSync(path, 'utf8');
};
const originalFactor = GilbertPeierlsSolver.prototype.factorize;
const originalGetSolver = MNAAssembler.prototype.getSparseSolver;
let currentAssembler: MNAAssembler;
let factors: FactorReceipt[];
MNAAssembler.prototype.getSparseSolver = function () {
  currentAssembler = this;
  return originalGetSolver.call(this);
};
GilbertPeierlsSolver.prototype.factorize = function (matrix: CscMatrix) {
  const row1: [number, number][] = [], row2: [number, number][] = [], column2: [number, number][] = [];
  for (let col = 0; col < matrix.size; col++) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p++) {
      if (matrix.rowIdx[p] === 1) row1.push([col, matrix.values[p]]);
      if (matrix.rowIdx[p] === 2) row2.push([col, matrix.values[p]]);
      if (col === 2) column2.push([matrix.rowIdx[p], matrix.values[p]]);
    }
  }
  const receipt: FactorReceipt = { size: matrix.size, nnz: matrix.values.length, nonfinite: [...matrix.values].filter(v => !Number.isFinite(v)).length, initialMax: Math.max(...currentAssembler.solution.map(Math.abs)), rhsMax: Math.max(...currentAssembler.b.map(Math.abs)), sourceScale: currentAssembler.sourceScale, deviceGmin: currentAssembler.deviceGmin, row1, row2, column2 };
  factors.push(receipt);
  try { return originalFactor.call(this, matrix); }
  catch (error) {
    receipt.error = (error as Error).message.replace(/\(nodes: XU461.*$/, '(nodes: <expanded behavioral node redacted>)');
    throw error;
  }
};
const receipts = [];
try {
  for (const name of ['base_159.cir', 'variant_159.cir']) {
    const localPath = resolve('.receipt-882/ngspice/784', name);
    const local = readFileSync(localPath, 'utf8');
    const includes: Record<string, string> = {};
    const trackedResolver = async (name: string) => { const text = await resolver(name); includes[basename(name)] = hash(text); return text; };
    const circuit = await parseAsync(local, trackedResolver);
    const compiled = circuit.compile();
    const node = compiled.nodeNames[2];
    const attached = compiled.devices.filter(d => d.nodes.includes(2) || d.nodes.includes(1)).map(d => ({ name: d.name, type: d.constructor.name, nodes: d.nodes.map(i => i < 0 ? '0' : compiled.nodeNames[i]), branches: d.branches }));
    const types: Record<string, number> = {};
    for (const d of compiled.devices) types[d.constructor.name] = (types[d.constructor.name] ?? 0) + 1;
    factors = [];
    const start = performance.now();
    let error: string | null = null, stack: string | null = null;
    try { await simulate(local, { resolveInclude: trackedResolver }); }
    catch (e) { error = (e as Error).message; stack = (e as Error).stack ?? null; }
    receipts.push({ name, localHash: hash(local), sourceHash: hash(readFileSync(resolve(directory, name))), includes, nodeCount: compiled.nodeCount, branchCount: compiled.branchCount, deviceTypes: types, pivotIdentity: node, attached, milliseconds: performance.now() - start, error, stack, factorAttempts: factors.length, factors, maxError: null, rmsError: null });
  }
} finally {
  GilbertPeierlsSolver.prototype.factorize = originalFactor;
  MNAAssembler.prototype.getSparseSolver = originalGetSolver;
}
writeFileSync(resolve('benchmarks/vendor-singular-917/trace.json'), JSON.stringify(receipts, null, 2) + '\n');
console.log(receipts.map(r => ({ name: r.name, node: r.pivotIdentity, attached: r.attached, attempts: r.factorAttempts, first: r.factors[0], error: r.error })));
