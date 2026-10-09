import { SparseMatrix } from '../solver/sparse-matrix.js';
import type { CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver, type SparseSolver } from '../solver/sparse-solver.js';
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
  private _stampIndex: ((row: number, col: number) => number) | null = null;
  private _cachedFastCtx: StampContext | null = null;
  private _solver: SparseSolver | null = null;

  constructor(
    public readonly numNodes: number,
    public readonly numBranches: number,
    private readonly solverFactory: () => SparseSolver = createSparseSolver,
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

  get topologyNnz(): number {
    if (!this._rowIdx) throw new Error('lockTopology() has not been called');
    return this._rowIdx.length;
  }

  get stampIndex(): (row: number, col: number) => number {
    if (!this._stampIndex) throw new Error('lockTopology() has not been called');
    return this._stampIndex;
  }

  /**
   * Lock the sparsity pattern after the first stamp pass.
   * Builds CSC structure from the union of all G and C non-zero positions,
   * allocates typed arrays, copies current values, and enables fast-path stamping.
   */
  lockTopology(): void {
    if (this._fastPath) return;
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
    const diagIdx = new Int32Array(n).fill(-1);

    let idx = 0;
    for (let j = 0; j < n; j++) {
      colPtr[j] = idx;
      for (const row of colEntries[j]) {
        rowIdx[idx] = row;
        gValues[idx] = this.G.get(row, j);
        cValues[idx] = this.C.get(row, j);
        if (row === j) {
          diagIdx[row] = idx;
        }
        idx++;
      }
    }
    colPtr[n] = idx;

    // Build a compact open-addressed lookup over structural entries. The load
    // factor stays at or below 0.5, so stamping remains expected O(1) while
    // lookup storage is O(nnz), rather than the old O(n²) dense position map.
    let lookupCapacity = 4;
    while (lookupCapacity < nnz * 2) lookupCapacity *= 2;
    const lookupRows = new Int32Array(lookupCapacity).fill(-1);
    const lookupCols = new Int32Array(lookupCapacity);
    const lookupIndices = new Int32Array(lookupCapacity);
    const lookupMask = lookupCapacity - 1;
    const hashPosition = (row: number, col: number): number => {
      let hash = Math.imul(row, -1640531527) ^ Math.imul(col, -2048144789);
      hash ^= hash >>> 16;
      return hash & lookupMask;
    };
    for (let col = 0; col < n; col++) {
      for (let position = colPtr[col]; position < colPtr[col + 1]; position++) {
        const row = rowIdx[position];
        let slot = hashPosition(row, col);
        while (lookupRows[slot] !== -1) slot = (slot + 1) & lookupMask;
        lookupRows[slot] = row;
        lookupCols[slot] = col;
        lookupIndices[slot] = position;
      }
    }
    const stampIndex = (row: number, col: number): number => {
      if (row < 0 || row >= n || col < 0 || col >= n) {
        throw new Error(`Cannot stamp (${row}, ${col}) outside locked topology`);
      }
      let slot = hashPosition(row, col);
      while (lookupRows[slot] !== -1) {
        if (lookupRows[slot] === row && lookupCols[slot] === col) {
          return lookupIndices[slot];
        }
        slot = (slot + 1) & lookupMask;
      }
      throw new Error(`Cannot stamp (${row}, ${col}) outside locked topology`);
    };

    this._colPtr = colPtr;
    this._rowIdx = rowIdx;
    this._gValues = gValues;
    this._cValues = cValues;
    this._stampIndex = stampIndex;
    this._diagIdx = diagIdx;
    this._fastPath = true;
  }

  /**
   * Return the solver bound to the currently locked topology.
   * Symbolic analysis runs once here; callers still factorize for every
   * changed set of numeric matrix values.
   */
  getSparseSolver(): SparseSolver {
    if (!this._fastPath) {
      throw new Error('lockTopology() must be called before requesting a sparse solver');
    }
    if (!this._solver) {
      this._solver = this.solverFactory();
      this._solver.analyzePattern(this.getCscMatrix());
    }
    return this._solver;
  }

  /**
   * Discard locked structural storage and its symbolic analysis before a
   * caller re-stamps a different topology. Solution vectors are retained so
   * they may be used as an initial guess after the topology change.
   */
  invalidateTopology(): void {
    this._fastPath = false;
    this._gValues = null;
    this._cValues = null;
    this._colPtr = null;
    this._rowIdx = null;
    this._diagIdx = null;
    this._stampIndex = null;
    this._cachedFastCtx = null;
    this._solver = null;
    this.G.clear();
    this.C.clear();
    this.b.fill(0);
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
      if (!this._cachedFastCtx) {
        const stampIndex = this._stampIndex!;
        const gValues = this._gValues!;
        const cValues = this._cValues!;
        this._cachedFastCtx = {
          stampG: (row, col, value) => {
            gValues[stampIndex(row, col)] += value;
          },
          stampB: (row, value) => { this.b[row] += value; },
          stampC: (row, col, value) => {
            cValues[stampIndex(row, col)] += value;
          },
          getVoltage: (node) => this.solution[node],
          getCurrent: (branch) => this.solution[this.numNodes + branch],
          time: 0,
          dt: 0,
          numNodes: this.numNodes,
          sourceScale: 1,
        };
      }
      this._cachedFastCtx.time = this.time;
      this._cachedFastCtx.dt = this.dt;
      this._cachedFastCtx.sourceScale = this.sourceScale;
      return this._cachedFastCtx;
    }

    return {
      stampG: (row, col, value) => {
        this.G.add(row, col, value);
        // Always register position so lockTopology() captures the full pattern
        if (value === 0) this.G.touch(row, col);
      },
      stampB: (row, value) => { this.b[row] += value; },
      stampC: (row, col, value) => {
        this.C.add(row, col, value);
        if (value === 0) this.C.touch(row, col);
      },
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
