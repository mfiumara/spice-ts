import type { DeviceModel } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { DCConvergenceTelemetry, ResolvedOptions } from '../types.js';
import { ConvergenceError } from '../errors.js';
import { MOSFET } from '../devices/mosfet.js';

export function newtonRaphson(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  options: ResolvedOptions,
  maxIter: number,
  nodeNames: string[],
  telemetry?: DCConvergenceTelemetry,
): number {
  // Pre-classify devices for batch stamping (built lazily after first iteration)
  let mosfets: MOSFET[] | null = null;
  let otherDevices: DeviceModel[] | null = null;

  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();

    const ctx = assembler.getStampContext();

    if (assembler.isFastPath && mosfets !== null && mosfets.length > 0) {
      // Fast path: batch-stamp MOSFETs with direct array writes
      MOSFET.batchStamp(
        mosfets, assembler.gValues, assembler.b, assembler.solution,
        assembler.stampIndex,
      );
      for (const device of otherDevices!) device.stamp(ctx);
    } else {
      for (const device of devices) device.stamp(ctx);
    }

    if (!assembler.isFastPath) {
      // First iteration: Map-based stamp completed. Add GMIN via Map, then lock topology.
      for (let i = 0; i < assembler.numNodes; i++) {
        assembler.G.add(i, i, options.gmin);
      }
      assembler.lockTopology();
      // Classify devices for batch stamping now that fast path is active
      mosfets = [];
      otherDevices = [];
      for (const d of devices) {
        if (d instanceof MOSFET) mosfets.push(d);
        else otherDevices.push(d);
      }
    } else {
      // Fast path: GMIN via direct array write
      const gv = assembler.gValues;
      const diag = assembler.diagIdx;
      for (let i = 0; i < assembler.numNodes; i++) {
        gv[diag[i]] += options.gmin;
      }
    }

    const solver = assembler.getSparseSolver();
    solver.factorize(assembler.getCscMatrix());
    const x = solver.solve(new Float64Array(assembler.b));
    assembler.solution.set(x);

    if (isConverged(assembler.solution, assembler.prevSolution, assembler.numNodes, options)) {
      if (telemetry) {
        telemetry.newtonIterations += iter + 1;
        telemetry.acceptedSolves++;
      }
      return iter + 1;
    }
  }

  const oscillating = findOscillatingNodes(
    assembler.solution, assembler.prevSolution,
    assembler.numNodes, nodeNames, options,
  );

  if (telemetry) {
    telemetry.newtonIterations += maxIter;
    telemetry.rejectedSolves++;
  }

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
