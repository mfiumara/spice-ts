import type { ResolvedOptions, TransientAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { TimestepTooSmallError } from '../errors.js';
import { TransientResult } from '../results.js';

const MIN_TIMESTEP = 1e-15;
const NR_VOLTAGE_LIMIT = 3.5; // Max node-voltage change per NR iteration

export function solveTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): TransientResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

  // Set initial conditions from DC operating point
  if (initialSolution) {
    assembler.solution.set(initialSolution);
  }

  // SPICE convention: the user-specified timestep caps the internal timestep.
  // An explicit .tran maxTimestep overrides; otherwise use the lesser of
  // the user timestep and stopTime/50.
  const maxDt = analysis.maxTimestep ?? Math.min(analysis.timestep, analysis.stopTime / 50);
  let dt = Math.min(analysis.timestep, maxDt);

  // Storage for results
  const timePoints: number[] = [0];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();

  for (const name of nodeNames) {
    voltageArrays.set(name, [assembler.solution[compiled.nodeIndexMap.get(name)!]]);
  }
  for (let i = 0; i < branchNames.length; i++) {
    currentArrays.set(branchNames[i], [assembler.solution[nodeCount + i]]);
  }

  let time = 0;

  const solver = createSparseSolver();
  let patternAnalyzed = false;

  // LTE history tracking
  let secondPrevSol: Float64Array | undefined;
  let prevDt = dt;
  let lteRejectCount = 0;

  // Compute initial b(0) for trapezoidal history on the first step
  let prevB: Float64Array | undefined;
  if (options.integrationMethod === 'trapezoidal') {
    assembler.clear();
    assembler.setTime(0, 0);
    const initCtx = assembler.getStampContext();
    for (const device of devices) device.stamp(initCtx);
    prevB = new Float64Array(assembler.b);
  }

  while (time < analysis.stopTime - dt * 0.001) {
    const prevSol = new Float64Array(assembler.solution);
    const nextTime = Math.min(time + dt, analysis.stopTime);
    const actualDt = nextTime - time;

    assembler.setTime(nextTime, actualDt);

    let converged = false;

    for (let iter = 0; iter < options.maxTransientIterations; iter++) {
      buildCompanionSystem(assembler, devices, actualDt, options.integrationMethod, prevSol, prevB, options.gmin);

      if (!assembler.isFastPath) assembler.lockTopology();
      if (!patternAnalyzed) {
        solver.analyzePattern(assembler.getCscMatrix());
        patternAnalyzed = true;
      }
      solver.factorize(assembler.getCscMatrix());
      const x = solver.solve(new Float64Array(assembler.b));

      // NR damping: limit node-voltage change per iteration to aid convergence
      // through device switching transitions (MOSFETs, diodes)
      const prev = new Float64Array(assembler.solution);
      for (let i = 0; i < nodeCount; i++) {
        const delta = x[i] - prev[i];
        if (Math.abs(delta) > NR_VOLTAGE_LIMIT) {
          x[i] = prev[i] + Math.sign(delta) * NR_VOLTAGE_LIMIT;
        }
      }

      assembler.solution.set(x);

      if (isConvergedTransient(x, prev, nodeCount, options)) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      // Less aggressive than /4 — gives more attempts before hitting the floor
      dt = dt / 2;
      if (dt < MIN_TIMESTEP) {
        throw new TimestepTooSmallError(time, dt);
      }
      assembler.solution.set(prevSol);
      continue;
    }

    // LTE-based timestep control: reject if local truncation error is too large.
    // This catches inaccurate solutions that NR accepted (convergence != accuracy).
    let lteRatio = 0;
    if (secondPrevSol && lteRejectCount < 10) {
      lteRatio = estimateLTE(
        assembler.solution, prevSol, secondPrevSol,
        actualDt, prevDt, nodeCount, options,
      );
      if (lteRatio > 1) {
        // Reduce dt proportionally to the error ratio
        const factor = Math.max(0.25, 0.9 / Math.sqrt(lteRatio));
        dt = Math.max(actualDt * factor, MIN_TIMESTEP);
        assembler.solution.set(prevSol);
        lteRejectCount++;
        continue;
      }
      lteRejectCount = 0;
    }

    // Save the DC-stamped b for trapezoidal history on next step
    if (options.integrationMethod === 'trapezoidal') {
      // Re-stamp to get the clean b(n+1) for use as prevB next step
      assembler.clear();
      const stampCtx = assembler.getStampContext();
      for (const device of devices) device.stamp(stampCtx);
      prevB = new Float64Array(assembler.b);
    }

    // Record result
    time = nextTime;
    timePoints.push(time);

    for (const name of nodeNames) {
      voltageArrays.get(name)!.push(assembler.solution[compiled.nodeIndexMap.get(name)!]);
    }
    for (let i = 0; i < branchNames.length; i++) {
      currentArrays.get(branchNames[i])!.push(assembler.solution[nodeCount + i]);
    }

    // Update LTE history
    secondPrevSol = prevSol;
    prevDt = actualDt;

    // Adaptive: grow timestep based on LTE margin
    const growFactor = lteRatio > 0.001
      ? Math.min(2.0, 0.9 / Math.sqrt(lteRatio))
      : 2.0;
    dt = Math.min(actualDt * growFactor, maxDt, analysis.stopTime - time);
    if (dt < MIN_TIMESTEP && time < analysis.stopTime - MIN_TIMESTEP) break;
  }

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}

/**
 * Estimate the Local Truncation Error ratio for the current step.
 *
 * Uses a forward-Euler predictor compared against the actual solution:
 *   predicted = x(n) + dt * (x(n) - x(n-1)) / prevDt
 *   error = |actual - predicted| / 3   (for trapezoidal, order-2 corrector)
 *   ratio = error / (trtol * tolerance)
 *
 * A ratio > 1 means the step should be rejected.
 */
function estimateLTE(
  current: Float64Array,
  previous: Float64Array,
  secondPrev: Float64Array,
  dt: number,
  prevDt: number,
  nodeCount: number,
  options: ResolvedOptions,
): number {
  let maxRatio = 0;
  const divider = options.integrationMethod === 'trapezoidal' ? 3 : 2;

  for (let i = 0; i < nodeCount; i++) {
    // Forward Euler prediction from the rate of change at the previous step
    const slope = (previous[i] - secondPrev[i]) / prevDt;
    const predicted = previous[i] + dt * slope;

    // Error between corrector (actual NR result) and predictor
    const error = Math.abs(current[i] - predicted) / divider;
    const tol = options.trtol * (options.vntol + options.reltol * Math.abs(current[i]));

    if (tol > 0) {
      const ratio = error / tol;
      if (ratio > maxRatio) maxRatio = ratio;
    }
  }

  return maxRatio;
}

function isConvergedTransient(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  options: ResolvedOptions,
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
