import { Circuit } from './circuit.js';
import type { CompiledCircuit } from './circuit.js';
import { parse, parseAsync } from './parser/index.js';
import type { SimulationOptions, SimulationWarning, TransientStep, ACPoint, StepDirective } from './types.js';
import type { TransientAnalysis, ACAnalysis, ResolvedOptions } from './types.js';
import { resolveOptions } from './types.js';
import { solveDCOperatingPoint } from './analysis/dc.js';
import { solveTransient } from './analysis/transient.js';
import { solveAC } from './analysis/ac.js';
import { solveDCSweep } from './analysis/dc-sweep.js';
import type { SimulationResult, StepResult } from './results.js';
import { InvalidCircuitError, TimestepTooSmallError } from './errors.js';
import { MNAAssembler } from './mna/assembler.js';
import { buildCompanionSystem } from './mna/companion.js';
import { toCsc } from './solver/csc-matrix.js';
import { createSparseSolver } from './solver/sparse-solver.js';
import { ComplexSparseSolver } from './solver/complex-sparse-solver.js';

/**
 * Run all analyses declared in a SPICE netlist or {@link Circuit} object.
 *
 * Parses the input (if a string), compiles the circuit, and executes every
 * analysis command (`.op`, `.dc`, `.tran`, `.ac`) found in the netlist.
 *
 * @param input - A SPICE netlist string or a pre-built {@link Circuit} object
 * @param options - Simulation options (tolerances, integration method, include resolver)
 * @returns Simulation results with `.dc`, `.transient`, `.ac`, `.dcSweep` fields
 * @throws {@link ParseError} if the netlist is malformed
 * @throws {@link InvalidCircuitError} if the circuit has no nodes or no analysis command
 * @throws {@link ConvergenceError} if Newton-Raphson fails to converge
 * @example
 * ```ts
 * const result = await simulate(`
 *   V1 in 0 DC 5
 *   R1 in out 1k
 *   R2 out 0 1k
 *   .op
 * `);
 * console.log(result.dc?.voltage('out')); // 2.5
 * ```
 */
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

  // If step directives are present, run parametric sweep
  if (compiled.steps.length > 0) {
    const stepDirective = compiled.steps[0]; // Support one .step directive
    const stepValues = generateStepValues(stepDirective);
    const steps: StepResult[] = [];

    for (const value of stepValues) {
      const modifiedCircuit = circuit.cloneWithOverride(stepDirective.paramName, value);
      const modifiedCompiled = modifiedCircuit.compile();
      const stepResult: StepResult = {
        paramName: stepDirective.paramName,
        paramValue: value,
      };

      for (const analysis of modifiedCompiled.analyses) {
        switch (analysis.type) {
          case 'op': {
            const opts = resolveOptions(options);
            const { result: dcResult } = solveDCOperatingPoint(modifiedCompiled, opts);
            stepResult.dc = dcResult;
            break;
          }
          case 'dc': {
            const opts = resolveOptions(options);
            stepResult.dcSweep = solveDCSweep(modifiedCompiled, analysis, opts);
            break;
          }
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const { assembler: dcAsm } = solveDCOperatingPoint(modifiedCompiled, opts);
            stepResult.transient = solveTransient(modifiedCompiled, analysis, opts, dcAsm.solution);
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(modifiedCompiled, opts);
            stepResult.ac = solveAC(modifiedCompiled, analysis, opts, dcAsm.solution);
            break;
          }
        }
      }

      steps.push(stepResult);
    }

    return { steps, warnings };
  }

  // No step directives — run analyses normally
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

/**
 * Stream simulation results one timestep or frequency point at a time.
 *
 * Only `.tran` and `.ac` analyses produce streamed output. Use this for
 * large simulations where you want to process results incrementally
 * rather than waiting for the full result set.
 *
 * @param input - A SPICE netlist string or a pre-built {@link Circuit} object
 * @param options - Simulation options (tolerances, integration method, include resolver)
 * @yields {@link TransientStep} for `.tran` analyses, {@link ACPoint} for `.ac` analyses
 * @throws {@link ParseError} if the netlist is malformed
 * @throws {@link InvalidCircuitError} if the circuit has no nodes or no analysis command
 * @throws {@link ConvergenceError} if Newton-Raphson fails to converge
 * @throws {@link TimestepTooSmallError} if the adaptive timestep shrinks below 1e-18
 * @example
 * ```ts
 * for await (const step of simulateStream('V1 1 0 DC 5\nR1 1 0 1k\n.tran 1u 1m')) {
 *   if ('time' in step) console.log(step.time, step.voltages.get('1'));
 * }
 * ```
 */
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

/**
 * Generate the array of parameter values for a `.step` directive.
 */
function generateStepValues(step: StepDirective): number[] {
  switch (step.sweepType) {
    case 'linear': {
      const values: number[] = [];
      const direction = step.step > 0 ? 1 : -1;
      for (
        let v = step.start;
        direction > 0 ? v <= step.stop + step.step * 1e-9 : v >= step.stop + step.step * 1e-9;
        v += step.step
      ) {
        values.push(v);
      }
      return values;
    }
    case 'list':
      return [...step.values];
    case 'dec': {
      const values: number[] = [];
      const decades = Math.log10(step.stop / step.start);
      const totalPoints = Math.round(decades * step.pointsPerDecade);
      for (let i = 0; i <= totalPoints; i++) {
        values.push(step.start * Math.pow(10, i / step.pointsPerDecade));
      }
      return values;
    }
    case 'oct': {
      const values: number[] = [];
      const octaves = Math.log2(step.stop / step.start);
      const totalPoints = Math.round(octaves * step.pointsPerOctave);
      for (let i = 0; i <= totalPoints; i++) {
        values.push(step.start * Math.pow(2, i / step.pointsPerOctave));
      }
      return values;
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

  // Add GMIN to diagonal for numerical stability (same as DC/transient paths)
  for (let i = 0; i < nodeCount; i++) {
    assembler.G.add(i, i, options.gmin ?? 1e-12);
  }

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

  // Build n*n CSC for G and C
  const { csc: gCsc } = toCsc(G);
  const { csc: cCsc } = toCsc(C);

  // Complex sparse solver: analyze pattern once, factorize per frequency
  const solver = new ComplexSparseSolver();
  solver.analyzePattern(gCsc, cCsc);

  // Pre-compute RHS (constant across frequencies)
  const bReal = new Float64Array(systemSize);
  const bImag = new Float64Array(systemSize);
  if (excitationRow >= 0) {
    const phaseRad = (excitationPhase * Math.PI) / 180;
    bReal[excitationRow] = excitationMag * Math.cos(phaseRad);
    bImag[excitationRow] = excitationMag * Math.sin(phaseRad);
  }

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    solver.factorize(gCsc, cCsc, omega);
    const [xReal, xImag] = solver.solve(bReal, bImag);

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
