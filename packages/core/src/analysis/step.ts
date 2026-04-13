import type { StepAnalysis, SimulationWarning, SimulationOptions } from '../types.js';
import { resolveOptions } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import type { StepResult } from '../results.js';
import { solveDCOperatingPoint } from './dc.js';
import { solveDCSweep } from './dc-sweep.js';
import { solveTransient } from './transient.js';
import { solveAC } from './ac.js';
import { InvalidCircuitError } from '../errors.js';

/**
 * Generate the array of parameter values for a .step sweep.
 */
export function generateStepValues(step: StepAnalysis): number[] {
  switch (step.sweepMode) {
    case 'lin': {
      const { start, stop, increment } = step;
      const values: number[] = [];
      const n = Math.round((stop! - start!) / increment!) + 1;
      for (let i = 0; i < n; i++) {
        values.push(start! + i * increment!);
      }
      return values;
    }
    case 'dec': {
      const { start, stop, points } = step;
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
): StepResult[] {
  const values = generateStepValues(step);

  const device = compiled.devices.find(d => d.name === step.param);
  if (!device) {
    throw new InvalidCircuitError(`Step parameter device '${step.param}' not found`);
  }
  if (!device.setParameter || !device.getParameter) {
    throw new InvalidCircuitError(
      `Device '${step.param}' does not support parametric sweep`,
    );
  }

  const originalValue = device.getParameter();
  const results: StepResult[] = [];
  let prevDCSolution: Float64Array | undefined;

  try {
    for (const value of values) {
      device.setParameter(value);
      const stepResult: StepResult = { paramName: step.param, paramValue: value };

      for (const analysis of compiled.analyses) {
        switch (analysis.type) {
          case 'op': {
            const opts = resolveOptions(options);
            const { result: dcResult, assembler } = solveDCOperatingPoint(compiled, opts, prevDCSolution);
            stepResult.dc = dcResult;
            prevDCSolution = new Float64Array(assembler.solution);
            break;
          }
          case 'dc': {
            const opts = resolveOptions(options);
            stepResult.dcSweep = solveDCSweep(compiled, analysis, opts);
            break;
          }
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts, prevDCSolution);
            stepResult.transient = solveTransient(compiled, analysis, opts, dcAsm.solution);
            prevDCSolution = new Float64Array(dcAsm.solution);
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts, prevDCSolution);
            stepResult.ac = solveAC(compiled, analysis, opts, dcAsm.solution);
            prevDCSolution = new Float64Array(dcAsm.solution);
            break;
          }
        }
      }

      results.push(stepResult);
    }
  } finally {
    device.setParameter(originalValue);
  }

  return results;
}
