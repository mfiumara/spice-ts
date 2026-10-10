import type { CompiledCircuit } from '../circuit.js';
import { BJT } from '../devices/bjt.js';
import { BSIM3v3 } from '../devices/bsim3v3.js';
import { Diode } from '../devices/diode.js';
import { MOSFET } from '../devices/mosfet.js';
import { Resistor } from '../devices/resistor.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { NoiseResult } from '../results.js';
import { toCsc } from '../solver/csc-matrix.js';
import { ComplexSparseSolver } from '../solver/complex-sparse-solver.js';
import type { NoiseAnalysis, ResolvedOptions } from '../types.js';

const BOLTZMANN_CONSTANT = 1.380649e-23;
const DEFAULT_TEMPERATURE_KELVIN = 273.15 + 27;

/** Reject devices whose noise sources are not part of the resistor-only slice. */
export function assertNoiseDevicesSupported(compiled: CompiledCircuit): void {
  for (const device of compiled.devices) {
    let kind: string | undefined;
    if (device instanceof Diode) kind = 'diode';
    else if (device instanceof BJT) kind = 'BJT';
    else if (device instanceof MOSFET || device instanceof BSIM3v3) kind = 'MOSFET';

    if (kind) {
      throw new InvalidCircuitError(
        `.noise does not support ${kind} noise for '${device.name}'`,
      );
    }
  }
}

/**
 * Solve the first bounded noise slice: thermal noise from ideal resistors at
 * ngspice's default 27 C circuit temperature. Controlled and independent ideal
 * sources are noiseless. Semiconductor and flicker-noise models are not part of
 * this slice.
 */
export function solveNoise(
  compiled: CompiledCircuit,
  analysis: NoiseAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): NoiseResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const outputIndex = findNodeIndex(compiled, analysis.outputNode);
  const inputSource = devices.find(device =>
    device instanceof VoltageSource
      && device.name.toLowerCase() === analysis.inputSource.toLowerCase(),
  );
  if (!(inputSource instanceof VoltageSource)) {
    throw new InvalidCircuitError(
      `.noise input source '${analysis.inputSource}' is not an independent voltage source`,
    );
  }

  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(dcSolution);
  const ctx = assembler.getStampContext();
  for (const device of devices) device.stamp(ctx);
  for (const device of devices) device.stampDynamic?.(ctx);
  for (let i = 0; i < nodeCount; i++) assembler.G.add(i, i, options.gmin);

  const { csc: gCsc } = toCsc(assembler.G);
  const { csc: cCsc } = toCsc(assembler.C);
  const solver = new ComplexSparseSolver();
  solver.analyzePattern(
    gCsc,
    cCsc,
    createMatrixVariableIdentities(nodeNames, branchNames),
  );

  const systemSize = nodeCount + branchCount;
  const zeroImaginary = new Float64Array(systemSize);
  const gainRhs = new Float64Array(systemSize);
  gainRhs[nodeCount + inputSource.branchIndex] = 1;

  const resistorSources = devices
    .filter((device): device is Resistor => device instanceof Resistor)
    .map(resistor => {
      if (!(resistor.resistance > 0) || !Number.isFinite(resistor.resistance)) {
        throw new InvalidCircuitError(
          `.noise requires a positive finite resistance for '${resistor.name}'`,
        );
      }
      return {
        resistor,
        currentDensity: Math.sqrt(
          4 * BOLTZMANN_CONSTANT * DEFAULT_TEMPERATURE_KELVIN / resistor.resistance,
        ),
      };
    });

  const frequencies = generateFrequencies(analysis, options.reltol);
  const hasIntegratedTotals = analysis.stopFreq > analysis.startFreq;
  const outputNoiseDensity: number[] = [];
  const inputNoiseDensity: number[] = [];
  const gainSquaredInverse: number[] = [];
  const resistorOutputPowerDensity = resistorSources.map(() => [] as number[]);

  for (const frequency of frequencies) {
    solver.factorize(gCsc, cCsc, 2 * Math.PI * frequency);
    const [gainReal, gainImaginary] = solver.solve(gainRhs, zeroImaginary);
    const gain = Math.hypot(gainReal[outputIndex], gainImaginary[outputIndex]);
    if (!(gain > 0) || !Number.isFinite(gain)) {
      throw new InvalidCircuitError(
        `.noise input source '${analysis.inputSource}' has zero gain to '${analysis.outputNode}'`,
      );
    }
    gainSquaredInverse.push(1 / (gain * gain));

    let outputPowerDensity = 0;
    for (let index = 0; index < resistorSources.length; index++) {
      const { resistor, currentDensity } = resistorSources[index];
      const rhs = new Float64Array(systemSize);
      const [positive, negative] = resistor.nodes;
      if (positive >= 0) rhs[positive] -= currentDensity;
      if (negative >= 0) rhs[negative] += currentDensity;
      const [real, imaginary] = solver.solve(rhs, zeroImaginary);
      const contribution = real[outputIndex] ** 2 + imaginary[outputIndex] ** 2;
      resistorOutputPowerDensity[index].push(contribution);
      outputPowerDensity += contribution;
    }

    const outputDensity = Math.sqrt(outputPowerDensity);
    outputNoiseDensity.push(outputDensity);
    inputNoiseDensity.push(outputDensity / gain);
  }

  const integratedOutputNoise = hasIntegratedTotals
    ? Math.sqrt(sumIntegratedOutputPower(frequencies, resistorOutputPowerDensity))
    : undefined;
  const integratedInputNoise = hasIntegratedTotals
    ? Math.sqrt(sumIntegratedInputPower(
      frequencies,
      resistorOutputPowerDensity,
      gainSquaredInverse,
    ))
    : undefined;

  return new NoiseResult(
    frequencies,
    analysis.outputNode,
    analysis.inputSource,
    outputNoiseDensity,
    inputNoiseDensity,
    integratedOutputNoise,
    integratedInputNoise,
  );
}

function findNodeIndex(compiled: CompiledCircuit, name: string): number {
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase() && index >= 0) return index;
  }
  throw new InvalidCircuitError(`.noise output node '${name}' does not exist`);
}

function generateFrequencies(analysis: NoiseAnalysis, relativeTolerance: number): number[] {
  if (analysis.variation === 'lin') {
    const step = (analysis.stopFreq - analysis.startFreq) / (analysis.points - 1);
    return Array.from(
      { length: analysis.points },
      (_, index) => index === analysis.points - 1
        ? analysis.stopFreq
        : analysis.startFreq + index * step,
    );
  }

  const base = analysis.variation === 'dec' ? 10 : 2;
  const frequencyRatio = Math.pow(base, 1 / analysis.points);
  const ngspiceStopTolerance = frequencyRatio * analysis.stopFreq * relativeTolerance;
  const toleratedSpan = analysis.variation === 'dec'
    ? Math.log10((analysis.stopFreq + ngspiceStopTolerance) / analysis.startFreq)
    : Math.log2((analysis.stopFreq + ngspiceStopTolerance) / analysis.startFreq);
  const intervalCount = Math.floor(toleratedSpan * analysis.points + 1e-12);
  return Array.from(
    { length: intervalCount + 1 },
    (_, index) => analysis.startFreq * Math.pow(base, index / analysis.points),
  );
}

function sumIntegratedOutputPower(frequencies: number[], sources: number[][]): number {
  return sources.reduce((total, powerDensity) => {
    for (let index = 1; index < frequencies.length; index++) {
      total += integratePowerLawInterval(
        frequencies[index - 1],
        frequencies[index],
        powerDensity[index],
        Math.log(Math.max(powerDensity[index - 1], 1e-38)),
        Math.log(Math.max(powerDensity[index], 1e-38)),
      );
    }
    return total;
  }, 0);
}

function sumIntegratedInputPower(
  frequencies: number[],
  sources: number[][],
  gainSquaredInverse: number[],
): number {
  return sources.reduce((total, outputPowerDensity) => {
    for (let index = 1; index < frequencies.length; index++) {
      // ngspice refers each source contribution to the input with the gain at
      // the current point before applying its log-log interval integration.
      const logGainInverse = Math.log(gainSquaredInverse[index]);
      total += integratePowerLawInterval(
        frequencies[index - 1],
        frequencies[index],
        outputPowerDensity[index] * gainSquaredInverse[index],
        Math.log(Math.max(outputPowerDensity[index - 1], 1e-38)) + logGainInverse,
        Math.log(Math.max(outputPowerDensity[index], 1e-38)) + logGainInverse,
      );
    }
    return total;
  }, 0);
}

function integratePowerLawInterval(
  previousFrequency: number,
  frequency: number,
  powerDensity: number,
  previousLogPowerDensity: number,
  logPowerDensity: number,
): number {
  const logFrequency = Math.log(frequency);
  const previousLogFrequency = Math.log(previousFrequency);
  let exponent = (logPowerDensity - previousLogPowerDensity)
    / (logFrequency - previousLogFrequency);
  if (Math.abs(exponent) < 1e-10) {
    return powerDensity * (frequency - previousFrequency);
  }

  const coefficient = Math.exp(logPowerDensity - exponent * logFrequency);
  exponent += 1;
  if (Math.abs(exponent) < 1e-10) {
    return coefficient * (logFrequency - previousLogFrequency);
  }
  return coefficient * (
    Math.exp(exponent * logFrequency) - Math.exp(exponent * previousLogFrequency)
  ) / exponent;
}
