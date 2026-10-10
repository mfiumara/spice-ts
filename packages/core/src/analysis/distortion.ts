import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { CurrentSource } from '../devices/current-source.js';
import { Diode, type DiodeDistortionCoefficients } from '../devices/diode.js';
import { Inductor } from '../devices/inductor.js';
import { Resistor } from '../devices/resistor.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import {
  DistortionResult, type ComplexDistortionValue, type DistortionProduct,
} from '../results.js';
import type { DistortionAnalysis } from '../types.js';
import type { ResolvedOptions } from '../types.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';
import {
  createLinearizedFrequencySystem, type ComplexACRHS,
} from './ac.js';

type SupportedDevice = Resistor | Capacitor | Inductor | VoltageSource | CurrentSource | Diode;
type IndependentSource = VoltageSource | CurrentSource;

interface ComplexValue {
  real: number;
  imaginary: number;
}

/**
 * Return the mathematically exact low-order distortion of an ideal linear RLC
 * circuit. Linear devices have no harmonic or intermodulation forcing terms,
 * so every represented complex product is zero.
 */
export function solveDistortion(
  compiled: CompiledCircuit,
  analysis: DistortionAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
  guard?: ProtocolExecutionGuard,
): DistortionResult {
  const frequencies = generateFrequencies(analysis);
  const diodes = compiled.devices.filter((device): device is Diode => device instanceof Diode);
  if (diodes.length > 0) {
    return solveDiodeDistortion(
      compiled, analysis, options, dcSolution, frequencies, diodes, guard,
    );
  }
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
export function assertDistortionSupported(
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
      || device instanceof Diode
    ) continue;
    throw new InvalidCircuitError(
      `.disto supports only independent sources, ideal R, L, C devices, and bounded diodes; found ${device.name} (${device.constructor.name})`,
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

function solveDiodeDistortion(
  compiled: CompiledCircuit,
  analysis: DistortionAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
  frequencies: number[],
  diodes: Diode[],
  guard?: ProtocolExecutionGuard,
): DistortionResult {
  const coefficients = new Map(diodes.map(diode => [
    diode,
    diode.distortionCoefficients(dcSolution),
  ]));
  const system = createLinearizedFrequencySystem(compiled, options, dcSolution, 'distortion');
  const products: DistortionProduct[] = analysis.f2OverF1 === undefined
    ? [2, 3]
    : ['f1+f2', 'f1-f2', '2f1-f2'];
  const voltageArrays = zeroProductArrays(
    products, compiled.nodeNames, frequencies.length,
  );
  const currentArrays = zeroProductArrays(
    products, compiled.branchNames, frequencies.length,
  );
  const f1Rhs = buildDistortionRhs(compiled, 'DISTOF1');
  const f2Rhs = analysis.f2OverF1 === undefined
    ? undefined
    : buildDistortionRhs(compiled, 'DISTOF2');
  const omega2 = analysis.f2OverF1 === undefined
    ? undefined
    : 2 * Math.PI * analysis.startFreq * analysis.f2OverF1;
  const tone2 = omega2 === undefined ? undefined : system.solve(omega2, f2Rhs!);

  for (let index = 0; index < frequencies.length; index++) {
    guard?.checkpoint('solve:ac-point');
    guard?.recordResultPoint();
    const omega1 = 2 * Math.PI * frequencies[index];
    const tone1 = system.solve(omega1, f1Rhs);
    const second = solveForcedProduct(
      system,
      2 * omega1,
      diodes,
      coefficients,
      (diode, coefficient) => multiply(
        coefficientAt(coefficient, 2 * omega1),
        square(diodeVoltage(tone1, diode)),
      ),
    );

    if (tone2 === undefined || omega2 === undefined) {
      const third = solveForcedProduct(
        system,
        3 * omega1,
        diodes,
        coefficients,
        (diode, coefficient) => {
          const v1 = diodeVoltage(tone1, diode);
          return add(
            scale(multiply(
              coefficientAt(coefficient, 3 * omega1),
              multiply(v1, diodeVoltage(second, diode)),
            ), 2),
            multiply(
              cubicCoefficientAt(coefficient, 3 * omega1),
              multiply(square(v1), v1),
            ),
          );
        },
      );
      storeSolution(voltageArrays.get(2)!, currentArrays.get(2)!, second, compiled, index, 2);
      storeSolution(voltageArrays.get(3)!, currentArrays.get(3)!, third, compiled, index, 2);
      continue;
    }

    const sumOmega = omega1 + omega2;
    const differenceOmega = omega1 - omega2;
    const sum = solveForcedProduct(
      system,
      sumOmega,
      diodes,
      coefficients,
      (diode, coefficient) => multiply(
        coefficientAt(coefficient, sumOmega),
        multiply(diodeVoltage(tone1, diode), diodeVoltage(tone2, diode)),
      ),
    );
    const difference = solveForcedProduct(
      system,
      differenceOmega,
      diodes,
      coefficients,
      (diode, coefficient) => multiply(
        coefficientAt(coefficient, differenceOmega),
        multiply(diodeVoltage(tone1, diode), conjugate(diodeVoltage(tone2, diode))),
      ),
    );
    const thirdDifferenceOmega = 2 * omega1 - omega2;
    const thirdDifference = solveForcedProduct(
      system,
      thirdDifferenceOmega,
      diodes,
      coefficients,
      (diode, coefficient) => {
        const v1 = diodeVoltage(tone1, diode);
        const conjugateV2 = conjugate(diodeVoltage(tone2, diode));
        const quadraticMix = add(
          scale(multiply(v1, diodeVoltage(difference, diode)), 4),
          scale(multiply(conjugateV2, diodeVoltage(second, diode)), 2),
        );
        return add(
          scale(multiply(
            coefficientAt(coefficient, thirdDifferenceOmega),
            quadraticMix,
          ), 1 / 3),
          multiply(
            cubicCoefficientAt(coefficient, thirdDifferenceOmega),
            multiply(square(v1), conjugateV2),
          ),
        );
      },
    );
    storeSolution(
      voltageArrays.get('f1+f2')!, currentArrays.get('f1+f2')!,
      sum, compiled, index, 4,
    );
    storeSolution(
      voltageArrays.get('f1-f2')!, currentArrays.get('f1-f2')!,
      difference, compiled, index, 4,
    );
    storeSolution(
      voltageArrays.get('2f1-f2')!, currentArrays.get('2f1-f2')!,
      thirdDifference, compiled, index, 6,
    );
  }

  return new DistortionResult(
    frequencies,
    voltageArrays,
    currentArrays,
    analysis.f2OverF1,
  );
}

function buildDistortionRhs(
  compiled: CompiledCircuit,
  field: 'DISTOF1' | 'DISTOF2',
): ComplexACRHS {
  const real = new Float64Array(compiled.nodeCount + compiled.branchCount);
  const imaginary = new Float64Array(real.length);
  for (const device of compiled.devices) {
    if (!(device instanceof VoltageSource || device instanceof CurrentSource)) continue;
    const excitation = field === 'DISTOF1'
      ? device.waveform.distortionF1
      : device.waveform.distortionF2;
    if (!excitation || excitation.magnitude === 0) continue;
    const phase = excitation.phase * Math.PI / 180;
    const value = {
      real: excitation.magnitude * Math.cos(phase) / 2,
      imaginary: excitation.magnitude * Math.sin(phase) / 2,
    };
    if (device instanceof VoltageSource) {
      const row = compiled.nodeCount + device.branchIndex;
      real[row] += value.real;
      imaginary[row] += value.imaginary;
      continue;
    }
    const [positive, negative] = device.nodes;
    if (positive >= 0) {
      real[positive] -= value.real;
      imaginary[positive] -= value.imaginary;
    }
    if (negative >= 0) {
      real[negative] += value.real;
      imaginary[negative] += value.imaginary;
    }
  }
  return { real, imaginary };
}

function solveForcedProduct(
  system: ReturnType<typeof createLinearizedFrequencySystem>,
  omega: number,
  diodes: Diode[],
  coefficients: Map<Diode, DiodeDistortionCoefficients>,
  force: (diode: Diode, coefficient: DiodeDistortionCoefficients) => ComplexValue,
): ComplexACRHS {
  const rhs: ComplexACRHS = {
    real: new Float64Array(system.size),
    imaginary: new Float64Array(system.size),
  };
  for (const diode of diodes) {
    const current = force(diode, coefficients.get(diode)!);
    const [positive, negative] = diode.nodes;
    if (positive >= 0) {
      rhs.real[positive] -= current.real;
      rhs.imaginary[positive] -= current.imaginary;
    }
    if (negative >= 0) {
      rhs.real[negative] += current.real;
      rhs.imaginary[negative] += current.imaginary;
    }
  }
  return system.solve(omega, rhs);
}

function diodeVoltage(solution: ComplexACRHS, diode: Diode): ComplexValue {
  const [positive, negative] = diode.nodes;
  return {
    real: (positive >= 0 ? solution.real[positive] : 0)
      - (negative >= 0 ? solution.real[negative] : 0),
    imaginary: (positive >= 0 ? solution.imaginary[positive] : 0)
      - (negative >= 0 ? solution.imaginary[negative] : 0),
  };
}

function coefficientAt(
  coefficient: DiodeDistortionCoefficients,
  omega: number,
): ComplexValue {
  return { real: coefficient.current2, imaginary: omega * coefficient.charge2 };
}

function cubicCoefficientAt(
  coefficient: DiodeDistortionCoefficients,
  omega: number,
): ComplexValue {
  return { real: coefficient.current3, imaginary: omega * coefficient.charge3 };
}

function multiply(a: ComplexValue, b: ComplexValue): ComplexValue {
  return {
    real: a.real * b.real - a.imaginary * b.imaginary,
    imaginary: a.real * b.imaginary + a.imaginary * b.real,
  };
}

function add(a: ComplexValue, b: ComplexValue): ComplexValue {
  return { real: a.real + b.real, imaginary: a.imaginary + b.imaginary };
}

function scale(value: ComplexValue, factor: number): ComplexValue {
  return { real: value.real * factor, imaginary: value.imaginary * factor };
}

function square(value: ComplexValue): ComplexValue {
  return multiply(value, value);
}

function conjugate(value: ComplexValue): ComplexValue {
  return { real: value.real, imaginary: -value.imaginary };
}

function storeSolution(
  voltages: Map<string, ComplexDistortionValue[]>,
  currents: Map<string, ComplexDistortionValue[]>,
  solution: ComplexACRHS,
  compiled: CompiledCircuit,
  index: number,
  factor: number,
): void {
  for (let node = 0; node < compiled.nodeNames.length; node++) {
    voltages.get(compiled.nodeNames[node])![index] = {
      real: factor * solution.real[node],
      imaginary: factor * solution.imaginary[node],
    };
  }
  for (let branch = 0; branch < compiled.branchNames.length; branch++) {
    currents.get(compiled.branchNames[branch])![index] = {
      real: factor * solution.real[compiled.nodeCount + branch],
      imaginary: factor * solution.imaginary[compiled.nodeCount + branch],
    };
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
