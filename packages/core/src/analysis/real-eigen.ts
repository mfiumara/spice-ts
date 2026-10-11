/**
 * Dense real eigenvalue helpers for the bounded `.pz` analysis.
 *
 * `realEigenvalues` balances the matrix, reduces it to upper Hessenberg form with
 * Householder reflections, and runs the Francis implicit double-shift QR iteration
 * (EISPACK `hqr` / Numerical Recipes `hqr`, values only). Complex eigenvalues come
 * back as exact conjugate pairs and real eigenvalues have an exact zero imaginary part.
 *
 * `rangeFactor` and `deflateZeroEigenvalues` remove structurally zero eigenvalues
 * (including Jordan chains) by rank decisions, so callers never have to separate a
 * genuine small eigenvalue from a roundoff-perturbed zero by magnitude alone.
 */

export interface EigenValue {
  real: number;
  imaginary: number;
}

/** Thrown when the QR iteration does not converge within its iteration budget. */
export class EigenConvergenceError extends Error {
  constructor() {
    super('real eigenvalue QR iteration did not converge');
    this.name = 'EigenConvergenceError';
  }
}

const MAX_ITERATIONS_PER_EIGENVALUE = 60;

/** Eigenvalues of a real square matrix. The input is not modified. */
export function realEigenvalues(matrix: readonly (readonly number[])[]): EigenValue[] {
  const size = matrix.length;
  if (size === 0) return [];
  for (const row of matrix) {
    if (row.length !== size) throw new Error('realEigenvalues requires a square matrix');
    for (const value of row) {
      if (!Number.isFinite(value)) throw new Error('realEigenvalues requires finite entries');
    }
  }
  const work = matrix.map(row => [...row]);
  balance(work);
  reduceToHessenberg(work);
  return hessenbergQr(work);
}

/** Rank-revealing factorization `matrix ≈ basis · coefficients` with orthonormal basis columns. */
export interface RangeFactor {
  /** m × r matrix with orthonormal columns. */
  basis: number[][];
  /** r × n matrix, `basisᵀ · matrix`. */
  coefficients: number[][];
  rank: number;
}

/**
 * Column-pivoted modified Gram-Schmidt with reorthogonalization. Columns whose
 * residual norm is at or below `tolerance` are treated as linearly dependent.
 */
export function rangeFactor(matrix: readonly (readonly number[])[], tolerance: number): RangeFactor {
  const rows = matrix.length;
  const columns = rows === 0 ? 0 : matrix[0].length;
  const residual = Array.from({ length: columns }, (_, column) => matrix.map(row => row[column]));
  const used = new Array<boolean>(columns).fill(false);
  const vectors: number[][] = [];

  for (;;) {
    let best = -1;
    let bestNorm = tolerance;
    for (let column = 0; column < columns; column++) {
      if (used[column]) continue;
      const norm = vectorNorm(residual[column]);
      if (norm > bestNorm) {
        best = column;
        bestNorm = norm;
      }
    }
    if (best < 0) break;
    used[best] = true;
    const vector = residual[best].map(value => value / bestNorm);
    for (let pass = 0; pass < 2; pass++) {
      for (const previous of vectors) {
        const projection = dot(previous, vector);
        for (let row = 0; row < rows; row++) vector[row] -= projection * previous[row];
      }
    }
    const norm = vectorNorm(vector);
    if (norm === 0) continue;
    for (let row = 0; row < rows; row++) vector[row] /= norm;
    vectors.push(vector);
    for (let column = 0; column < columns; column++) {
      if (used[column]) continue;
      const projection = dot(vector, residual[column]);
      for (let row = 0; row < rows; row++) residual[column][row] -= projection * vector[row];
    }
  }

  const basis = Array.from({ length: rows }, (_, row) => vectors.map(vector => vector[row]));
  const coefficients = vectors.map(vector => Array.from({ length: columns }, (_, column) => {
    let sum = 0;
    for (let row = 0; row < rows; row++) sum += vector[row] * matrix[row][column];
    return sum;
  }));
  return { basis, coefficients, rank: vectors.length };
}

/** Relative rank tolerance shared by the `.pz` rank decisions (matches `matrixRank`). */
export function rankTolerance(matrix: readonly (readonly number[])[]): number {
  let scale = 0;
  let size = matrix.length;
  for (const row of matrix) {
    size = Math.max(size, row.length);
    for (const value of row) scale = Math.max(scale, Math.abs(value));
  }
  return scale * size * Number.EPSILON * 100;
}

/**
 * Removes the zero eigenvalues of a square matrix, including nilpotent Jordan chains.
 * While `M = Q R` is rank deficient, `M` is replaced by `R Q`, which has the same
 * nonzero eigenvalues with the same Jordan structure and one fewer level of every
 * zero chain. Returns the reduced matrix and the number of zero eigenvalues removed.
 *
 * The rank tolerance is fixed from the input matrix: every reduced matrix is a product
 * of pieces of the original, so a chain remainder must be judged against the original
 * scale, not against its own (a 1 × 1 remainder is never small relative to itself).
 */
export function deflateZeroEigenvalues(
  matrix: readonly (readonly number[])[],
): { matrix: number[][]; removed: number } {
  let current = matrix.map(row => [...row]);
  let removed = 0;
  const tolerance = rankTolerance(matrix);
  while (current.length > 0) {
    const factor = rangeFactor(current, tolerance);
    if (factor.rank === current.length) break;
    removed += current.length - factor.rank;
    current = multiply(factor.coefficients, factor.basis);
  }
  return { matrix: current, removed };
}

/**
 * Index sets of the irreducible diagonal blocks of a square matrix (strongly connected
 * components of its exact nonzero pattern). After a symmetric permutation the matrix is
 * block triangular, so its eigenvalues are the union of the blocks' eigenvalues. Unilateral
 * couplings (for example cascaded transconductance stages) live between blocks and no
 * longer distort rank decisions inside a block.
 */
export function irreducibleBlocks(matrix: readonly (readonly number[])[]): number[][] {
  const size = matrix.length;
  const index = new Array<number>(size).fill(-1);
  const low = new Array<number>(size).fill(0);
  const onStack = new Array<boolean>(size).fill(false);
  const stack: number[] = [];
  const blocks: number[][] = [];
  let counter = 0;

  const visit = (vertex: number): void => {
    index[vertex] = counter;
    low[vertex] = counter;
    counter++;
    stack.push(vertex);
    onStack[vertex] = true;
    for (let next = 0; next < size; next++) {
      if (next === vertex || matrix[vertex][next] === 0) continue;
      if (index[next] < 0) {
        visit(next);
        low[vertex] = Math.min(low[vertex], low[next]);
      } else if (onStack[next]) {
        low[vertex] = Math.min(low[vertex], index[next]);
      }
    }
    if (low[vertex] === index[vertex]) {
      const block: number[] = [];
      let member: number;
      do {
        member = stack.pop()!;
        onStack[member] = false;
        block.push(member);
      } while (member !== vertex);
      blocks.push(block.sort((left, right) => left - right));
    }
  };

  for (let vertex = 0; vertex < size; vertex++) if (index[vertex] < 0) visit(vertex);
  return blocks.sort((left, right) => left[0] - right[0]);
}

/**
 * Rank-revealing factorization `matrix ≈ left · right` (left m × r, right r × n) computed on
 * a power-of-two row/column equilibrated copy, so the rank decision does not depend on
 * the units of individual rows or columns (for example henries next to picofarads).
 */
export function equilibratedRangeFactor(
  matrix: readonly (readonly number[])[],
): { left: number[][]; right: number[][]; rank: number } {
  const rows = matrix.length;
  const columns = rows === 0 ? 0 : matrix[0].length;
  const rowScale = new Array<number>(rows).fill(1);
  const columnScale = new Array<number>(columns).fill(1);
  const scaled = matrix.map(row => [...row]);
  for (let iteration = 0; iteration < 20; iteration++) {
    let changed = false;
    for (let row = 0; row < rows; row++) {
      const factor = powerOfTwoScale(Math.max(...scaled[row].map(Math.abs)));
      if (factor === 1) continue;
      changed = true;
      rowScale[row] *= factor;
      for (let column = 0; column < columns; column++) scaled[row][column] *= factor;
    }
    for (let column = 0; column < columns; column++) {
      let maximum = 0;
      for (let row = 0; row < rows; row++) maximum = Math.max(maximum, Math.abs(scaled[row][column]));
      const factor = powerOfTwoScale(maximum);
      if (factor === 1) continue;
      changed = true;
      columnScale[column] *= factor;
      for (let row = 0; row < rows; row++) scaled[row][column] *= factor;
    }
    if (!changed) break;
  }
  const factor = rangeFactor(scaled, rankTolerance(scaled));
  // scaled = Dr · matrix · Dc  ⇒  matrix = (Dr⁻¹ · basis) · (coefficients · Dc⁻¹)
  const left = factor.basis.map((row, rowIndex) => row.map(value => value / rowScale[rowIndex]));
  const right = factor.coefficients.map(row => row.map((value, column) => value / columnScale[column]));
  return { left, right, rank: factor.rank };
}

/** 2^-round(log2(sqrt(maximum)))-style scale that moves `maximum` toward 1; 1 for zero rows. */
function powerOfTwoScale(maximum: number): number {
  if (maximum === 0 || !Number.isFinite(maximum)) return 1;
  const exponent = Math.round(Math.log2(maximum) / 2);
  return exponent === 0 ? 1 : 2 ** -exponent;
}

export function multiply(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
): number[][] {
  const rows = left.length;
  const inner = right.length;
  const columns = inner === 0 ? 0 : right[0].length;
  const product = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row++) {
    for (let index = 0; index < inner; index++) {
      const value = left[row][index];
      if (value === 0) continue;
      for (let column = 0; column < columns; column++) {
        product[row][column] += value * right[index][column];
      }
    }
  }
  return product;
}

function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index++) sum += left[index] * right[index];
  return sum;
}

function vectorNorm(vector: readonly number[]): number {
  let scale = 0;
  for (const value of vector) scale = Math.max(scale, Math.abs(value));
  if (scale === 0) return 0;
  let sum = 0;
  for (const value of vector) sum += (value / scale) ** 2;
  return scale * Math.sqrt(sum);
}

/** Diagonal similarity scaling by powers of two (EISPACK `balanc`, no permutation). */
function balance(a: number[][]): void {
  const size = a.length;
  const radix = 2;
  const radixSquared = radix * radix;
  let converged = false;
  while (!converged) {
    converged = true;
    for (let i = 0; i < size; i++) {
      let columnNorm = 0;
      let rowNorm = 0;
      for (let j = 0; j < size; j++) {
        if (j === i) continue;
        columnNorm += Math.abs(a[j][i]);
        rowNorm += Math.abs(a[i][j]);
      }
      if (columnNorm === 0 || rowNorm === 0) continue;
      const sum = columnNorm + rowNorm;
      let factor = 1;
      let threshold = rowNorm / radix;
      while (columnNorm < threshold) {
        factor *= radix;
        columnNorm *= radixSquared;
      }
      threshold = rowNorm * radix;
      while (columnNorm > threshold) {
        factor /= radix;
        columnNorm /= radixSquared;
      }
      if ((columnNorm + rowNorm) / factor < 0.95 * sum) {
        converged = false;
        const inverse = 1 / factor;
        for (let j = 0; j < size; j++) a[i][j] *= inverse;
        for (let j = 0; j < size; j++) a[j][i] *= factor;
      }
    }
  }
}

/** Householder similarity reduction to upper Hessenberg form, in place. */
function reduceToHessenberg(a: number[][]): void {
  const size = a.length;
  for (let k = 0; k < size - 2; k++) {
    let scale = 0;
    for (let i = k + 1; i < size; i++) scale = Math.max(scale, Math.abs(a[i][k]));
    if (scale === 0) continue;
    const v: number[] = [];
    let normSquared = 0;
    for (let i = k + 1; i < size; i++) {
      const value = a[i][k] / scale;
      v.push(value);
      normSquared += value * value;
    }
    const alpha = (v[0] >= 0 ? -1 : 1) * Math.sqrt(normSquared);
    v[0] -= alpha;
    const vNormSquared = v.reduce((sum, value) => sum + value * value, 0);
    if (vNormSquared === 0) continue;
    // Left application: rows k+1.., columns k..
    for (let j = k; j < size; j++) {
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i] * a[k + 1 + i][j];
      s = 2 * s / vNormSquared;
      for (let i = 0; i < v.length; i++) a[k + 1 + i][j] -= s * v[i];
    }
    // Right application: all rows, columns k+1..
    for (let i = 0; i < size; i++) {
      let s = 0;
      for (let j = 0; j < v.length; j++) s += a[i][k + 1 + j] * v[j];
      s = 2 * s / vNormSquared;
      for (let j = 0; j < v.length; j++) a[i][k + 1 + j] -= s * v[j];
    }
    a[k + 1][k] = alpha * scale;
    for (let i = k + 2; i < size; i++) a[i][k] = 0;
  }
}

function sign(magnitude: number, reference: number): number {
  return reference >= 0 ? Math.abs(magnitude) : -Math.abs(magnitude);
}

/**
 * Francis double-shift QR on an upper Hessenberg matrix (values only), destroying it.
 * Port of Numerical Recipes / EISPACK `hqr` using 1-based indices internally.
 */
function hessenbergQr(hessenberg: number[][]): EigenValue[] {
  const n = hessenberg.length;
  const a: number[][] = [new Array<number>(n + 1).fill(0)];
  for (const row of hessenberg) a.push([0, ...row]);
  const wr = new Array<number>(n + 1).fill(0);
  const wi = new Array<number>(n + 1).fill(0);

  let anorm = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
  }

  let nn = n;
  let t = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  let s = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) {
          a[l][l - 1] = 0;
          break;
        }
      }
      x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn] = 0;
        nn--;
      } else {
        y = a[nn - 1][nn - 1];
        w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = x + z;
            wr[nn] = z !== 0 ? x - w / z : x + z;
            wi[nn - 1] = 0;
            wi[nn] = 0;
          } else {
            wr[nn - 1] = x + p;
            wr[nn] = x + p;
            wi[nn - 1] = -z;
            wi[nn] = z;
          }
          nn -= 2;
        } else {
          if (its === MAX_ITERATIONS_PER_EIGENVALUE) throw new EigenConvergenceError();
          if (its > 0 && its % 10 === 0) {
            // Exceptional shift.
            t += x;
            for (let i = 1; i <= nn; i++) a[i][i] -= x;
            s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            x = 0.75 * s;
            y = x;
            w = -0.4375 * s * s;
          }
          its++;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k][k - 1] = -a[k][k - 1];
              } else {
                a[k][k - 1] = -s * x;
              }
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) {
                  p += r * a[k + 2][j];
                  a[k + 2][j] -= p * z;
                }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) {
                  p += z * a[i][k + 2];
                  a[i][k + 2] -= p * r;
                }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }

  const values: EigenValue[] = [];
  for (let i = 1; i <= n; i++) values.push({ real: wr[i], imaginary: wi[i] });
  return values;
}
