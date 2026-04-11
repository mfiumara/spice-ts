import { SparseMatrix } from '../solver/sparse-matrix.js';
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

  getStampContext(): StampContext {
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
