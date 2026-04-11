import type { SparseMatrix } from './sparse-matrix.js';

export interface CscMatrix {
  readonly size: number;
  readonly colPtr: Int32Array;
  readonly rowIdx: Int32Array;
  readonly values: Float64Array;
}

export type ScatterMap = Map<number, number>;

export function toCsc(sparse: SparseMatrix): { csc: CscMatrix; scatter: ScatterMap } {
  const n = sparse.size;
  const colEntries: { row: number; val: number }[][] = [];
  for (let j = 0; j < n; j++) colEntries.push([]);

  for (let i = 0; i < n; i++) {
    const row = sparse.getRow(i);
    for (const [j, val] of row) {
      colEntries[j].push({ row: i, val });
    }
  }

  for (let j = 0; j < n; j++) {
    colEntries[j].sort((a, b) => a.row - b.row);
  }

  let nnz = 0;
  for (let j = 0; j < n; j++) nnz += colEntries[j].length;

  const colPtr = new Int32Array(n + 1);
  const rowIdx = new Int32Array(nnz);
  const values = new Float64Array(nnz);
  const scatter: ScatterMap = new Map();

  let idx = 0;
  for (let j = 0; j < n; j++) {
    colPtr[j] = idx;
    for (const entry of colEntries[j]) {
      rowIdx[idx] = entry.row;
      values[idx] = entry.val;
      scatter.set(entry.row * n + j, idx);
      idx++;
    }
  }
  colPtr[n] = idx;

  return { csc: { size: n, colPtr, rowIdx, values }, scatter };
}

export function countNnz(sparse: SparseMatrix): number {
  let count = 0;
  for (let i = 0; i < sparse.size; i++) {
    count += sparse.getRow(i).size;
  }
  return count;
}

export function updateCscValues(
  csc: CscMatrix,
  sparse: SparseMatrix,
  scatter: ScatterMap,
): void {
  csc.values.fill(0);
  const n = csc.size;
  for (let i = 0; i < n; i++) {
    const row = sparse.getRow(i);
    for (const [j, val] of row) {
      const idx = scatter.get(i * n + j);
      if (idx !== undefined) {
        (csc.values as Float64Array)[idx] = val;
      }
    }
  }
}
