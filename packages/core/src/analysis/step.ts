import type {
  ConvergenceTelemetry, StepAnalysis, SimulationWarning, SimulationOptions,
} from '../types.js';
import { resolveOptions } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import type { StepResult } from '../results.js';
import { solveDCOperatingPoint } from './dc.js';
import { solveDCSweep } from './dc-sweep.js';
import { solveTransient } from './transient.js';
import { solveAC } from './ac.js';
import { solveTransferFunction } from './transfer-function.js';
import { InvalidCircuitError } from '../errors.js';
import { computeUICInitialSolution } from './uic.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

export interface StepTarget {
  readonly paramName: string;
  readonly resetsContinuation: boolean;
  set(value: number): void;
  restore(): void;
}

/** Resolve a device or bounded circuit-temperature step target. */
export function resolveStepTarget(compiled: CompiledCircuit, step: StepAnalysis): StepTarget {
  if (step.param.toUpperCase() === 'TEMP') {
    if (step.sweepMode !== 'list') {
      throw new InvalidCircuitError('.step TEMP supports LIST mode only');
    }
    const devices = compiled.devices.filter(device => device.setTemperature && device.getTemperature);
    const originalTemperatures = devices.map(device => device.getTemperature!());
    return {
      paramName: 'TEMP',
      resetsContinuation: true,
      set: value => devices.forEach(device => device.setTemperature!(value)),
      restore: () => devices.forEach((device, index) => {
        device.setTemperature!(originalTemperatures[index]);
      }),
    };
  }

  const device = compiled.devices.find(candidate => candidate.name === step.param);
  if (!device) {
    throw new InvalidCircuitError(`Step parameter device '${step.param}' not found`);
  }
  if (!device.setParameter || !device.getParameter) {
    throw new InvalidCircuitError(
      `Device '${step.param}' does not support parametric sweep`,
    );
  }
  const originalValue = device.getParameter();
  return {
    paramName: step.param,
    resetsContinuation: false,
    set: value => device.setParameter!(value),
    restore: () => device.setParameter!(originalValue),
  };
}

/**
 * Generate the array of parameter values for a .step sweep.
 */
export function generateStepValues(step: StepAnalysis): number[] {
  switch (step.sweepMode) {
    case 'lin': {
      const { start, stop, increment } = step;
      if (increment === 0) {
        throw new InvalidCircuitError(
          '.step linear sweep: increment must not be zero',
        );
      }
      if ((stop! > start! && increment! < 0) || (stop! < start! && increment! > 0)) {
        throw new InvalidCircuitError(
          `.step linear sweep: increment (${increment}) has the wrong direction for start (${start}) and stop (${stop})`,
        );
      }
      if (start === stop) return [start!];

      const values: number[] = [];
      const intervalRatio = (stop! - start!) / increment!;
      const roundingTolerance = Number.EPSILON * Math.max(1, intervalRatio) * 8;
      const n = Math.floor(intervalRatio + roundingTolerance) + 1;
      for (let i = 0; i < n; i++) {
        const value = start! + i * increment!;
        const crossedStop = increment! > 0 ? value > stop! : value < stop!;
        if (crossedStop) {
          const endpointTolerance = Number.EPSILON
            * Math.max(1, Math.abs(start!), Math.abs(stop!), Math.abs(value)) * 2;
          if (Math.abs(value - stop!) <= endpointTolerance) values.push(stop!);
          break;
        }
        values.push(value);
      }
      return values;
    }
    case 'dec': {
      const { start, stop, points } = step;
      if (start! <= 0 || stop! <= 0) {
        throw new InvalidCircuitError(
          `.step decade sweep: start and stop must be positive`,
        );
      }
      const decades = Math.log10(stop! / start!);
      const totalPoints = Math.round(decades * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(10, i / points!));
      }
      return values;
    }
    case 'oct': {
      const { start, stop, points } = step;
      if (start! <= 0 || stop! <= 0) {
        throw new InvalidCircuitError(
          `.step octave sweep: start and stop must be positive`,
        );
      }
      const octaves = Math.log2(stop! / start!);
      const totalPoints = Math.round(octaves * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(2, i / points!));
      }
      return values;
    }
    case 'list':
      return step.values!.slice();
  }
}

/**
 * Execute a parametric sweep: for each step value, update the target device
 * parameter and run all declared analyses.
 */
export function solveStep(
  compiled: CompiledCircuit,
  step: StepAnalysis,
  options: SimulationOptions | undefined,
  warnings: SimulationWarning[],
  convergence?: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): StepResult[] {
  const values = generateStepValues(step);

  const target = resolveStepTarget(compiled, step);
  const results: StepResult[] = [];
  let prevDCSolution: Float64Array | undefined;

  try {
    for (const value of values) {
      target.set(value);
      if (target.resetsContinuation) prevDCSolution = undefined;
      const stepResult: StepResult = { paramName: target.paramName, paramValue: value };

      for (const analysis of compiled.analyses) {
        switch (analysis.type) {
          case 'op': {
            const opts = resolveOptions(options);
            const { result: dcResult, assembler } = solveDCOperatingPoint(
              compiled, opts, prevDCSolution, convergence, 'operating-point', guard,
            );
            guard?.recordResultPoint();
            stepResult.dc = dcResult;
            prevDCSolution = new Float64Array(assembler.solution);
            break;
          }
          case 'dc': {
            const opts = resolveOptions(options);
            stepResult.dcSweep = solveDCSweep(compiled, analysis, opts, convergence, guard);
            break;
          }
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const seed = analysis.useInitialConditions
              ? computeUICInitialSolution(compiled)
              : solveDCOperatingPoint(
                compiled, opts, prevDCSolution, convergence, 'transient', guard,
              ).assembler.solution;
            const runnable = analysis.timestep > 0 ? analysis : {
              ...analysis,
              timestep: analysis.maxTimestep ?? analysis.stopTime / 50,
            };
            stepResult.transient = solveTransient(
              compiled, runnable, opts, seed, convergence, guard,
            );
            if (!analysis.useInitialConditions) prevDCSolution = new Float64Array(seed);
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(
              compiled, opts, prevDCSolution, convergence, 'operating-point', guard,
            );
            stepResult.ac = solveAC(compiled, analysis, opts, dcAsm.solution, guard);
            prevDCSolution = new Float64Array(dcAsm.solution);
            break;
          }
          case 'tf': {
            const opts = resolveOptions(options);
            stepResult.transferFunction = solveTransferFunction(
              compiled, analysis, opts, convergence,
            );
            break;
          }
        }
      }

      results.push(stepResult);
    }
  } finally {
    target.restore();
  }

  return results;
}
