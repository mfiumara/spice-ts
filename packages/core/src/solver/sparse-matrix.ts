/**
 * Sparse matrix using a Map-of-Maps (dictionary of keys) format.
 * Optimized for incremental assembly (stamping) and moderate sizes.
 * For very large circuits, replace with CSC format.
 */
export class SparseMatrix {
  private rows: Map<number, Map<number, number>> = new Map();

  constructor(public readonly size: number) {}

  add(row: number, col: number, value: number): void {
    if (value === 0) return;
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    rowMap.set(col, (rowMap.get(col) ?? 0) + value);
  }

  /** Register a structural non-zero position without adding a value. */
  touch(row: number, col: number): void {
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    if (!rowMap.has(col)) {
      rowMap.set(col, 0);
    }
  }

  get(row: number, col: number): number {
    return this.rows.get(row)?.get(col) ?? 0;
  }

  set(row: number, col: number, value: number): void {
    if (value === 0) {
      this.rows.get(row)?.delete(col);
      return;
    }
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    rowMap.set(col, value);
  }

  addMatrix(other: SparseMatrix, scale: number): void {
    for (const [row, cols] of other.rows) {
      for (const [col, val] of cols) {
        this.add(row, col, scale * val);
      }
    }
  }

  clear(): void {
    this.rows.clear();
  }

  toDense(): number[][] {
    const dense: number[][] = [];
    for (let i = 0; i < this.size; i++) {
      dense[i] = [];
      for (let j = 0; j < this.size; j++) {
        dense[i][j] = this.get(i, j);
      }
    }
    return dense;
  }

  getRow(row: number): Map<number, number> {
    return this.rows.get(row) ?? new Map();
  }

  get isEmpty(): boolean {
    return this.rows.size === 0;
  }
}
