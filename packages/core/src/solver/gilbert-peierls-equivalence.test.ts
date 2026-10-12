import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc, type CscMatrix } from './csc-matrix.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';

/**
 * Issue #669: the numeric factorization was restructured for speed (pivot
 * activation state, heap-ordered active columns). This oracle pins the
 * result to the pre-#669 left-looking kernel, frozen verbatim below: for the
 * same column order and preferred pivot rows, the new kernel must produce
 * bit-identical L, U, row permutation and solution, including pivot ties
 * (uniform resistor grids), exact cancellation and explicit stored zeros.
 */

interface Factors {
  perm: Int32Array;
  lColPtr: Int32Array;
  lRows: Int32Array;
  lValues: Float64Array;
  uColPtr: Int32Array;
  uRows: Int32Array;
  uValues: Float64Array;
}

const SINGULAR = 'reference-singular';

/** Pre-#669 GilbertPeierlsSolver.factorize numeric kernel (unbounded buffers). */
function referenceFactorize(A: CscMatrix, colPerm: Int32Array, rowPref: Int32Array): Factors {
  const n = A.size;
  const cap = n * n + 1;
  const perm = new Int32Array(rowPref);
  const workspace = new Float64Array(n);
  const lColPtr = new Int32Array(n + 1);
  const lRows = new Int32Array(cap);
  const lValues = new Float64Array(cap);
  const uColPtr = new Int32Array(n + 1);
  const uRows = new Int32Array(cap);
  const uValues = new Float64Array(cap);
  const pinv = new Int32Array(n).fill(-1);
  const nonzeroFlag = new Int32Array(n).fill(-1);
  const nonzeroList = new Int32Array(n);
  const activeK = new Int32Array(n);
  let lp = 0;
  let up = 0;
  for (let j = 0; j < n; j++) {
    let nonzeroCount = 0;
    lColPtr[j] = lp;
    uColPtr[j] = up;
    const col = colPerm[j];
    for (let p = A.colPtr[col]; p < A.colPtr[col + 1]; p++) {
      const origRow = A.rowIdx[p];
      workspace[origRow] = A.values[p];
      if (nonzeroFlag[origRow] !== j) {
        nonzeroFlag[origRow] = j;
        nonzeroList[nonzeroCount++] = origRow;
      }
    }
    let activeCount = 0;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      const k = pinv[origRow];
      if (k >= 0 && k < j && workspace[origRow] !== 0) {
        activeK[activeCount++] = k;
        pinv[origRow] = -k - 2;
      }
    }
    activeK.subarray(0, activeCount).sort();
    let ki = 0;
    while (ki < activeCount) {
      const k = activeK[ki];
      ki++;
      const pr = perm[k];
      const ukj = workspace[pr];
      if (ukj === 0) continue;
      uRows[up] = k;
      uValues[up] = ukj;
      up++;
      for (let p = lColPtr[k]; p < lColPtr[k + 1]; p++) {
        const origI = lRows[p];
        workspace[origI] -= lValues[p] * ukj;
        if (nonzeroFlag[origI] !== j) {
          nonzeroFlag[origI] = j;
          nonzeroList[nonzeroCount++] = origI;
        }
        const k2 = pinv[origI];
        if (k2 > k && k2 < j && workspace[origI] !== 0) {
          pinv[origI] = -k2 - 2;
          activeK[activeCount] = k2;
          activeCount++;
          for (let q = activeCount - 1; q > ki; q--) {
            if (activeK[q] < activeK[q - 1]) {
              const tmp = activeK[q];
              activeK[q] = activeK[q - 1];
              activeK[q - 1] = tmp;
            } else {
              break;
            }
          }
        }
      }
    }
    for (let t = 0; t < activeCount; t++) {
      const k = activeK[t];
      pinv[perm[k]] = k;
    }
    let maxVal = 0;
    let maxOrigRow = -1;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      if (pinv[origRow] < 0) {
        const absVal = Math.abs(workspace[origRow]);
        if (absVal > maxVal) {
          maxVal = absVal;
          maxOrigRow = origRow;
        }
      }
    }
    if (maxVal < 1e-18) throw new Error(SINGULAR);
    const natOrigRow = perm[j];
    const chosenOrigRow = pinv[natOrigRow] < 0 && Math.abs(workspace[natOrigRow]) >= 0.1 * maxVal
      ? natOrigRow
      : maxOrigRow;
    const pivotVal = workspace[chosenOrigRow];
    if (Math.abs(pivotVal) < 1e-18) throw new Error(SINGULAR);
    pinv[chosenOrigRow] = j;
    if (chosenOrigRow !== perm[j]) {
      for (let i = j + 1; i < n; i++) {
        if (perm[i] === chosenOrigRow) {
          perm[i] = perm[j];
          perm[j] = chosenOrigRow;
          break;
        }
      }
    }
    uRows[up] = j;
    uValues[up] = pivotVal;
    up++;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      if (origRow !== chosenOrigRow && pinv[origRow] < 0 && workspace[origRow] !== 0) {
        lRows[lp] = origRow;
        lValues[lp] = workspace[origRow] / pivotVal;
        lp++;
      }
    }
    for (let t = 0; t < nonzeroCount; t++) workspace[nonzeroList[t]] = 0;
  }
  lColPtr[n] = lp;
  uColPtr[n] = up;
  for (let k = 0; k < n; k++) pinv[perm[k]] = k;
  for (let p = 0; p < lp; p++) lRows[p] = pinv[lRows[p]];
  return {
    perm,
    lColPtr,
    lRows: lRows.slice(0, lp),
    lValues: lValues.slice(0, lp),
    uColPtr,
    uRows: uRows.slice(0, up),
    uValues: uValues.slice(0, up),
  };
}

interface SolverInternals extends Factors {
  colPerm: Int32Array;
  rowPref: Int32Array;
  n: number;
}

function expectBitIdentical(actual: ArrayLike<number>, expected: ArrayLike<number>, label: string): void {
  expect(actual.length, `${label} length`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      throw new Error(`${label}[${i}]: ${actual[i]} !== ${expected[i]}`);
    }
  }
}

/** Factorize with the solver and the frozen reference; assert identical factors and solves. */
function checkAgainstReference(solver: GilbertPeierlsSolver, A: CscMatrix, label: string): 'ok' | 'singular' {
  const internals = solver as unknown as SolverInternals;
  let expected: Factors | null = null;
  try {
    expected = referenceFactorize(A, internals.colPerm, internals.rowPref);
  } catch (error) {
    if ((error as Error).message !== SINGULAR) throw error;
  }
  if (expected === null) {
    expect(() => solver.factorize(A), `${label} singular`).toThrow();
    return 'singular';
  }
  solver.factorize(A);
  const n = A.size;
  const lp = internals.lColPtr[n];
  const up = internals.uColPtr[n];
  expectBitIdentical(internals.perm, expected.perm, `${label} perm`);
  expectBitIdentical(internals.lColPtr, expected.lColPtr, `${label} lColPtr`);
  expectBitIdentical(internals.uColPtr, expected.uColPtr, `${label} uColPtr`);
  expectBitIdentical(internals.lRows.subarray(0, lp), expected.lRows, `${label} lRows`);
  expectBitIdentical(internals.lValues.subarray(0, lp), expected.lValues, `${label} lValues`);
  expectBitIdentical(internals.uRows.subarray(0, up), expected.uRows, `${label} uRows`);
  expectBitIdentical(internals.uValues.subarray(0, up), expected.uValues, `${label} uValues`);
  return 'ok';
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform resistor grid with a voltage-source branch row: many exact pivot ties. */
function gridMna(side: number, values: () => number): CscMatrix {
  const n = side * side;
  const m = new SparseMatrix(n + 1);
  const idx = (r: number, c: number) => r * side + c;
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= side || c2 >= side) continue;
        const g = values();
        const i = idx(r, c);
        const j = idx(r2, c2);
        m.add(i, i, g); m.add(j, j, g); m.add(i, j, -g); m.add(j, i, -g);
      }
    }
  }
  m.add(n - 1, n - 1, 1e-3);
  // Voltage source between node 0 and ground: zero diagonal branch row.
  m.add(0, n, 1); m.add(n, 0, 1);
  return toCsc(m).csc;
}

/** Random nonsymmetric pattern with small-integer values: ties, cancellation, explicit zeros. */
function randomMatrix(n: number, density: number, next: () => number, weakDiagonal: boolean): CscMatrix {
  const m = new SparseMatrix(n);
  const pick = () => [-3, -2, -1, -1, 1, 1, 2, 3, 0.5, 4][Math.floor(next() * 10)];
  for (let i = 0; i < n; i++) {
    if (weakDiagonal && next() < 0.3) m.touch(i, i);
    else m.add(i, i, pick() * (weakDiagonal ? 0.05 : 4));
    for (let j = 0; j < n; j++) {
      if (i === j || next() >= density) continue;
      if (next() < 0.1) m.touch(i, j);
      else m.add(i, j, pick());
    }
  }
  return toCsc(m).csc;
}

function withValues(A: CscMatrix, values: Float64Array): CscMatrix {
  return { size: A.size, colPtr: A.colPtr, rowIdx: A.rowIdx, values };
}

describe('GilbertPeierlsSolver numeric kernel equivalence (#669)', () => {
  it('matches the frozen pre-#669 kernel bit for bit on uniform and graded grids', () => {
    for (const side of [3, 8, 17, 30]) {
      for (const graded of [false, true]) {
        const next = rng(side * 7 + (graded ? 1 : 0));
        const A = gridMna(side, () => (graded ? 1e-3 * (1 + Math.floor(next() * 4)) : 1e-3));
        const solver = new GilbertPeierlsSolver();
        solver.analyzePattern(A);
        expect(checkAgainstReference(solver, A, `grid ${side} graded=${graded}`)).toBe('ok');
      }
    }
  });

  it('matches the frozen kernel on random nonsymmetric matrices, including refactorization', () => {
    let factored = 0;
    let reused = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const next = rng(seed);
      const n = 4 + Math.floor(next() * 40);
      const density = 0.05 + next() * 0.25;
      const A = randomMatrix(n, density, next, seed % 3 === 0);
      for (const ordering of ['amd', 'natural'] as const) {
        const solver = new GilbertPeierlsSolver({ ordering });
        solver.analyzePattern(A);
        if (checkAgainstReference(solver, A, `seed ${seed} ${ordering}`) === 'ok') factored++;
        // Refactorize the same solver with perturbed values on the same pattern:
        // small relative changes (the pivot-reuse path) and zeroing/rescaling
        // that changes pivots and patterns (the full-factorization fallback).
        for (let round = 0; round < 6; round++) {
          const values = A.values.slice();
          for (let p = 0; p < values.length; p++) {
            const r = next();
            if (round % 2 === 0) {
              if (values[p] !== 0) values[p] *= 1 + (next() - 0.5) * 1e-3;
            } else if (r < 0.2) {
              values[p] = 0;
            } else if (r < 0.6) {
              values[p] = Math.round(values[p] * (1 + next()) * 4) / 4;
            }
          }
          checkAgainstReference(solver, withValues(A, values), `seed ${seed} ${ordering} round ${round}`);
        }
        reused += solver.pivotReuseFactorizations;
      }
    }
    // The suite must exercise mostly nonsingular systems to be meaningful,
    // and both the pivot-reuse path and its fallback.
    expect(factored).toBeGreaterThan(150);
    expect(reused).toBeGreaterThan(100);
  });

  it('reuses pivots across timestep-like value changes on a grid, bit-identically', () => {
    const A = gridMna(20, () => 1e-3);
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    expect(checkAgainstReference(solver, A, 'grid step 0')).toBe('ok');
    const diagonal: number[] = [];
    for (let j = 0; j < A.size; j++) {
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) if (A.rowIdx[p] === j && A.values[p] !== 0) diagonal.push(p);
    }
    for (let step = 1; step <= 5; step++) {
      // A companion conductance G = C/h added on every node diagonal.
      const values = A.values.slice();
      for (const p of diagonal) values[p] += 1e-12 / (1e-9 * step);
      expect(checkAgainstReference(solver, withValues(A, values), `grid step ${step}`)).toBe('ok');
    }
    expect(solver.pivotReuseFactorizations).toBe(5);
  });

  it('falls back to a full factorization when the reused pivot would no longer be chosen', () => {
    // 2x2 with the preferred diagonal pivot in column 0; shrinking it below
    // the 0.1 threshold makes the kernel swap rows.
    const m = new SparseMatrix(2);
    m.add(0, 0, 4); m.add(0, 1, 1);
    m.add(1, 0, 1); m.add(1, 1, 3);
    const A = toCsc(m).csc;
    const solver = new GilbertPeierlsSolver({ ordering: 'natural' });
    solver.analyzePattern(A);
    expect(checkAgainstReference(solver, A, 'initial')).toBe('ok');
    const values = A.values.slice();
    values[0] = 0.05; // A[0][0]
    expect(checkAgainstReference(solver, withValues(A, values), 'swapped')).toBe('ok');
    expect(solver.pivotReuseFactorizations).toBe(0);
    expect(Array.from((solver as unknown as SolverInternals).perm)).toEqual([1, 0]);
  });

  it('falls back when a swapped-out preferred pivot passes the threshold again', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 0.05); m.add(0, 1, 1);
    m.add(1, 0, 1); m.add(1, 1, 3);
    const A = toCsc(m).csc;
    const solver = new GilbertPeierlsSolver({ ordering: 'natural' });
    solver.analyzePattern(A);
    expect(checkAgainstReference(solver, A, 'swapped')).toBe('ok');
    expect(Array.from((solver as unknown as SolverInternals).perm)).toEqual([1, 0]);
    const values = A.values.slice();
    values[0] = 0.5; // row 1 is still the column maximum, but row 0 now passes 0.1·max
    expect(checkAgainstReference(solver, withValues(A, values), 'preferred again')).toBe('ok');
    expect(solver.pivotReuseFactorizations).toBe(0);
    expect(Array.from((solver as unknown as SolverInternals).perm)).toEqual([0, 1]);
  });

  it('falls back when an L entry becomes exactly zero', () => {
    const m = new SparseMatrix(3);
    m.add(0, 0, 4); m.add(1, 0, 1); m.add(2, 0, 1);
    m.add(0, 1, 1); m.add(1, 1, 4); m.add(2, 2, 4); m.add(1, 2, 1);
    const A = toCsc(m).csc;
    const solver = new GilbertPeierlsSolver({ ordering: 'natural' });
    solver.analyzePattern(A);
    expect(checkAgainstReference(solver, A, 'initial')).toBe('ok');
    const values = A.values.slice();
    values[A.colPtr[0] + 2] = 0; // A[2][0]: the stored entry stays, L[2][0] vanishes
    expect(checkAgainstReference(solver, withValues(A, values), 'zero L entry')).toBe('ok');
    expect(solver.pivotReuseFactorizations).toBe(0);
  });
});

/**
 * Issue #727: full factorizations apply runs of consecutive L columns with
 * nested patterns (supernodes) to a later column as one row-major block. The
 * frozen kernel above stays the oracle: factors must stay bit-identical,
 * which pins the per-entry subtraction order, the touched-row order that
 * drives pivot ties and the L row order, and the skipping of members whose
 * U entry is exactly zero.
 */
describe('GilbertPeierlsSolver supernodal updates (#727)', () => {
  it('matches the frozen kernel on grids large enough to form supernodes, and uses them', () => {
    for (const side of [24, 41]) {
      for (const graded of [false, true]) {
        const next = rng(side * 13 + (graded ? 1 : 0));
        const A = gridMna(side, () => (graded ? 1e-3 * (1 + Math.floor(next() * 4)) : 1e-3));
        const solver = new GilbertPeierlsSolver();
        solver.analyzePattern(A);
        expect(checkAgainstReference(solver, A, `grid ${side} graded=${graded}`)).toBe('ok');
        expect(solver.supernodalUpdates, `grid ${side} supernodal updates`).toBeGreaterThan(side);
      }
    }
  });

  it('matches the frozen kernel when members cancel to exact zeros and pivots move', () => {
    let supernodal = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const next = rng(1000 + seed);
      const side = 8 + Math.floor(next() * 14);
      // Small-integer conductances on a grid with sparse random cross terms:
      // exact cancellation zeroes U entries inside supernodes, explicit zeros
      // keep stored structure, and a weak diagonal forces off-preference pivots.
      const n = side * side;
      const m = new SparseMatrix(n);
      const pick = () => [-3, -2, -1, -1, 1, 1, 2, 3, 0.5, 4][Math.floor(next() * 10)];
      const weak = seed % 2 === 0;
      for (let r = 0; r < side; r++) {
        for (let c = 0; c < side; c++) {
          const i = r * side + c;
          if (weak && next() < 0.2) m.touch(i, i);
          else m.add(i, i, pick() * (weak ? 0.25 : 8));
          for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
            if (r2 >= side || c2 >= side) continue;
            const j = r2 * side + c2;
            if (next() < 0.08) { m.touch(i, j); m.add(j, i, pick()); continue; }
            m.add(i, j, pick());
            m.add(j, i, pick());
          }
          if (next() < 0.03) m.add(i, Math.floor(next() * n), pick());
        }
      }
      const A = toCsc(m).csc;
      for (const ordering of ['amd', 'natural'] as const) {
        const solver = new GilbertPeierlsSolver({ ordering });
        solver.analyzePattern(A);
        if (checkAgainstReference(solver, A, `seed ${seed} ${ordering}`) === 'ok') {
          supernodal += solver.supernodalUpdates;
        }
        for (let round = 0; round < 3; round++) {
          const values = A.values.slice();
          for (let p = 0; p < values.length; p++) {
            const r = next();
            if (r < 0.1) values[p] = 0;
            else if (r < 0.4) values[p] = pick();
          }
          checkAgainstReference(solver, withValues(A, values), `seed ${seed} ${ordering} round ${round}`);
        }
      }
    }
    expect(supernodal).toBeGreaterThan(1000);
  });
});
