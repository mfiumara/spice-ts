import type {
  ConvergenceTelemetry, DCSweepAnalysis, DCSweepDimension, ResolvedOptions,
} from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { gminSteppingHomotopy } from './dc.js';
import { DCSweepResult } from '../results.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { CurrentSource } from '../devices/current-source.js';
import { Resistor } from '../devices/resistor.js';
import { NOMINAL_TEMPERATURE_C } from '../devices/junction-temperature.js';
import { ConvergenceError, InvalidCircuitError, UnsupportedTemperatureError } from '../errors.js';
import {
  createConvergenceTelemetry, snapshotConvergenceTelemetry,
} from '../convergence-telemetry.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';
import { accumulatedLinearGrid } from './directed-linear-grid.js';

interface SweepTarget {
  set(value: number): void;
  restore(): void;
}

export function solveDCSweep(
  compiled: CompiledCircuit,
  analysis: DCSweepAnalysis,
  options: ResolvedOptions,
  convergence: ConvergenceTelemetry = createConvergenceTelemetry(),
  guard?: ProtocolExecutionGuard,
): DCSweepResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;

  assertDCSweepDimension(analysis);
  if (analysis.secondary !== undefined) assertDCSweepDimension(analysis.secondary);
  if (analysis.secondary?.source.toUpperCase() === analysis.source.toUpperCase()) {
    throw new InvalidCircuitError(`DC sweep source '${analysis.secondary!.source}' is repeated`);
  }

  // ngspice-47 dctrcurv.c accumulates each level by `+= step` and resets inner levels to start,
  // so every outer value reuses the same accumulated inner grid.
  const primaryGrid = sweepGrid(analysis);
  const secondaryGrid = analysis.secondary === undefined ? [undefined] : sweepGrid(analysis.secondary);
  const source = resolveSweepTarget(devices, analysis, primaryGrid);
  const secondarySource = analysis.secondary === undefined
    ? undefined
    : resolveSweepTarget(devices, analysis.secondary, secondaryGrid as number[]);
  const primaryPoints = primaryGrid.length;
  const secondaryPoints = secondaryGrid.length;
  const numPoints = primaryPoints * secondaryPoints;

  // Pre-allocate result arrays
  const sweepValues = new Float64Array(numPoints);
  const voltageArrays = new Map<string, Float64Array>();
  const currentArrays = new Map<string, Float64Array>();
  for (const name of nodeNames) voltageArrays.set(name, new Float64Array(numPoints));
  for (const name of branchNames) currentArrays.set(name, new Float64Array(numPoints));

  const assembler = new MNAAssembler(nodeCount, branchCount, {
    variables: createMatrixVariableIdentities(nodeNames, branchNames),
  });
  // ngspice dctrcurv.c solves the first point in MODEINITJCT.
  for (const device of devices) device.beginOperatingPoint?.();
  const secondarySweepValues = analysis.secondary === undefined
    ? undefined
    : new Float64Array(numPoints);

  try {
    for (let outer = 0; outer < secondaryPoints; outer++) {
      const secondarySweepValue = secondaryGrid[outer];
      if (secondarySource !== undefined && secondarySweepValue !== undefined) {
        secondarySource.set(secondarySweepValue);
      }
      for (let inner = 0; inner < primaryPoints; inner++) {
        guard?.recordResultPoint();
        const i = outer * primaryPoints + inner;
        const sweepValue = primaryGrid[inner]!;
        sweepValues[i] = sweepValue;
        if (secondarySweepValues !== undefined) {
          secondarySweepValues[i] = secondarySweepValue!;
        }

        source.set(sweepValue);

        solveSweepPoint(assembler, devices, options, nodeNames, convergence, guard);

        // Record solution
        for (let n = 0; n < nodeNames.length; n++) {
          voltageArrays.get(nodeNames[n])![i] = assembler.solution[n];
        }
        for (let b = 0; b < branchNames.length; b++) {
          currentArrays.get(branchNames[b])![i] = assembler.solution[nodeCount + b];
        }
      }
    }
  } catch (error) {
    if (error instanceof ConvergenceError) {
      convergence.dc.failure = error.kind;
      error.convergence = snapshotConvergenceTelemetry(convergence);
    }
    throw error;
  } finally {
    source.restore();
    secondarySource?.restore();
  }

  return new DCSweepResult(sweepValues, voltageArrays, currentArrays, secondarySweepValues);
}

/**
 * One DC transfer-curve point, as ngspice-47 dctrcurv.c: Newton from the
 * previous point's solution, and on failure the full CKTop operating-point
 * homotopy (here dynamic, then true gmin stepping). A sweep that drives the
 * circuit through a fold (e.g. latch-up) needs it: the previous branch no
 * longer exists, and plain Newton from it need not converge.
 */
function solveSweepPoint(
  assembler: MNAAssembler,
  devices: CompiledCircuit['devices'],
  options: ResolvedOptions,
  nodeNames: string[],
  convergence: ConvergenceTelemetry,
  guard?: ProtocolExecutionGuard,
): void {
  try {
    newtonRaphson(
      assembler, devices, options, options.maxIterations, nodeNames, convergence.dc, guard,
    );
  } catch (error) {
    if (!(error instanceof ConvergenceError) || !devices.some(device => device.isNonlinear)) throw error;
    const savedSolution = new Float64Array(assembler.solution);
    if (!gminSteppingHomotopy(assembler, devices, options, nodeNames, convergence, guard)) {
      assembler.solution.set(savedSolution);
      throw error;
    }
  }
}

function resolveSweepTarget(
  devices: CompiledCircuit['devices'],
  sweep: DCSweepDimension,
  grid: readonly number[],
): SweepTarget {
  // SPICE identifiers are case-insensitive, but retain declaration spelling in
  // result maps and diagnostics.
  const normalizedSourceName = sweep.source.toUpperCase();
  if (normalizedSourceName === 'TEMP') {
    const fixed = devices.find(device => device.isNonlinear && !device.setTemperature);
    const offNominal = grid.find(value => value !== NOMINAL_TEMPERATURE_C);
    if (fixed && offNominal !== undefined) throw new UnsupportedTemperatureError(fixed.name, offNominal);
    const thermalDevices = devices.filter(device => device.setTemperature && device.getTemperature);
    // Resistor getTemperature includes instance TEMP/DTEMP. Restore CKTtemp,
    // not the effective instance temperature, to avoid applying DTEMP twice.
    const original = thermalDevices.map(device => device instanceof Resistor
      ? device.getCircuitTemperature() : device.getTemperature!());
    return {
      set: value => thermalDevices.forEach(device => device.setTemperature!(value)),
      restore: () => thermalDevices.forEach((device, index) => device.setTemperature!(original[index])),
    };
  }
  const matchingSources = devices.filter(
    (device): device is VoltageSource | CurrentSource =>
      (device instanceof VoltageSource || device instanceof CurrentSource)
      && device.name.toUpperCase() === normalizedSourceName,
  );
  if (matchingSources.length === 0) {
    throw new InvalidCircuitError(`DC sweep source '${sweep.source}' not found`);
  }
  if (matchingSources.length > 1) {
    const names = matchingSources.map(device => `'${device.name}'`).join(', ');
    throw new InvalidCircuitError(
      `DC sweep source '${sweep.source}' is ambiguous; matches: ${names}`,
    );
  }
  const source = matchingSources[0]!;
  const waveform = source.waveform;
  return {
    set: value => { source.waveform = { type: 'dc', value }; },
    restore: () => { source.waveform = waveform; },
  };
}

function sweepGrid(sweep: DCSweepDimension): number[] {
  return accumulatedLinearGrid(sweep.start, sweep.stop, sweep.step);
}

function assertDCSweepDimension(sweep: DCSweepDimension): void {
  const { start, stop, step } = sweep;
  if (sweep.source.length === 0 || ![start, stop, step].every(Number.isFinite) || step === 0
      || (stop > start && step < 0) || (stop < start && step > 0)) {
    throw new InvalidCircuitError('DC sweep grid must be finite with a nonzero step toward stop');
  }
}
