import type { DeviceModel } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { ResolvedOptions } from '../types.js';
import { solveLU } from '../solver/lu-solver.js';
import { ConvergenceError } from '../errors.js';

export function newtonRaphson(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  options: ResolvedOptions,
  maxIter: number,
  nodeNames: string[],
): number {
  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();

    const ctx = assembler.getStampContext();
    for (const device of devices) {
      device.stamp(ctx);
    }

    // Add GMIN to all node diagonals for numerical stability
    // (standard SPICE practice — prevents singular matrix from cutoff devices)
    for (let i = 0; i < assembler.numNodes; i++) {
      assembler.G.add(i, i, options.gmin);
    }

    const x = solveLU(assembler.G, new Float64Array(assembler.b));
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
