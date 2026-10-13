// Receipts: cold/warm simulate samples OR isolated actual mesh CSC/RHS replay.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Session } from 'node:inspector';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
const [mode, circuit, sizeText, prefix] = process.argv.slice(2);
const size = Number(sizeText);
const fixture = m2Netlist(circuit, size);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const vectorHash = vector => hash(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
const emit = row => appendFileSync(`${prefix}.jsonl`, JSON.stringify(row) + '\n');
const memory = () => ({ ...process.memoryUsage(), peakRssMiB: process.resourceUsage().maxRSS / 1024 });
if (mode === 'simulate') {
  const { simulate } = await import('../../../../packages/core/dist/index.js');
  for (const phase of ['cold', 'warm']) {
    const startMemory = memory(), start = performance.now();
    const result = await simulate(fixture.netlist);
    const ms = performance.now() - start;
    const grid = result.transient ? Array.from(result.transient.time) : [0];
    const values = result.transient ? Array.from(result.transient.voltage(fixture.probe)) : [result.dc.voltage(fixture.probe)];
    emit({ phase, ms, startMemory, endMemory: memory(), grid, values, probeSha256: vectorHash(Float64Array.from(values)), convergence: result.convergence });
  }
} else if (mode === 'capture') {
  const { simulate, GilbertPeierlsSolver } = await import('./bundle.mjs');
  const factorize = GilbertPeierlsSolver.prototype.factorize;
  const solve = GilbertPeierlsSolver.prototype.solve;
  let captured, owner;
  GilbertPeierlsSolver.prototype.factorize = function(A) {
    if (!captured) {
      owner = this;
      captured = { A: { size: A.size, colPtr: A.colPtr.slice(), rowIdx: A.rowIdx.slice(), values: A.values.slice() } };
    }
    return factorize.call(this, A);
  };
  GilbertPeierlsSolver.prototype.solve = function(b, acceptOverflow) {
    if (this === owner && !captured.b) {
      captured.b = b.slice();
      const x = solve.call(this, b, acceptOverflow);
      captured.expected = x.slice();
      return x;
    }
    return solve.call(this, b, acceptOverflow);
  };
  await simulate(fixture.netlist);
  assert(captured?.expected);
  writeFileSync(`${prefix}.matrix.gz`, gzipSync(serialize(captured)));
  emit({ matrixSize: captured.A.size, nnz: captured.A.colPtr[captured.A.size], matrixSha256: vectorHash(captured.A.values), rhsSha256: vectorHash(captured.b), expectedSha256: vectorHash(captured.expected) });
} else if (mode === 'isolate') {
  const { GilbertPeierlsSolver } = await import('./bundle.mjs');
  const { A, b, expected } = deserialize(gunzipSync(readFileSync(`${prefix.replace(/-r\d+$/, '')}.matrix.gz`)));
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  await post('Profiler.enable');
  for (const phase of ['cold', 'warm']) {
    // A fresh solver per pass keeps capacity, ordering and numeric work identical.
    // Analyze is outside measurement. No identical-input skip or pivot reuse.
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    const rhs = b.slice(), startMemory = memory();
    console.log(`TRACE_PHASE ${phase} start`);
    await post('Profiler.start');
    const start = performance.now();
    solver.factorize(A);
    const factorMs = performance.now() - start;
    const solveStart = performance.now();
    const x = solver.solve(rhs);
    const solveMs = performance.now() - solveStart;
    const { profile } = await post('Profiler.stop');
    console.log(`TRACE_PHASE ${phase} end`);
    assert.equal(vectorHash(x), vectorHash(expected), 'full solution must be bit-identical');
    assert.equal(solver.numericFactorizations, 1);
    assert.equal(solver.pivotReuseFactorizations, 0);
    writeFileSync(`${prefix}-${phase}.cpuprofile.gz`, gzipSync(JSON.stringify(profile)));
    emit({ phase, factorMs, solveMs, numericFactorizations: solver.numericFactorizations, pivotReuseFactorizations: solver.pivotReuseFactorizations, supernodalUpdates: solver.supernodalUpdates, factorNonzeros: solver.factorNonzeros(), solutionSha256: vectorHash(x), startMemory, endMemory: memory() });
  }
  session.disconnect();
  // Separate diagnostic pass. Never mix wrapper timing into measured samples.
  console.log('TRACE_PHASE growth-diagnostic start');
  const diagnostic = new GilbertPeierlsSolver(); diagnostic.analyzePattern(A);
  const initialCapacity = diagnostic.uValues.length;
  const grow = diagnostic.growUFactors;
  const growth = [];
  diagnostic.growUFactors = function(required) {
    const before = this.uValues.length;
    grow.call(this, required);
    growth.push({ required, before, after: this.uValues.length });
  };
  diagnostic.factorize(A);
  console.log('TRACE_PHASE growth-diagnostic end');
  emit({ phase: 'growth-diagnostic', initialCapacity, finalCapacity: diagnostic.uValues.length, used: diagnostic.uColPtr[A.size], growth });
} else throw new Error(`unknown mode ${mode}`);
