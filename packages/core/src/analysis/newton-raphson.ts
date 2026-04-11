import type { DeviceModel } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { ResolvedOptions } from '../types.js';
import { toCsc, updateCscValues, type ScatterMap, type CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { ConvergenceError } from '../errors.js';

export function newtonRaphson(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  options: ResolvedOptions,
  maxIter: number,
  nodeNames: string[],
): number {
  const solver = createSparseSolver();
  let csc: CscMatrix | null = null;
  let scatter: ScatterMap | null = null;
  let patternAnalyzed = false;
  let prevNnz = -1;

  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();

    const ctx = assembler.getStampContext();
    for (const device of devices) {
      device.stamp(ctx);
    }

    for (let i = 0; i < assembler.numNodes; i++) {
      assembler.G.add(i, i, options.gmin);
    }

    // Convert sparse matrix to CSC format.
    // On the first iteration (or if the sparsity pattern changes), do a full
    // conversion and (re-)analyze the symbolic structure. On subsequent
    // iterations with the same pattern, only update the numeric values.
    if (!patternAnalyzed) {
      const result = toCsc(assembler.G);
      csc = result.csc;
      scatter = result.scatter;
      prevNnz = csc.values.length;
      solver.analyzePattern(csc);
      patternAnalyzed = true;
    } else {
      // Rebuild CSC from scratch every iteration to handle any structural
      // changes (e.g. a MOSFET moving between cutoff and saturation may
      // stamp different non-zero positions).
      const result = toCsc(assembler.G);
      const nnz = result.csc.values.length;
      if (nnz !== prevNnz) {
        // Pattern changed — must re-analyze
        csc = result.csc;
        scatter = result.scatter;
        prevNnz = nnz;
        solver.analyzePattern(csc);
      } else {
        updateCscValues(csc!, assembler.G, scatter!);
      }
    }

    solver.factorize(csc!);
    const x = solver.solve(new Float64Array(assembler.b));
    assembler.solution.set(x);

    if (isConverged(assembler.solution, assembler.prevSolution, assembler.numNodes, options)) {
      return iter + 1;
    }
  }

  const oscillating = findOscillatingNodes(
    assembler.solution, assembler.prevSolution,
    assembler.numNodes, nodeNames, options,
  );

  throw new ConvergenceError(
    `Did not converge in ${maxIter} iterations`,
    undefined, oscillating,
    new Float64Array(assembler.solution),
    new Float64Array(assembler.prevSolution),
  );
}

function isConverged(
  current: Float64Array, previous: Float64Array,
  numNodes: number, options: ResolvedOptions,
): boolean {
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = i < numNodes
      ? options.vntol + options.reltol * Math.abs(current[i])
      : options.abstol + options.reltol * Math.abs(current[i]);
    if (diff > tol) return false;
  }
  return true;
}

function findOscillatingNodes(
  current: Float64Array, previous: Float64Array,
  numNodes: number, nodeNames: string[], options: ResolvedOptions,
): string[] {
  const result: string[] = [];
  for (let i = 0; i < numNodes; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = options.vntol + options.reltol * Math.abs(current[i]);
    if (diff > tol) result.push(nodeNames[i] ?? `node_${i}`);
  }
  return result;
}
