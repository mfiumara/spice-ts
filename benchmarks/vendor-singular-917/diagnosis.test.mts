// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { simulate } from '../../packages/core/src/simulate.js';
import { SparseMatrix } from '../../packages/core/src/solver/sparse-matrix.js';
import { toCsc } from '../../packages/core/src/solver/csc-matrix.js';
import { GilbertPeierlsSolver } from '../../packages/core/src/solver/gilbert-peierls.js';

const here = new URL('./', import.meta.url);
const deck = readFileSync(new URL('floating-rc.cir', here), 'utf8');

test('MIT floating RC reduction preserves DC-before-AC loss (RED mode expects success)', async () => {
  if (process.env.EXPECT_SUCCESS === '1') {
    const result = await simulate(deck);
    assert.ok(result.ac, 'ngspice produces 31 AC rows on these same bytes');
  } else {
    await assert.rejects(simulate(deck), /Singular matrix: zero pivot.*nodes: b/);
  }
});

test('self-written floating resistor matrix has null vector and correctly fails factorization', () => {
  const g = 1 / 200;
  const matrix = new SparseMatrix(2);
  matrix.add(0, 0, g); matrix.add(0, 1, -g);
  matrix.add(1, 0, -g); matrix.add(1, 1, g);
  assert.equal(g + -g, 0); // A * [1,1] = [0,0]. Not a nonsingular-solver counterexample.
  const solver = new GilbertPeierlsSolver();
  const { csc } = toCsc(matrix);
  solver.analyzePattern(csc);
  assert.throws(() => solver.factorize(csc), /Singular matrix/);
});

test('archived original rows prove same floating component, not merely same error label', () => {
  const receipts = JSON.parse(readFileSync(new URL('trace.json', here), 'utf8'));
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts.map((r: { sourceHash: string }) => r.sourceHash), [
    '72f59a88a9ddb4a8dabf4905e7590fdf9d5a51b8c427c60cc5d9e4dd5a722da4',
    '119bec477c8d001d63198fce478ac7f2dc08c4f3c86321d9a5efa9cf54f58723',
  ]);
  for (const r of receipts) {
    assert.equal(r.pivotIdentity, 'Net-_C1215-Pad1_');
    const first = r.factors[0];
    assert.equal(first.nonfinite, 0);
    assert.equal(first.initialMax, 0);
    assert.equal(first.row1.length, 2);
    assert.equal(first.row2.length, 2);
    assert.deepEqual(first.row1.map(([i]: [number, number]) => i), [1, 2]);
    assert.deepEqual(first.row2.map(([i]: [number, number]) => i), [1, 2]);
    assert.equal(first.row1[0][1], -first.row1[1][1]);
    assert.equal(first.row2[0][1], -first.row2[1][1]);
    assert.equal(first.row1[0][1], first.row2[1][1]);
    assert.equal(r.factorAttempts, r.factors.length);
    assert.equal(r.factorAttempts, 33);
    assert.ok(r.factors.every((f: { error?: string }) => f.error));
    assert.equal(r.maxError, null);
    assert.equal(r.rmsError, null);
  }
});

test('references use same native input and include hashes; preserve recovery warnings', () => {
  const reference = JSON.parse(readFileSync(new URL('comparison.json', here), 'utf8'));
  const traces = JSON.parse(readFileSync(new URL('trace.json', here), 'utf8'));
  assert.equal(reference.references.length, 3);
  for (const r of reference.references) {
    assert.equal(r.exit, 0);
    assert.equal(r.signal, null);
    assert.equal(r.inputHashBefore, r.inputHashAfter);
    assert.deepEqual(r.includesBefore, r.includesAfter);
    assert.equal(r.acRows, r.name === 'floating-rc.cir' ? 31 : 141);
    const native = traces.find((t: { name: string }) => t.name === r.name);
    if (native) {
      assert.equal(r.inputHashBefore, native.localHash);
      assert.deepEqual(r.includesBefore, native.includes);
    }
    assert.equal(r.maxError, null);
    assert.equal(r.rmsError, null);
  }
  const reduction = reference.references[2];
  assert.match(reduction.log, /Dynamic gmin stepping failed/);
  assert.match(reduction.log, /True gmin stepping failed/);
  assert.match(reduction.log, /source stepping failed/);
  assert.match(reduction.log, /Transient op finished successfully/);
});
