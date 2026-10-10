import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { CurrentSource } from '../devices/current-source.js';
import { Inductor } from '../devices/inductor.js';
import { Resistor } from '../devices/resistor.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import {
  DistortionResult, type ComplexDistortionValue, type DistortionProduct,
} from '../results.js';
import type { DistortionAnalysis } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';

type SupportedDevice = Resistor | Capacitor | Inductor | VoltageSource | CurrentSource;
type IndependentSource = VoltageSource | CurrentSource;

/**
 * Return the mathematically exact low-order distortion of an ideal linear RLC
 * circuit. Linear devices have no harmonic or intermodulation forcing terms,
 * so every represented complex product is zero.
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

  const products: DistortionProduct[] = analysis.f2OverF1 === undefined
    ? [2, 3]
    : ['f1+f2', 'f1-f2', '2f1-f2'];

  return new DistortionResult(
    frequencies,
    zeroProductArrays(products, compiled.nodeNames, frequencies.length),
    zeroProductArrays(products, compiled.branchNames, frequencies.length),
    analysis.f2OverF1,
  );
}

/** Validate the complete semantic boundary before attempting a DC solve. */
export function assertLinearDistortionSupported(
  compiled: CompiledCircuit,
  analysis: DistortionAnalysis,
): void {
  assertSupportedDevices(compiled);
  assertExcitations(compiled, analysis);
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

function assertExcitations(compiled: CompiledCircuit, analysis: DistortionAnalysis): void {
  const sources = compiled.devices.filter((device): device is IndependentSource =>
    device instanceof VoltageSource || device instanceof CurrentSource);
  const activeF1 = sources.filter(source => source.waveform.distortionF1?.magnitude !== undefined
    && source.waveform.distortionF1.magnitude !== 0);
  if (activeF1.length !== 1) {
    const found = activeF1.length === 0 ? '0' : activeF1.map(source => source.name).join(', ');
    throw new InvalidCircuitError(
      `.disto requires exactly one non-zero DISTOF1 excitation; found ${found}`,
    );
  }
  assertValidExcitation(activeF1[0], 'DISTOF1');

  const activeF2 = sources.filter(source => source.waveform.distortionF2?.magnitude !== undefined
    && source.waveform.distortionF2.magnitude !== 0);
  if (analysis.f2OverF1 === undefined) {
    if (activeF2.length > 0) {
      throw new InvalidCircuitError(
        `Non-zero DISTOF2 on source '${activeF2[0].name}' requires .disto f2overf1`,
      );
    }
    return;
  }

  if (activeF2.length !== 1) {
    const found = activeF2.length === 0 ? '0' : activeF2.map(source => source.name).join(', ');
    throw new InvalidCircuitError(
      `.disto two-tone requires exactly one non-zero DISTOF2 excitation; found ${found}`,
    );
  }
  assertValidExcitation(activeF2[0], 'DISTOF2');
}

function assertValidExcitation(source: IndependentSource, field: 'DISTOF1' | 'DISTOF2'): void {
  const excitation = field === 'DISTOF1'
    ? source.waveform.distortionF1!
    : source.waveform.distortionF2!;
  if (!Number.isFinite(excitation.magnitude) || excitation.magnitude <= 0
      || !Number.isFinite(excitation.phase)) {
    throw new InvalidCircuitError(`Invalid ${field} excitation on source '${source.name}'`);
  }
}

function generateFrequencies(analysis: DistortionAnalysis): number[] {
  const frequencies: number[] = [];
  for (let index = 0; ; index++) {
    const frequency = analysis.startFreq * Math.pow(10, index / analysis.points);
    if (frequency > analysis.stopFreq) break;
    frequencies.push(frequency);
  }
  return frequencies;
}

function zeroArrays(names: string[], count: number): Map<string, ComplexDistortionValue[]> {
  return new Map(names.map(name => [
    name,
    Array.from({ length: count }, () => ({ real: 0, imaginary: 0 })),
  ]));
}

function zeroProductArrays(
  products: DistortionProduct[],
  names: string[],
  count: number,
): Map<DistortionProduct, Map<string, ComplexDistortionValue[]>> {
  return new Map(products.map(product => [product, zeroArrays(names, count)]));
}
