import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { CurrentSource } from '../devices/current-source.js';
import { Inductor } from '../devices/inductor.js';
import { Resistor } from '../devices/resistor.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import {
  DistortionResult, type ComplexDistortionValue,
} from '../results.js';
import type { DistortionAnalysis } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

type SupportedDevice = Resistor | Capacitor | Inductor | VoltageSource | CurrentSource;
type IndependentSource = VoltageSource | CurrentSource;

/**
 * Return the mathematically exact low-order distortion of an ideal linear RLC
 * circuit. Linear devices have no second- or third-order forcing terms, so all
 * complex harmonic components are zero.
 */
export function solveLinearDistortion(
  compiled: CompiledCircuit,
  analysis: DistortionAnalysis,
  guard?: ProtocolExecutionGuard,
): DistortionResult {
  const frequencies = generateFrequencies(analysis);
  for (const _frequency of frequencies) {
    guard?.checkpoint('solve:ac-point');
    guard?.recordResultPoint();
  }

  return new DistortionResult(
    frequencies,
    zeroArrays(compiled.nodeNames, frequencies.length),
    zeroArrays(compiled.nodeNames, frequencies.length),
    zeroArrays(compiled.branchNames, frequencies.length),
    zeroArrays(compiled.branchNames, frequencies.length),
  );
}

/** Validate the complete semantic boundary before attempting a DC solve. */
export function assertLinearDistortionSupported(compiled: CompiledCircuit): void {
  assertSupportedDevices(compiled);
  assertSingleTone(compiled);
}

function assertSupportedDevices(compiled: CompiledCircuit): asserts compiled is CompiledCircuit & {
  devices: SupportedDevice[];
} {
  for (const device of compiled.devices) {
    if (
      device instanceof Resistor
      || device instanceof Capacitor
      || device instanceof Inductor
      || device instanceof VoltageSource
      || device instanceof CurrentSource
    ) continue;
    throw new InvalidCircuitError(
      `.disto supports only independent sources and ideal R, L, C devices; found ${device.name} (${device.constructor.name})`,
    );
  }
}

function assertSingleTone(compiled: CompiledCircuit): void {
  const sources = compiled.devices.filter((device): device is IndependentSource =>
    device instanceof VoltageSource || device instanceof CurrentSource);
  for (const source of sources) {
    const secondTone = source.waveform.distortionF2;
    if (secondTone && secondTone.magnitude !== 0) {
      throw new InvalidCircuitError(
        `Two-tone .disto is not supported; source '${source.name}' has non-zero DISTOF2`,
      );
    }
  }
  const active = sources.filter(source => source.waveform.distortionF1?.magnitude !== undefined
    && source.waveform.distortionF1.magnitude !== 0);
  if (active.length !== 1) {
    const found = active.length === 0 ? '0' : active.map(source => source.name).join(', ');
    throw new InvalidCircuitError(
      `.disto requires exactly one non-zero DISTOF1 excitation; found ${found}`,
    );
  }
  const excitation = active[0].waveform.distortionF1!;
  if (!Number.isFinite(excitation.magnitude) || excitation.magnitude <= 0
      || !Number.isFinite(excitation.phase)) {
    throw new InvalidCircuitError(`Invalid DISTOF1 excitation on source '${active[0].name}'`);
  }
}

function generateFrequencies(analysis: DistortionAnalysis): number[] {
  const decades = Math.log10(analysis.stopFreq / analysis.startFreq);
  const totalPoints = Math.round(decades * analysis.points);
  return Array.from(
    { length: totalPoints + 1 },
    (_, index) => analysis.startFreq * Math.pow(10, index / analysis.points),
  );
}

function zeroArrays(names: string[], count: number): Map<string, ComplexDistortionValue[]> {
  return new Map(names.map(name => [
    name,
    Array.from({ length: count }, () => ({ real: 0, imaginary: 0 })),
  ]));
}
