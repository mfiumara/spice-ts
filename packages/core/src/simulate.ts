import { Circuit } from './circuit.js';
import type { CompiledCircuit } from './circuit.js';
import { parse, parseAsync } from './parser/index.js';
import type { SimulationOptions, SimulationWarning, TransientStep, ACPoint } from './types.js';
import type { TransientAnalysis, ACAnalysis, ResolvedOptions } from './types.js';
import { resolveOptions } from './types.js';
import { solveDCOperatingPoint } from './analysis/dc.js';
import { solveTransient } from './analysis/transient.js';
import { solveAC } from './analysis/ac.js';
import { solveDCSweep } from './analysis/dc-sweep.js';
import type { SimulationResult } from './results.js';
import { InvalidCircuitError, TimestepTooSmallError } from './errors.js';
import { MNAAssembler } from './mna/assembler.js';
import { buildCompanionSystem } from './mna/companion.js';
import { SparseMatrix } from './solver/sparse-matrix.js';
import { toCsc } from './solver/csc-matrix.js';
import { createSparseSolver } from './solver/sparse-solver.js';

export async function simulate(
  input: string | Circuit,
  options?: SimulationOptions,
): Promise<SimulationResult> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    if (options?.resolveInclude) {
      circuit = await parseAsync(input, options.resolveInclude);
    } else {
      circuit = parse(input);
    }
  } else {
    circuit = input;
  }
  const compiled = circuit.compile();
  const warnings: SimulationWarning[] = [];

  validateCircuit(compiled, warnings);

  const result: SimulationResult = { warnings };

  for (const analysis of compiled.analyses) {
    switch (analysis.type) {
      case 'op': {
        const opts = resolveOptions(options);
        const { result: dcResult } = solveDCOperatingPoint(compiled, opts);
        result.dc = dcResult;
        break;
      }
      case 'dc': {
        const opts = resolveOptions(options);
        result.dcSweep = solveDCSweep(compiled, analysis, opts);
        break;
      }
      case 'tran': {
        const opts = resolveOptions(options, analysis.stopTime);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.transient = solveTransient(compiled, analysis, opts, dcAsm.solution);
        break;
      }
      case 'ac': {
        const opts = resolveOptions(options);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.ac = solveAC(compiled, analysis, opts, dcAsm.solution);
        break;
      }
    }
  }

  return result;
}

export async function* simulateStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<TransientStep | ACPoint> {
  let circuit: Circuit;
  if (typeof input === 'string') {
    if (options?.resolveInclude) {
      circuit = await parseAsync(input, options.resolveInclude);
    } else {
      circuit = parse(input);
    }
  } else {
    circuit = input;
  }
  const compiled = circuit.compile();
  const warnings: SimulationWarning[] = [];
  validateCircuit(compiled, warnings);

  for (const analysis of compiled.analyses) {
    switch (analysis.type) {
      case 'tran': {
        const opts = resolveOptions(options, analysis.stopTime);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        yield* streamTransient(compiled, analysis, opts, dcAsm.solution);
        break;
      }
      case 'ac': {
        const opts = resolveOptions(options);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        yield* streamAC(compiled, analysis, opts, dcAsm.solution);
        break;
      }
    }
  }
}

function validateCircuit(compiled: CompiledCircuit, warnings: SimulationWarning[]): void {
  if (compiled.nodeCount === 0) {
    throw new InvalidCircuitError('Circuit has no nodes');
  }
  if (compiled.analyses.length === 0) {
    throw new InvalidCircuitError('No analysis command specified');
  }
}

const MIN_TIMESTEP = 1e-18;

function* streamTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution: Float64Array,
): Generator<TransientStep> {
  const { devices, nodeCount, branchCount, nodeNames, branchNames, nodeIndexMap } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(initialSolution);

  const maxDt = analysis.maxTimestep ?? (analysis.stopTime / 50);
  let dt = Math.min(analysis.timestep, maxDt);

  // Yield initial state at t=0
  yield buildTransientStep(0, assembler.solution, nodeNames, branchNames, nodeCount, nodeIndexMap);

  let time = 0;

  const solver = createSparseSolver();
  let patternAnalyzed = false;

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

      const prev = new Float64Array(assembler.solution);
      assembler.solution.set(x);

      if (isStreamConverged(x, prev, nodeCount, options)) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      dt = dt / 4;
      if (dt < MIN_TIMESTEP) {
        throw new TimestepTooSmallError(time, dt);
      }
      assembler.solution.set(prevSol);
      continue;
    }

    // Save the DC-stamped b for trapezoidal history on next step
    if (options.integrationMethod === 'trapezoidal') {
      assembler.clear();
      const stampCtx = assembler.getStampContext();
      for (const device of devices) device.stamp(stampCtx);
      prevB = new Float64Array(assembler.b);
    }

    time = nextTime;
    yield buildTransientStep(time, assembler.solution, nodeNames, branchNames, nodeCount, nodeIndexMap);

    // Adaptive: grow timestep if converged
    dt = Math.min(dt * 1.5, maxDt, analysis.stopTime - time);
    if (dt < MIN_TIMESTEP && time < analysis.stopTime - MIN_TIMESTEP) break;
  }
}

function buildTransientStep(
  time: number,
  solution: Float64Array,
  nodeNames: string[],
  branchNames: string[],
  nodeCount: number,
  nodeIndexMap: Map<string, number>,
): TransientStep {
  const voltages = new Map<string, number>();
  for (const name of nodeNames) voltages.set(name, solution[nodeIndexMap.get(name)!]);
  const currents = new Map<string, number>();
  for (let i = 0; i < branchNames.length; i++) currents.set(branchNames[i], solution[nodeCount + i]);
  return { time, voltages, currents };
}

interface StreamGMapping {
  value: number;
  topLeftIdx: number;
  botRightIdx: number;
}

interface StreamCMapping {
  value: number;
  topRightIdx: number;
  botLeftIdx: number;
}

function* streamAC(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): Generator<ACPoint> {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const systemSize = nodeCount + branchCount;

  // Build linearized G and C matrices at DC operating point
  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(dcSolution);
  const ctx = assembler.getStampContext();
  for (const device of devices) device.stamp(ctx);
  for (const device of devices) device.stampDynamic?.(ctx);

  const G = assembler.G;
  const C = assembler.C;

  // Find AC excitation source
  let excitationRow = -1;
  let excitationMag = 1;
  let excitationPhase = 0;
  for (const device of devices) {
    const exc = device.getACExcitation?.();
    if (exc) {
      excitationRow = nodeCount + exc.branch;
      excitationMag = exc.magnitude;
      excitationPhase = exc.phase;
      break;
    }
  }

  const frequencies = generateStreamFreqs(analysis);

  // Build the combined 2n×2n CSC structure ONCE from G and C patterns.
  // Use omega=1 as a representative to establish the full sparsity pattern.
  const N = 2 * systemSize;
  const pattern = new SparseMatrix(N);

  for (let i = 0; i < systemSize; i++) {
    for (const [j, val] of G.getRow(i)) {
      pattern.add(i, j, val);
      pattern.add(i + systemSize, j + systemSize, val);
    }
  }
  for (let i = 0; i < systemSize; i++) {
    for (const [j, cval] of C.getRow(i)) {
      pattern.add(i, j + systemSize, -cval);
      pattern.add(i + systemSize, j, cval);
    }
  }

  const { csc: combinedCsc, scatter } = toCsc(pattern);

  // Build index arrays mapping G and C entries to combined CSC positions.
  const gMappings: StreamGMapping[] = [];
  for (let i = 0; i < systemSize; i++) {
    for (const [j, val] of G.getRow(i)) {
      const topLeftIdx = scatter.get(i * N + j)!;
      const botRightIdx = scatter.get((i + systemSize) * N + (j + systemSize))!;
      gMappings.push({ value: val, topLeftIdx, botRightIdx });
    }
  }

  const cMappings: StreamCMapping[] = [];
  for (let i = 0; i < systemSize; i++) {
    for (const [j, cval] of C.getRow(i)) {
      const topRightIdx = scatter.get(i * N + (j + systemSize))!;
      const botLeftIdx = scatter.get((i + systemSize) * N + j)!;
      cMappings.push({ value: cval, topRightIdx, botLeftIdx });
    }
  }

  const solver = createSparseSolver();
  solver.analyzePattern(combinedCsc);

  // Pre-compute RHS (constant across frequencies)
  const b = new Float64Array(N);
  if (excitationRow >= 0) {
    const phaseRad = (excitationPhase * Math.PI) / 180;
    b[excitationRow] = excitationMag * Math.cos(phaseRad);
    b[excitationRow + systemSize] = excitationMag * Math.sin(phaseRad);
  }

  const vals = combinedCsc.values as Float64Array;

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Fill combined CSC values via pre-built index arrays (O(nnz), no Map iteration)
    vals.fill(0);
    for (const e of gMappings) {
      vals[e.topLeftIdx] = e.value;
      vals[e.botRightIdx] = e.value;
    }
    for (const e of cMappings) {
      vals[e.topRightIdx] = -omega * e.value;
      vals[e.botLeftIdx] = omega * e.value;
    }

    solver.factorize(combinedCsc);
    const x = solver.solve(b);
    const xReal = x.slice(0, systemSize);
    const xImag = x.slice(systemSize);

    // Extract results
    const voltages = new Map<string, { magnitude: number; phase: number }>();
    for (let i = 0; i < nodeNames.length; i++) {
      const re = xReal[i], im = xImag[i];
      voltages.set(nodeNames[i], {
        magnitude: Math.sqrt(re * re + im * im),
        phase: (Math.atan2(im, re) * 180) / Math.PI,
      });
    }
    const currents = new Map<string, { magnitude: number; phase: number }>();
    for (let i = 0; i < branchNames.length; i++) {
      const re = xReal[nodeCount + i], im = xImag[nodeCount + i];
      currents.set(branchNames[i], {
        magnitude: Math.sqrt(re * re + im * im),
        phase: (Math.atan2(im, re) * 180) / Math.PI,
      });
    }

    yield { frequency: freq, voltages, currents };
  }
}

function generateStreamFreqs(analysis: ACAnalysis): number[] {
  const { variation, points, startFreq, stopFreq } = analysis;
  const frequencies: number[] = [];
  switch (variation) {
    case 'dec': {
      const decades = Math.log10(stopFreq / startFreq);
      const totalPoints = Math.round(decades * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(10, i / points));
      break;
    }
    case 'oct': {
      const octaves = Math.log2(stopFreq / startFreq);
      const totalPoints = Math.round(octaves * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(2, i / points));
      break;
    }
    case 'lin': {
      const step = (stopFreq - startFreq) / points;
      for (let i = 0; i <= points; i++) frequencies.push(startFreq + i * step);
      break;
    }
  }
  return frequencies;
}

function isStreamConverged(
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
