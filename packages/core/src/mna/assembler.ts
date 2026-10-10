import { SparseMatrix } from '../solver/sparse-matrix.js';
import type { CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver, type SparseSolver } from '../solver/sparse-solver.js';
import type { StampContext } from '../devices/device.js';
import type { MatrixVariableIdentity } from '../errors.js';

export function createMatrixVariableIdentities(
  nodeNames: readonly string[],
  branchNames: readonly string[],
): MatrixVariableIdentity[] {
  return [
    ...nodeNames.map(name => ({ kind: 'node' as const, name })),
    ...branchNames.map(name => ({ kind: 'branch' as const, name })),
  ];
}

export interface MNAAssemblerOptions {
  solverFactory?: () => SparseSolver;
  variables?: readonly MatrixVariableIdentity[];
  useDcSourceValue?: boolean;
}

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
    private readonly options: MNAAssemblerOptions = {},
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

    // Collect the G/C structural union in a typed open-addressed table. Start
    // proportional to the mandatory CSC column pointer and grow only when the
    // actual sparsity requires it; this avoids a boxed Set and one Array per
    // column while remaining general for arbitrary sparsity.
    let lookupCapacity = 4;
    while (lookupCapacity < n * 4) lookupCapacity *= 2;
    let lookupRows = new Int32Array(lookupCapacity).fill(-1);
    let lookupCols = new Int32Array(lookupCapacity);
    let lookupIndices = new Int32Array(lookupCapacity);
    let initialGValues = new Float64Array(lookupCapacity);
    let initialCValues = new Float64Array(lookupCapacity);
    let lookupMask = lookupCapacity - 1;
    let nnz = 0;
    const columnCounts = new Int32Array(n);

    const hashPosition = (row: number, col: number): number => {
      let hash = Math.imul(row, -1640531527) ^ Math.imul(col, -2048144789);
      hash ^= hash >>> 16;
      return hash & lookupMask;
    };
    const growLookup = (): void => {
      const previousRows = lookupRows;
      const previousCols = lookupCols;
      const previousGValues = initialGValues;
      const previousCValues = initialCValues;
      lookupCapacity *= 2;
      lookupRows = new Int32Array(lookupCapacity).fill(-1);
      lookupCols = new Int32Array(lookupCapacity);
      lookupIndices = new Int32Array(lookupCapacity);
      initialGValues = new Float64Array(lookupCapacity);
      initialCValues = new Float64Array(lookupCapacity);
      lookupMask = lookupCapacity - 1;
      for (let previousSlot = 0; previousSlot < previousRows.length; previousSlot++) {
        const row = previousRows[previousSlot];
        if (row === -1) continue;
        const col = previousCols[previousSlot];
        let slot = hashPosition(row, col);
        while (lookupRows[slot] !== -1) slot = (slot + 1) & lookupMask;
        lookupRows[slot] = row;
        lookupCols[slot] = col;
        initialGValues[slot] = previousGValues[previousSlot];
        initialCValues[slot] = previousCValues[previousSlot];
      }
    };
    const addPosition = (row: number, col: number, value: number, isG: boolean): void => {
      let slot = hashPosition(row, col);
      while (lookupRows[slot] !== -1) {
        if (lookupRows[slot] === row && lookupCols[slot] === col) {
          if (isG) initialGValues[slot] = value;
          else initialCValues[slot] = value;
          return;
        }
        slot = (slot + 1) & lookupMask;
      }
      if ((nnz + 1) * 2 > lookupCapacity) {
        growLookup();
        slot = hashPosition(row, col);
        while (lookupRows[slot] !== -1) slot = (slot + 1) & lookupMask;
      }
      lookupRows[slot] = row;
      lookupCols[slot] = col;
      if (isG) initialGValues[slot] = value;
      else initialCValues[slot] = value;
      columnCounts[col]++;
      nnz++;
    };
    for (let row = 0; row < n; row++) {
      for (const [col, value] of this.G.getRow(row)) addPosition(row, col, value, true);
      for (const [col, value] of this.C.getRow(row)) addPosition(row, col, value, false);
    }

    const colPtr = new Int32Array(n + 1);
    const rowIdx = new Int32Array(nnz);
    const gValues = new Float64Array(nnz);
    const cValues = new Float64Array(nnz);
    const diagIdx = new Int32Array(n).fill(-1);

    for (let col = 0; col < n; col++) colPtr[col + 1] = colPtr[col] + columnCounts[col];
    const columnOffsets = colPtr.slice(0, n);
    for (let slot = 0; slot < lookupCapacity; slot++) {
      const row = lookupRows[slot];
      if (row === -1) continue;
      const col = lookupCols[slot];
      rowIdx[columnOffsets[col]++] = row;
    }
    for (let col = 0; col < n; col++) {
      rowIdx.subarray(colPtr[col], colPtr[col + 1]).sort();
    }
    for (let col = 0; col < n; col++) {
      for (let position = colPtr[col]; position < colPtr[col + 1]; position++) {
        const row = rowIdx[position];
        let slot = hashPosition(row, col);
        while (lookupRows[slot] !== row || lookupCols[slot] !== col) {
          slot = (slot + 1) & lookupMask;
        }
        gValues[position] = initialGValues[slot];
        cValues[position] = initialCValues[slot];
        lookupIndices[slot] = position;
        if (row === col) diagIdx[row] = position;
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
      this._solver = (this.options.solverFactory ?? createSparseSolver)();
      this._solver.analyzePattern(this.getCscMatrix(), this.options.variables);
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
          useDcSourceValue: this.options.useDcSourceValue ?? false,
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
      useDcSourceValue: this.options.useDcSourceValue ?? false,
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
