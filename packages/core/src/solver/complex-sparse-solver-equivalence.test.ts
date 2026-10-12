import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc, type CscMatrix } from './csc-matrix.js';
import { ComplexSparseSolver, unionPattern } from './complex-sparse-solver.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';
import { simulate } from '../simulate.js';

/**
 * Issue #740: the complex AC LU now factors columns in an AMD fill-reducing
 * order (structural column singletons first, symmetric diagonal preference),
 * like the real Gilbert-Peierls solver. A different elimination order changes
 * the floating-point operations, so results cannot be bit-identical to the
 * natural-order kernel. This oracle pins them within round-off to that kernel,
 * frozen verbatim below from main before #740 (natural MNA column order,
 * ngspice-47 Sparse pivot acceptance from #732), and to dense complex
 * Gaussian elimination, on random MNA-shaped matrices and on every AC system
 * that real corpus decks hand to the solver.
 */

type Vec = [Float64Array, Float64Array];

/** Pre-#740 ComplexSparseSolver factorize + solve (natural order, unbounded buffers). */
function referenceSolve(G: CscMatrix, C: CscMatrix, omega: number, bRe: Float64Array, bIm: Float64Array): Vec {
  const n = G.size;
  const cap = n * n + 1;
  const perm = new Int32Array(n);
  const wsRe = new Float64Array(n);
  const wsIm = new Float64Array(n);
  const lColPtr = new Int32Array(n + 1);
  const lRe = new Float64Array(cap);
  const lIm = new Float64Array(cap);
  const uColPtr = new Int32Array(n + 1);
  const uRows = new Int32Array(cap);
  const uRe = new Float64Array(cap);
  const uIm = new Float64Array(cap);
  const uDiagIdx = new Int32Array(n);
  const pivotOrigRow = new Int32Array(n).fill(-1);
  const pinv = new Int32Array(n).fill(-1);
  const lTempOrigRows = new Int32Array(cap);
  const nonzeroFlag = new Int32Array(n).fill(-1);
  const nonzeroList = new Int32Array(n);
  const activeK = new Int32Array(n);
  const activeMark = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) perm[i] = i;
  let lp = 0;
  let up = 0;
  for (let j = 0; j < n; j++) {
    let nonzeroCount = 0;
    lColPtr[j] = lp;
    uColPtr[j] = up;
    for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) {
      const origRow = G.rowIdx[p];
      wsRe[origRow] = G.values[p];
      if (nonzeroFlag[origRow] !== j) { nonzeroFlag[origRow] = j; nonzeroList[nonzeroCount++] = origRow; }
    }
    for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) {
      const origRow = C.rowIdx[p];
      wsIm[origRow] = omega * C.values[p];
      if (nonzeroFlag[origRow] !== j) { nonzeroFlag[origRow] = j; nonzeroList[nonzeroCount++] = origRow; }
    }
    let activeCount = 0;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      const k = pinv[origRow];
      if (k >= 0 && k < j && (wsRe[origRow] !== 0 || wsIm[origRow] !== 0)) {
        activeK[activeCount++] = k;
        activeMark[k] = j;
      }
    }
    activeK.subarray(0, activeCount).sort();
    let ki = 0;
    while (ki < activeCount) {
      const k = activeK[ki];
      ki++;
      const pr = pivotOrigRow[k];
      const ukjRe = wsRe[pr];
      const ukjIm = wsIm[pr];
      if (ukjRe === 0 && ukjIm === 0) continue;
      uRows[up] = k; uRe[up] = ukjRe; uIm[up] = ukjIm; up++;
      for (let p = lColPtr[k]; p < lColPtr[k + 1]; p++) {
        const origI = lTempOrigRows[p];
        wsRe[origI] -= lRe[p] * ukjRe - lIm[p] * ukjIm;
        wsIm[origI] -= lRe[p] * ukjIm + lIm[p] * ukjRe;
        if (nonzeroFlag[origI] !== j) { nonzeroFlag[origI] = j; nonzeroList[nonzeroCount++] = origI; }
        const k2 = pinv[origI];
        if (k2 > k && k2 < j && activeMark[k2] !== j && (wsRe[origI] !== 0 || wsIm[origI] !== 0)) {
          activeMark[k2] = j;
          activeK[activeCount++] = k2;
          for (let q = activeCount - 1; q > ki && activeK[q] < activeK[q - 1]; q--) {
            const tmp = activeK[q]; activeK[q] = activeK[q - 1]; activeK[q - 1] = tmp;
          }
        }
      }
    }
    let maxMag = 0;
    let maxOrigRow = -1;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      if (pinv[origRow] < 0) {
        const mag = Math.abs(wsRe[origRow]) + Math.abs(wsIm[origRow]);
        if (mag > maxMag) { maxMag = mag; maxOrigRow = origRow; }
      }
    }
    if (maxMag < 1e-18) throw new Error('reference-singular');
    const natOrigRow = perm[j];
    let chosen = maxOrigRow;
    if (pinv[natOrigRow] < 0) {
      const natMag = Math.abs(wsRe[natOrigRow]) + Math.abs(wsIm[natOrigRow]);
      if (natMag > 1e-13 && natMag > 1e-3 * maxMag) chosen = natOrigRow;
    }
    const pivRe = wsRe[chosen];
    const pivIm = wsIm[chosen];
    const pivMag2 = pivRe * pivRe + pivIm * pivIm;
    pivotOrigRow[j] = chosen;
    pinv[chosen] = j;
    if (chosen !== perm[j]) {
      for (let i = j + 1; i < n; i++) {
        if (perm[i] === chosen) { perm[i] = perm[j]; perm[j] = chosen; break; }
      }
    }
    uDiagIdx[j] = up; uRows[up] = j; uRe[up] = pivRe; uIm[up] = pivIm; up++;
    for (let t = 0; t < nonzeroCount; t++) {
      const origRow = nonzeroList[t];
      if (origRow !== chosen && pinv[origRow] < 0 && (wsRe[origRow] !== 0 || wsIm[origRow] !== 0)) {
        const aRe = wsRe[origRow];
        const aIm = wsIm[origRow];
        lTempOrigRows[lp] = origRow;
        lRe[lp] = (aRe * pivRe + aIm * pivIm) / pivMag2;
        lIm[lp] = (aIm * pivRe - aRe * pivIm) / pivMag2;
        lp++;
      }
    }
    for (let t = 0; t < nonzeroCount; t++) { wsRe[nonzeroList[t]] = 0; wsIm[nonzeroList[t]] = 0; }
  }
  lColPtr[n] = lp;
  uColPtr[n] = up;
  for (let k = 0; k < n; k++) pinv[perm[k]] = k;
  const lRows = new Int32Array(lp);
  for (let p = 0; p < lp; p++) lRows[p] = pinv[lTempOrigRows[p]];

  const yRe = new Float64Array(n);
  const yIm = new Float64Array(n);
  for (let k = 0; k < n; k++) { yRe[k] = bRe[perm[k]]; yIm[k] = bIm[perm[k]]; }
  for (let j = 0; j < n; j++) {
    for (let p = lColPtr[j]; p < lColPtr[j + 1]; p++) {
      const i = lRows[p];
      yRe[i] -= lRe[p] * yRe[j] - lIm[p] * yIm[j];
      yIm[i] -= lRe[p] * yIm[j] + lIm[p] * yRe[j];
    }
  }
  const xRe = new Float64Array(n);
  const xIm = new Float64Array(n);
  for (let j = n - 1; j >= 0; j--) {
    const dRe = uRe[uDiagIdx[j]];
    const dIm = uIm[uDiagIdx[j]];
    const dMag2 = dRe * dRe + dIm * dIm;
    xRe[j] = (yRe[j] * dRe + yIm[j] * dIm) / dMag2;
    xIm[j] = (yIm[j] * dRe - yRe[j] * dIm) / dMag2;
    for (let p = uColPtr[j]; p < uColPtr[j + 1]; p++) {
      const i = uRows[p];
      if (i < j) {
        yRe[i] -= uRe[p] * xRe[j] - uIm[p] * xIm[j];
        yIm[i] -= uRe[p] * xIm[j] + uIm[p] * xRe[j];
      }
    }
  }
  return [xRe, xIm];
}

/** Dense complex Gaussian elimination with partial pivoting (|re| + |im|). */
function denseSolve(G: CscMatrix, C: CscMatrix, omega: number, bRe: Float64Array, bIm: Float64Array): Vec {
  const n = G.size;
  const aRe = Array.from({ length: n }, () => new Float64Array(n));
  const aIm = Array.from({ length: n }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) aRe[G.rowIdx[p]][j] += G.values[p];
    for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) aIm[C.rowIdx[p]][j] += omega * C.values[p];
  }
  const xRe = Float64Array.from(bRe);
  const xIm = Float64Array.from(bIm);
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(aRe[i][k]) + Math.abs(aIm[i][k]) > Math.abs(aRe[piv][k]) + Math.abs(aIm[piv][k])) piv = i;
    }
    [aRe[k], aRe[piv]] = [aRe[piv], aRe[k]];
    [aIm[k], aIm[piv]] = [aIm[piv], aIm[k]];
    [xRe[k], xRe[piv]] = [xRe[piv], xRe[k]];
    [xIm[k], xIm[piv]] = [xIm[piv], xIm[k]];
    const dRe = aRe[k][k];
    const dIm = aIm[k][k];
    const d2 = dRe * dRe + dIm * dIm;
    for (let i = k + 1; i < n; i++) {
      const mRe = (aRe[i][k] * dRe + aIm[i][k] * dIm) / d2;
      const mIm = (aIm[i][k] * dRe - aRe[i][k] * dIm) / d2;
      if (mRe === 0 && mIm === 0) continue;
      for (let j = k; j < n; j++) {
        aRe[i][j] -= mRe * aRe[k][j] - mIm * aIm[k][j];
        aIm[i][j] -= mRe * aIm[k][j] + mIm * aRe[k][j];
      }
      xRe[i] -= mRe * xRe[k] - mIm * xIm[k];
      xIm[i] -= mRe * xIm[k] + mIm * xRe[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let sRe = xRe[k];
    let sIm = xIm[k];
    for (let j = k + 1; j < n; j++) {
      sRe -= aRe[k][j] * xRe[j] - aIm[k][j] * xIm[j];
      sIm -= aRe[k][j] * xIm[j] + aIm[k][j] * xRe[j];
    }
    const dRe = aRe[k][k];
    const dIm = aIm[k][k];
    const d2 = dRe * dRe + dIm * dIm;
    xRe[k] = (sRe * dRe + sIm * dIm) / d2;
    xIm[k] = (sIm * dRe - sRe * dIm) / d2;
  }
  return [xRe, xIm];
}

/** max_i |x_i - y_i| / max_i |y_i| over complex entries. */
function relativeDifference(x: Vec, y: Vec): number {
  let diff = 0;
  let scale = 0;
  for (let i = 0; i < x[0].length; i++) {
    diff = Math.max(diff, Math.hypot(x[0][i] - y[0][i], x[1][i] - y[1][i]));
    scale = Math.max(scale, Math.hypot(y[0][i], y[1][i]));
  }
  return scale === 0 ? diff : diff / scale;
}

/** Dense real and imaginary parts of G + jωC. */
function denseMatrix(G: CscMatrix, C: CscMatrix, omega: number): [Float64Array[], Float64Array[]] {
  const n = G.size;
  const re = Array.from({ length: n }, () => new Float64Array(n));
  const im = Array.from({ length: n }, () => new Float64Array(n));
  for (let j = 0; j < n; j++) {
    for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) re[G.rowIdx[p]][j] += G.values[p];
    for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) im[C.rowIdx[p]][j] += omega * C.values[p];
  }
  return [re, im];
}

function normInf([re, im]: [Float64Array[], Float64Array[]]): number {
  let norm = 0;
  for (let i = 0; i < re.length; i++) {
    let sum = 0;
    for (let j = 0; j < re.length; j++) sum += Math.hypot(re[i][j], im[i][j]);
    norm = Math.max(norm, sum);
  }
  return norm;
}

/** cond_inf(G + jωC) = ‖A‖∞ ‖A⁻¹‖∞, with A⁻¹ formed column by column densely. */
function conditionInf(G: CscMatrix, C: CscMatrix, omega: number): number {
  const n = G.size;
  const invRe = Array.from({ length: n }, () => new Float64Array(n));
  const invIm = Array.from({ length: n }, () => new Float64Array(n));
  for (let k = 0; k < n; k++) {
    const e = new Float64Array(n);
    e[k] = 1;
    const [xRe, xIm] = denseSolve(G, C, omega, e, new Float64Array(n));
    for (let i = 0; i < n; i++) { invRe[i][k] = xRe[i]; invIm[i][k] = xIm[i]; }
  }
  return normInf(denseMatrix(G, C, omega)) * normInf([invRe, invIm]);
}

/** Normwise backward error ‖b - Ax‖∞ / (‖A‖∞ ‖x‖∞ + ‖b‖∞). */
function backwardError(G: CscMatrix, C: CscMatrix, omega: number, x: Vec, bRe: Float64Array, bIm: Float64Array): number {
  const n = G.size;
  const rRe = Float64Array.from(bRe);
  const rIm = Float64Array.from(bIm);
  for (let j = 0; j < n; j++) {
    for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) {
      const i = G.rowIdx[p];
      rRe[i] -= G.values[p] * x[0][j];
      rIm[i] -= G.values[p] * x[1][j];
    }
    for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) {
      const i = C.rowIdx[p];
      const v = omega * C.values[p];
      rRe[i] += v * x[1][j];
      rIm[i] -= v * x[0][j];
    }
  }
  let r = 0;
  let xs = 0;
  let bs = 0;
  for (let i = 0; i < n; i++) {
    r = Math.max(r, Math.hypot(rRe[i], rIm[i]));
    xs = Math.max(xs, Math.hypot(x[0][i], x[1][i]));
    bs = Math.max(bs, Math.hypot(bRe[i], bIm[i]));
  }
  return r / (normInf(denseMatrix(G, C, omega)) * xs + bs);
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AcSystem { G: CscMatrix; C: CscMatrix; label: string }

/**
 * MNA-shaped random system: a random conductance graph on `nodes` nodes with
 * grounding, capacitors, voltage sources (zero-diagonal branch rows/columns)
 * and VCVS branches, the shapes that force off-diagonal pivots (#732).
 */
function randomMna(seed: number, nodes: number): AcSystem {
  const next = rng(seed);
  const vsrc = 1 + Math.floor(next() * 3);
  const vcvs = Math.floor(next() * 3);
  const n = nodes + vsrc + vcvs;
  const G = new SparseMatrix(n);
  const C = new SparseMatrix(n);
  const node = () => Math.floor(next() * nodes);
  const conductance = (a: number, b: number, g: number, m: SparseMatrix) => {
    m.add(a, a, g); m.add(b, b, g); m.add(a, b, -g); m.add(b, a, -g);
  };
  for (let i = 1; i < nodes; i++) conductance(i, Math.floor(next() * i), 10 ** (-1 - 4 * next()), G);
  for (let e = 0; e < nodes; e++) {
    const a = node();
    const b = node();
    if (a === b) continue;
    if (next() < 0.5) conductance(a, b, 10 ** (-1 - 5 * next()), G);
    else conductance(a, b, 10 ** (-15 + 6 * next()), C);
  }
  for (let i = 0; i < nodes; i++) {
    if (next() < 0.3) C.add(i, i, 10 ** (-15 + 6 * next()));
    G.add(i, i, 1e-12);
    if (next() < 0.1) G.add(i, i, 10 ** (-3 * next()));
  }
  // Distinct driven nodes: two ideal sources forcing the same node to ground
  // would make the system structurally singular.
  const driven = new Set<number>();
  const freshNode = () => {
    let a = node();
    while (driven.has(a)) a = (a + 1) % nodes;
    driven.add(a);
    return a;
  };
  let branch = nodes;
  for (let v = 0; v < vsrc; v++, branch++) {
    const a = freshNode();
    G.add(a, branch, 1); G.add(branch, a, 1);
    if (next() < 0.5 && driven.size < nodes) { const b = freshNode(); G.add(b, branch, -1); G.add(branch, b, -1); }
  }
  for (let v = 0; v < vcvs; v++, branch++) {
    const out = freshNode();
    const ctrl = node();
    G.add(out, branch, 1); G.add(branch, out, 1);
    if (ctrl !== out) G.add(branch, ctrl, -(1 + 10 * next()));
  }
  // Exact cancellation and explicit structural zeros.
  if (nodes > 3) { G.touch(0, nodes - 1); G.touch(nodes - 1, 0); }
  return { G: toCsc(G).csc, C: toCsc(C).csc, label: `random seed ${seed} n=${n}` };
}

/**
 * 2-D mesh with one voltage source branch at a corner, as an AC system. The
 * mesh edges are 1 kOhm resistors (in G) or 1 pF capacitors (in C, with G
 * only diagonal), so the ordering must come from the union pattern.
 */
function rcMesh(side: number, edges: 'G' | 'C' = 'G'): AcSystem {
  const nodes = side * side;
  const n = nodes + 1;
  const G = new SparseMatrix(n);
  const C = new SparseMatrix(n);
  const id = (r: number, c: number) => r * side + c;
  const [m, v] = edges === 'G' ? [G, 1e-3] : [C, 1e-12];
  const edge = (a: number, b: number) => {
    m.add(a, a, v); m.add(b, b, v); m.add(a, b, -v); m.add(b, a, -v);
  };
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      if (c + 1 < side) edge(id(r, c), id(r, c + 1));
      if (r + 1 < side) edge(id(r, c), id(r + 1, c));
      C.add(id(r, c), id(r, c), 1e-12);
      G.add(id(r, c), id(r, c), 1e-12);
    }
  }
  G.add(nodes - 1, nodes - 1, 1e-3);
  G.add(0, nodes, 1); G.add(nodes, 0, 1);
  return { G: toCsc(G).csc, C: toCsc(C).csc, label: `rc mesh ${side}x${side}` };
}

function rhsFor(n: number, seed: number): Vec {
  const next = rng(seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = next() - 0.5; im[i] = next() < 0.3 ? next() - 0.5 : 0; }
  return [re, im];
}

const OMEGAS = [0, 2 * Math.PI * 1e3, 2 * Math.PI * 1e6, 2 * Math.PI * 1e9];

describe('ComplexSparseSolver AMD ordering equivalence (#740)', () => {
  it('matches the frozen natural-order kernel and dense elimination on random MNA systems', () => {
    // Forward differences are bounded by conditioning, not by the solver:
    // |x - x_dense| / |x_dense| <= c * n * eps * cond_inf(A). The backward
    // error is the solver's own quality, and must stay at round-off level
    // (the frozen kernel reaches 1.7e-15 on these systems).
    let worstRef = 0;
    let worstBackward = 0;
    let systems = 0;
    let swapped = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { G, C, label } = randomMna(seed, 8 + (seed % 37));
      const solver = new ComplexSparseSolver();
      solver.analyzePattern(G, C);
      for (const omega of OMEGAS) {
        const [bRe, bIm] = rhsFor(G.size, seed * 7 + omega);
        const reference = referenceSolve(G, C, omega, bRe, bIm);
        solver.factorize(G, C, omega);
        const x = solver.solve(bRe, bIm);
        const dense = denseSolve(G, C, omega, bRe, bIm);
        const bound = 64 * G.size * Number.EPSILON * conditionInf(G, C, omega);
        const backward = backwardError(G, C, omega, x, bRe, bIm);
        expect(backward, `${label} omega=${omega} backward error`).toBeLessThan(1e-14);
        expect(relativeDifference(x, dense), `${label} omega=${omega} vs dense`).toBeLessThan(Math.max(1e-12, bound));
        expect(relativeDifference(x, reference), `${label} omega=${omega} vs reference`).toBeLessThan(Math.max(1e-12, bound));
        worstRef = Math.max(worstRef, relativeDifference(x, reference));
        worstBackward = Math.max(worstBackward, backward);
        if (solver.rowSwaps() > 0) swapped++;
        systems++;
      }
    }
    expect(systems).toBe(240);
    expect(swapped).toBeGreaterThan(50); // off-diagonal pivots are exercised
    expect(worstRef).toBeGreaterThan(0); // the order really changed the arithmetic
    console.log(`#740 random: ${systems} systems, ${swapped} with row swaps, max backward error ${worstBackward.toExponential(2)}, max relative difference vs natural order ${worstRef.toExponential(2)}`);
  });

  for (const edges of ['G', 'C'] as const) {
    it(`factors a 2-D mesh (edges in ${edges}) with AMD fill, diagonal pivots and the same answer`, () => {
      const { G, C } = rcMesh(30, edges);
      const solver = new ComplexSparseSolver();
      solver.analyzePattern(G, C);
      const omega = 2 * Math.PI * 1e7;
      solver.factorize(G, C, omega);

      // Same pattern, same ordering: the real AMD solver's fill is the target.
      const union = new SparseMatrix(G.size);
      for (const m of [G, C]) {
        for (let j = 0; j < m.size; j++) {
          for (let p = m.colPtr[j]; p < m.colPtr[j + 1]; p++) union.add(m.rowIdx[p], j, 1 + Math.abs(m.values[p]));
        }
      }
      const real = new GilbertPeierlsSolver();
      const unionCsc = toCsc(union).csc;
      real.analyzePattern(unionCsc);
      real.factorize(unionCsc);
      expect(solver.factorNonzeros()).toBeLessThanOrEqual(Math.ceil(1.05 * real.factorNonzeros()));
      expect(solver.rowSwaps()).toBe(0);

      const natural = new ComplexSparseSolver({ ordering: 'natural' });
      natural.analyzePattern(G, C);
      natural.factorize(G, C, omega);
      expect(solver.factorNonzeros()).toBeLessThan(0.5 * natural.factorNonzeros());

      const [bRe, bIm] = rhsFor(G.size, 3);
      const x = solver.solve(bRe, bIm);
      expect(relativeDifference(x, referenceSolve(G, C, omega, bRe, bIm))).toBeLessThan(1e-11);
      expect(relativeDifference(x, natural.solve(bRe, bIm))).toBeLessThan(1e-11);
    });
  }

  it('builds the union pattern of G and C with explicit zeros as structure', () => {
    const G = new SparseMatrix(3);
    G.add(0, 0, 1); G.touch(2, 0); G.add(1, 2, 4);
    const C = new SparseMatrix(3);
    C.add(1, 0, 2); C.add(2, 0, 3); C.add(1, 1, 5);
    const union = unionPattern(toCsc(G).csc, toCsc(C).csc);
    expect(Array.from(union.colPtr)).toEqual([0, 3, 4, 5]);
    expect(Array.from(union.rowIdx)).toEqual([0, 1, 2, 1, 1]);
  });
});

const CORPUS = fileURLToPath(new URL('../../../../benchmarks/corpus/', import.meta.url));
const CORPUS_AC_DECKS = [
  'ngspice/fixtures/tests/filters/lowpass.cir',
  'ngspice/fixtures/tests/vbic/CEamp.cir',
  'ngspice/fixtures/examples/probe/ac-test.cir',
  'classic/fixtures/spice3f5/rca3040.cir',
  'corpus-e/fixtures/tests/d_bjt-diffpair-ccs.ckt',
  'corpus-e/fixtures/tests/d_coil.1.ckt',
];

/** The #732 deck shape, scaled down: an RC ladder with a VCVS every 50 stages. */
function vcvsLadderDeck(stages: number): string {
  const lines = ['* RC ladder with VCVS buffers (#732 shape)', 'VIN n0 0 AC 1'];
  let prev = 'n0';
  for (let i = 1; i <= stages; i++) {
    lines.push(`R${i} ${prev} n${i} 100`, `C${i} n${i} 0 1p`);
    prev = `n${i}`;
    if (i % 50 === 0) {
      lines.push(`E${i} b${i} 0 n${i} 0 2`, `RL${i} b${i} m${i} 1k`, `VM${i} m${i} x${i} 0`, `CX${i} x${i} 0 1p`);
      prev = `x${i}`;
    }
  }
  lines.push('.ac dec 5 1 1g', '.end');
  return lines.join('\n');
}

describe('ComplexSparseSolver on corpus AC systems (#740)', () => {
  afterEach(() => vi.restoreAllMocks());

  const decks: Array<[string, () => string]> = [
    ...CORPUS_AC_DECKS.map((path): [string, () => string] => [path, () => readFileSync(CORPUS + path, 'utf8')]),
    ['generated VCVS ladder (200 stages)', () => vcvsLadderDeck(200)],
  ];
  for (const [label, read] of decks) {
    it(`agrees with the frozen natural-order kernel on every system of ${label}`, async () => {
      const factorize = vi.spyOn(ComplexSparseSolver.prototype, 'factorize');
      const solve = vi.spyOn(ComplexSparseSolver.prototype, 'solve');
      await simulate(read());
      expect(solve.mock.calls.length).toBeGreaterThan(0);
      let worst = 0;
      let worstBackward = 0;
      // Every solve follows the factorization that preceded it.
      let f = -1;
      const order = [
        ...factorize.mock.invocationCallOrder.map(o => [o, 'f'] as const),
        ...solve.mock.invocationCallOrder.map(o => [o, 's'] as const),
      ].sort((a, b) => a[0] - b[0]);
      let s = 0;
      for (const [, kind] of order) {
        if (kind === 'f') { f++; continue; }
        const [G, C, omega] = factorize.mock.calls[f];
        const [bRe, bIm] = solve.mock.calls[s];
        const x = solve.mock.results[s].value as Vec;
        s++;
        const reference = referenceSolve(G, C, omega, bRe, bIm);
        const d = relativeDifference(x, reference);
        worst = Math.max(worst, d);
        expect(d, `${label}: solve ${s} at omega=${omega}`).toBeLessThan(1e-9);
        const backward = backwardError(G, C, omega, x, bRe, bIm);
        worstBackward = Math.max(worstBackward, backward);
        expect(backward, `${label}: solve ${s} backward error`).toBeLessThan(1e-14);
      }
      expect(s).toBe(solve.mock.calls.length);
      console.log(`#740 ${label}: ${s} solves, max backward error ${worstBackward.toExponential(2)}, max relative difference vs natural order ${worst.toExponential(2)}`);
    });
  }
});
