import { SparseMatrix } from '../solver/sparse-matrix.js';
import type { CscMatrix } from '../solver/csc-matrix.js';
import type { StampContext } from '../devices/device.js';

export class MNAAssembler {
  public readonly G: SparseMatrix;
  public readonly C: SparseMatrix;
  public readonly b: Float64Array;
  public readonly solution: Float64Array;
  public readonly prevSolution: Float64Array;
  public readonly systemSize: number;
  public time = 0;
  public dt = 0;
  public sourceScale = 1;

  // Fast-path typed-array stamping infrastructure
  private _fastPath = false;
  private _gValues: Float64Array | null = null;
  private _cValues: Float64Array | null = null;
  private _colPtr: Int32Array | null = null;
  private _rowIdx: Int32Array | null = null;
  private _diagIdx: Int32Array | null = null;
  private _posMap: Int32Array | null = null;

  constructor(
    public readonly numNodes: number,
    public readonly numBranches: number,
  ) {
    this.systemSize = numNodes + numBranches;
    this.G = new SparseMatrix(this.systemSize);
    this.C = new SparseMatrix(this.systemSize);
    this.b = new Float64Array(this.systemSize);
    this.solution = new Float64Array(this.systemSize);
    this.prevSolution = new Float64Array(this.systemSize);
  }

  get isFastPath(): boolean {
    return this._fastPath;
  }

  get gValues(): Float64Array {
    if (!this._gValues) throw new Error('lockTopology() has not been called');
    return this._gValues;
  }

  get cValues(): Float64Array {
    if (!this._cValues) throw new Error('lockTopology() has not been called');
    return this._cValues;
  }

  get colPtr(): Int32Array {
    if (!this._colPtr) throw new Error('lockTopology() has not been called');
    return this._colPtr;
  }

  get rowIdx(): Int32Array {
    if (!this._rowIdx) throw new Error('lockTopology() has not been called');
    return this._rowIdx;
  }

  get diagIdx(): Int32Array {
    if (!this._diagIdx) throw new Error('lockTopology() has not been called');
    return this._diagIdx;
  }

  /**
   * Lock the sparsity pattern after the first stamp pass.
   * Builds CSC structure from the union of all G and C non-zero positions,
   * allocates typed arrays, copies current values, and enables fast-path stamping.
   */
  lockTopology(): void {
    const n = this.systemSize;

    // Collect union of all non-zero positions from G and C
    // Use a Set of (row * n + col) keys
    const positionSet = new Set<number>();
    for (let i = 0; i < n; i++) {
      const gRow = this.G.getRow(i);
      for (const [j] of gRow) {
        positionSet.add(i * n + j);
      }
      const cRow = this.C.getRow(i);
      for (const [j] of cRow) {
        positionSet.add(i * n + j);
      }
    }

    // Build CSC structure: group entries by column, sorted by row within each column
    const colEntries: number[][] = [];
    for (let j = 0; j < n; j++) colEntries.push([]);

    for (const key of positionSet) {
      const row = Math.floor(key / n);
      const col = key % n;
      colEntries[col].push(row);
    }

    for (let j = 0; j < n; j++) {
      colEntries[j].sort((a, b) => a - b);
    }

    const nnz = positionSet.size;
    const colPtr = new Int32Array(n + 1);
    const rowIdx = new Int32Array(nnz);
    const gValues = new Float64Array(nnz);
    const cValues = new Float64Array(nnz);
    const posMap = new Int32Array(n * n).fill(-1);
    const diagIdx = new Int32Array(n).fill(-1);

    let idx = 0;
    for (let j = 0; j < n; j++) {
      colPtr[j] = idx;
      for (const row of colEntries[j]) {
        rowIdx[idx] = row;
        const key = row * n + j;
        posMap[key] = idx;
        gValues[idx] = this.G.get(row, j);
        cValues[idx] = this.C.get(row, j);
        if (row === j) {
          diagIdx[row] = idx;
        }
        idx++;
      }
    }
    colPtr[n] = idx;

    this._colPtr = colPtr;
    this._rowIdx = rowIdx;
    this._gValues = gValues;
    this._cValues = cValues;
    this._posMap = posMap;
    this._diagIdx = diagIdx;
    this._fastPath = true;
  }

  /**
   * Returns a CscMatrix view backed by the current gValues.
   * Only available after lockTopology().
   */
  getCscMatrix(): CscMatrix {
    return {
      size: this.systemSize,
      colPtr: this.colPtr,
      rowIdx: this.rowIdx,
      values: this.gValues,
    };
  }

  getStampContext(): StampContext {
    if (this._fastPath) {
      const n = this.systemSize;
      const posMap = this._posMap!;
      const gValues = this._gValues!;
      const cValues = this._cValues!;
      return {
        stampG: (row, col, value) => {
          gValues[posMap[row * n + col]] += value;
        },
        stampB: (row, value) => { this.b[row] += value; },
        stampC: (row, col, value) => {
          cValues[posMap[row * n + col]] += value;
        },
        getVoltage: (node) => this.solution[node],
        getCurrent: (branch) => this.solution[this.numNodes + branch],
        time: this.time,
        dt: this.dt,
        numNodes: this.numNodes,
        sourceScale: this.sourceScale,
      };
    }

    return {
      stampG: (row, col, value) => this.G.add(row, col, value),
      stampB: (row, value) => { this.b[row] += value; },
      stampC: (row, col, value) => this.C.add(row, col, value),
      getVoltage: (node) => this.solution[node],
      getCurrent: (branch) => this.solution[this.numNodes + branch],
      time: this.time,
      dt: this.dt,
      numNodes: this.numNodes,
      sourceScale: this.sourceScale,
    };
  }

  clear(): void {
    if (this._fastPath) {
      this._gValues!.fill(0);
      this._cValues!.fill(0);
      this.b.fill(0);
      return;
    }
    this.G.clear();
    this.C.clear();
    this.b.fill(0);
  }

  saveSolution(): void {
    this.prevSolution.set(this.solution);
  }

  setTime(time: number, dt: number): void {
    this.time = time;
    this.dt = dt;
  }
}
