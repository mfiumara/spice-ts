import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { CCCS } from '../devices/cccs.js';
import { CCVS } from '../devices/ccvs.js';
import { CurrentSource } from '../devices/current-source.js';
import type { DeviceModel } from '../devices/device.js';
import { Inductor } from '../devices/inductor.js';
import { Resistor } from '../devices/resistor.js';
import { VCCS } from '../devices/vccs.js';
import { VCVS } from '../devices/vcvs.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import {
  SensitivityResult,
  type ComplexSensitivityValue,
  type SensitivityEntry,
} from '../results.js';
import type {
  ACAnalysis,
  ConvergenceTelemetry,
  ResolvedOptions,
  SensitivityAnalysis,
} from '../types.js';
import { solveAC } from './ac.js';
import { solveDCOperatingPoint } from './dc.js';

interface ParameterTarget {
  device: string;
  parameter: SensitivityEntry['parameter'];
  value: number;
  set(value: number): void;
}

/** Solve the bounded primary-device-value `.sens` slice by symmetric perturbation. */
export function solveSensitivity(
  compiled: CompiledCircuit,
  analysis: SensitivityAnalysis,
  options: ResolvedOptions,
  convergence?: ConvergenceTelemetry,
): SensitivityResult {
  const outputIndex = findOutputIndex(compiled, analysis.outputNode);
  const targets = collectTargets(compiled, analysis.mode);

  if (analysis.mode === 'ac') assertSingleACExcitation(compiled);

  if (analysis.mode === 'dc') {
    const entries = targets.map(target => ({
      device: target.device,
      parameter: target.parameter,
      dc: differentiateScalar(target, value => {
        target.set(value);
        return solveDCOperatingPoint(compiled, options, undefined, convergence)
          .assembler.solution[outputIndex];
      }),
    }));
    return new SensitivityResult(analysis.outputNode, 'dc', [], entries);
  }

  const acAnalysis: ACAnalysis = {
    type: 'ac',
    variation: analysis.variation,
    points: analysis.points,
    startFreq: analysis.startFreq,
    stopFreq: analysis.stopFreq,
  };
  const baseline = solveACAtOutput(
    compiled, acAnalysis, options, outputIndex, convergence,
  );
  const entries = targets.map(target => ({
    device: target.device,
    parameter: target.parameter,
    ac: differentiateComplex(target, value => {
      target.set(value);
      return solveACAtOutput(compiled, acAnalysis, options, outputIndex, convergence).values;
    }),
  }));
  return new SensitivityResult(
    analysis.outputNode, 'ac', baseline.frequencies, entries,
  );
}

function assertSingleACExcitation(compiled: CompiledCircuit): void {
  const acSources = compiled.devices
    .filter((device): device is VoltageSource | CurrentSource =>
      (device instanceof VoltageSource || device instanceof CurrentSource)
      && device.waveform.type === 'ac');
  const excitations = acSources
    .filter(device => device.waveform.type === 'ac' && device.waveform.magnitude !== 0)
    .map(device => device.name)
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
  if (excitations.length > 1) {
    throw new InvalidCircuitError(
      `.sens AC supports at most one non-zero AC excitation; found ${excitations.join(', ')}`,
    );
  }
  if (acSources.length > 1) {
    const names = acSources
      .map(device => device.name)
      .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
    const sourceKind = acSources.every(device => device instanceof VoltageSource)
      ? 'voltage source'
      : 'independent source';
    throw new InvalidCircuitError(
      `.sens AC supports only one AC-form ${sourceKind}; found ${names.join(', ')}`,
    );
  }
}

function collectTargets(compiled: CompiledCircuit, mode: 'dc' | 'ac'): ParameterTarget[] {
  const targets: ParameterTarget[] = [];
  for (const device of compiled.devices) {
    const target = parameterTarget(device, mode);
    if (target && target.value !== 0) targets.push(target);
  }
  return targets.sort((left, right) =>
    left.device.localeCompare(right.device, 'en', { sensitivity: 'base' })
      || left.parameter.localeCompare(right.parameter),
  );
}

function parameterTarget(device: DeviceModel, mode: 'dc' | 'ac'): ParameterTarget | null {
  if (device instanceof Resistor) {
    return mutable(device, 'resistance', device.resistance, value => device.setParameter(value));
  }
  if (device instanceof Capacitor) {
    if (mode === 'dc') return null;
    return mutable(device, 'capacitance', device.capacitance, value => device.setParameter(value));
  }
  if (device instanceof Inductor) {
    if (mode === 'dc') return null;
    return mutable(device, 'inductance', device.inductance, value => device.setParameter(value));
  }
  if (device instanceof VoltageSource) {
    if (mode === 'ac') {
      if (device.waveform.type !== 'ac') {
        throw unsupported(device, 'AC sensitivity requires an AC voltage-source waveform');
      }
      return mutable(
        device, 'acMagnitude', device.waveform.magnitude,
        value => {
          if (device.waveform.type === 'ac') device.waveform.magnitude = value;
        },
      );
    }
    if (device.waveform.type !== 'dc' && device.waveform.type !== 'ac') {
      throw unsupported(device, 'DC sensitivity requires a DC-capable voltage source');
    }
    return mutable(device, 'dc', device.getParameter(), value => device.setParameter(value));
  }
  if (device instanceof CurrentSource) {
    if (mode === 'ac') {
      if (device.waveform.type !== 'ac') {
        throw unsupported(device, 'AC sensitivity requires an AC current-source waveform');
      }
      return mutable(
        device, 'acMagnitude', device.waveform.magnitude,
        value => {
          if (device.waveform.type === 'ac') device.waveform.magnitude = value;
        },
      );
    }
    if (device.waveform.type !== 'dc') {
      throw unsupported(device, 'DC current-source sensitivity requires a DC waveform');
    }
    return mutable(
      device, 'dc', device.waveform.value,
      value => {
        if (device.waveform.type === 'dc') device.waveform.value = value;
      },
    );
  }
  if (
    device instanceof VCCS || device instanceof VCVS
    || device instanceof CCCS || device instanceof CCVS
  ) {
    const controlled = device as typeof device & { gain?: number; gm?: number };
    const key = device instanceof VCCS ? 'gm' : 'gain';
    const value = controlled[key];
    if (value === undefined) throw unsupported(device, 'controlled-source gain is unavailable');
    return mutable(device, 'gain', value, next => {
      controlled[key] = next;
    });
  }
  throw unsupported(device, `device type ${device.constructor.name} is outside the bounded slice`);
}

function mutable(
  device: DeviceModel,
  parameter: SensitivityEntry['parameter'],
  value: number,
  set: (value: number) => void,
): ParameterTarget {
  if (!Number.isFinite(value)) throw unsupported(device, `${parameter} must be finite`);
  return { device: device.name, parameter, value, set };
}

function unsupported(device: DeviceModel, detail: string): InvalidCircuitError {
  return new InvalidCircuitError(`.sens does not support '${device.name}': ${detail}`);
}

function differentiateScalar(
  target: ParameterTarget,
  evaluate: (value: number) => number,
): number {
  const step = perturbation(target.value);
  try {
    const high = evaluate(target.value + step);
    const low = evaluate(target.value - step);
    return (high - low) / (2 * step);
  } finally {
    target.set(target.value);
  }
}

function differentiateComplex(
  target: ParameterTarget,
  evaluate: (value: number) => ComplexSensitivityValue[],
): ComplexSensitivityValue[] {
  const step = perturbation(target.value);
  try {
    const high = evaluate(target.value + step);
    const low = evaluate(target.value - step);
    return high.map((value, index) => ({
      real: (value.real - low[index].real) / (2 * step),
      imaginary: (value.imaginary - low[index].imaginary) / (2 * step),
    }));
  } finally {
    target.set(target.value);
  }
}

function perturbation(value: number): number {
  return Math.max(Math.abs(value) * 1e-5, 1e-12);
}

function solveACAtOutput(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  outputIndex: number,
  convergence?: ConvergenceTelemetry,
): { frequencies: number[]; values: ComplexSensitivityValue[] } {
  const dc = solveDCOperatingPoint(compiled, options, undefined, convergence).assembler.solution;
  const result = solveAC(compiled, analysis, options, dc);
  const phasors = result.voltage(compiled.nodeNames[outputIndex]);
  return {
    frequencies: result.frequencies,
    values: phasors.map(({ magnitude, phase }) => {
      const radians = phase * Math.PI / 180;
      return {
        real: magnitude * Math.cos(radians),
        imaginary: magnitude * Math.sin(radians),
      };
    }),
  };
}

function findOutputIndex(compiled: CompiledCircuit, name: string): number {
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase() && index >= 0) return index;
  }
  throw new InvalidCircuitError(`.sens output node '${name}' does not exist`);
}
