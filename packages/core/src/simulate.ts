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
import { solveStep, generateStepValues } from './analysis/step.js';
import type { StepStreamEvent, StepAnalysis } from './types.js';
import type { SimulationResult } from './results.js';
import { InvalidCircuitError } from './errors.js';
import { MNAAssembler } from './mna/assembler.js';
import { toCsc } from './solver/csc-matrix.js';
import { ComplexSparseSolver } from './solver/complex-sparse-solver.js';
import { createDriverFromCompiled } from './analysis/transient-driver.js';

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

  if (compiled.steps.length > 0) {
    if (compiled.steps.length > 1) {
      warnings.push({
        type: 'unsupported',
        message: 'Multiple .step directives found; only the first is used. Nested sweeps are not yet supported.',
      });
    }
    const stepResults = solveStep(compiled, compiled.steps[0], options, warnings);
    return { steps: stepResults, warnings };
  }

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
 * @throws {@link TimestepTooSmallError} if the adaptive timestep shrinks below 1e-12
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

  if (compiled.steps.length > 0) {
    for (const event of streamWithSteps(compiled, compiled.steps[0], options)) {
      yield event.point;
    }
    return;
  }

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
 * Stream simulation results with step metadata for parametric sweeps.
 *
 * Each yielded event includes the step index, parameter name/value, and the
 * inner {@link TransientStep} or {@link ACPoint}. Use this instead of
 * {@link simulateStream} when you need to distinguish which step each point
 * belongs to.
 *
 * @param input - A SPICE netlist string or a pre-built {@link Circuit} object
 * @param options - Simulation options
 * @yields {@link StepStreamEvent} for each inner time/frequency point across all steps
 */
export async function* simulateStepStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<StepStreamEvent> {
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

  if (compiled.steps.length > 0) {
    yield* streamWithSteps(compiled, compiled.steps[0], options);
  } else {
    // No steps — yield events with stepIndex 0 and empty param info
    for (const analysis of compiled.analyses) {
      switch (analysis.type) {
        case 'tran': {
          const opts = resolveOptions(options, analysis.stopTime);
          const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
          for (const point of streamTransient(compiled, analysis, opts, dcAsm.solution)) {
            yield { stepIndex: 0, paramName: '', paramValue: 0, point };
          }
          break;
        }
        case 'ac': {
          const opts = resolveOptions(options);
          const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
          for (const point of streamAC(compiled, analysis, opts, dcAsm.solution)) {
            yield { stepIndex: 0, paramName: '', paramValue: 0, point };
          }
          break;
        }
      }
    }
  }
}

function* streamWithSteps(
  compiled: CompiledCircuit,
  step: StepAnalysis,
  options: SimulationOptions | undefined,
): Generator<StepStreamEvent> {
  const values = generateStepValues(step);

  const device = compiled.devices.find(d => d.name === step.param);
  if (!device) {
    throw new InvalidCircuitError(
      `Step parameter device '${step.param}' not found`,
    );
  }
  if (!device.setParameter || !device.getParameter) {
    throw new InvalidCircuitError(
      `Device '${step.param}' does not support parametric sweep`,
    );
  }

  const originalValue = device.getParameter();
  let prevDCSolution: Float64Array | undefined;

  try {
    for (let stepIndex = 0; stepIndex < values.length; stepIndex++) {
      const value = values[stepIndex];
      device.setParameter(value);

      for (const analysis of compiled.analyses) {
        switch (analysis.type) {
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts, prevDCSolution);
            prevDCSolution = new Float64Array(dcAsm.solution);
            for (const point of streamTransient(compiled, analysis, opts, dcAsm.solution)) {
              yield { stepIndex, paramName: step.param, paramValue: value, point };
            }
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts, prevDCSolution);
            prevDCSolution = new Float64Array(dcAsm.solution);
            for (const point of streamAC(compiled, analysis, opts, dcAsm.solution)) {
              yield { stepIndex, paramName: step.param, paramValue: value, point };
            }
            break;
          }
        }
      }
    }
  } finally {
    device.setParameter(originalValue);
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

function* streamTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution: Float64Array,
): Generator<TransientStep> {
  const driver = createDriverFromCompiled(compiled, options, {
    stopTime: analysis.stopTime,
    timestep: analysis.timestep,
    maxTimestep: analysis.maxTimestep ?? (analysis.stopTime / 50),
    initialSolution,
  });

  try {
    yield driver.peekInitialStep();
    while (!driver.isDone) {
      yield driver.advance();
    }
  } finally {
    driver.dispose();
  }
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

