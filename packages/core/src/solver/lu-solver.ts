import { SparseMatrix } from './sparse-matrix.js';

/**
 * Solve Ax = b using dense LU decomposition with partial pivoting.
 * Converts sparse matrix to dense for the solve — suitable for small-to-medium circuits.
 * For large circuits, replace with a proper sparse LU (KLU via WASM).
 */
export function solveLU(A: SparseMatrix, b: Float64Array): Float64Array {
  const n = A.size;
  if (b.length !== n) {
    throw new Error(`Dimension mismatch: matrix is ${n}x${n}, b has length ${b.length}`);
  }

  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (const [j, val] of A.getRow(i)) {
      M[i * n + j] = val;
    }
  }

  const x = new Float64Array(b);
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;

  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(M[perm[k] * n + k]);
    let maxIdx = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[perm[i] * n + k]);
      if (val > maxVal) {
        maxVal = val;
        maxIdx = i;
      }
    }

    if (maxVal < 1e-18) {
      throw new Error(`Singular matrix at column ${k}`);
    }

    if (maxIdx !== k) {
      const tmp = perm[k];
      perm[k] = perm[maxIdx];
      perm[maxIdx] = tmp;
    }

    const pivotRow = perm[k];

    for (let i = k + 1; i < n; i++) {
      const row = perm[i];
      const factor = M[row * n + k] / M[pivotRow * n + k];
      M[row * n + k] = factor;
      for (let j = k + 1; j < n; j++) {
        M[row * n + j] -= factor * M[pivotRow * n + j];
      }
    }
  }

  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = x[perm[i]];
    for (let j = 0; j < i; j++) {
      y[i] -= M[perm[i] * n + j] * y[j];
    }
  }

  const result = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    result[i] = y[i];
    for (let j = i + 1; j < n; j++) {
      result[i] -= M[perm[i] * n + j] * result[j];
    }
    result[i] /= M[perm[i] * n + i];
  }

  return result;
}

/**
 * Solve a complex system (G + jwC)x = b for AC analysis.
 * Returns [real_part, imag_part] of solution.
 */
export function solveComplexLU(
  Areal: SparseMatrix,
  Aimag: SparseMatrix,
  bReal: Float64Array,
  bImag: Float64Array,
): [Float64Array, Float64Array] {
  const n = Areal.size;
  const N = 2 * n;
  const A = new SparseMatrix(N);

  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i, j, val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i, j + n, -val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i + n, j, val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i + n, j + n, val);
    }
  }

  const b = new Float64Array(N);
  b.set(bReal, 0);
  b.set(bImag, n);

  const x = solveLU(A, b);
  return [x.slice(0, n), x.slice(n)];
}
