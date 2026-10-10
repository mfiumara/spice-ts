import type { CompiledCircuit } from '../circuit.js';
import { BJT } from '../devices/bjt.js';
import { BSIM3v3 } from '../devices/bsim3v3.js';
import { Diode } from '../devices/diode.js';
import { JFET } from '../devices/jfet.js';
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
const ELEMENTARY_CHARGE = 1.602176634e-19;
const DEFAULT_TEMPERATURE_KELVIN = 273.15 + 27;
const BJT_NOISE_MODEL_PARAMETERS = new Set([
  'LEVEL', 'BF', 'BR', 'IS', 'NF', 'NR', 'VAF', 'IKF', 'ISE', 'NE', 'RB', 'RC', 'RE',
  'KF', 'AF', 'polarity',
]);

/** Reject devices whose noise sources are not part of the bounded slice. */
export function assertNoiseDevicesSupported(compiled: CompiledCircuit): void {
  const hasDifferentialOutput = compiled.analyses.some(analysis =>
    analysis.type === 'noise' && analysis.outputReferenceNode !== undefined
  );
  for (const device of compiled.devices) {
    if (hasDifferentialOutput && isSemiconductorNoiseDevice(device)) {
      throw new InvalidCircuitError(
        '.noise differential voltage output only supports resistor noise',
      );
    }
    if (device instanceof Diode && (device.params.RS ?? 0) > 0) {
      throw new InvalidCircuitError(
        `.noise does not support diode series-resistance noise for '${device.name}'`,
      );
    }
    let kind: string | undefined;
    if (device instanceof BJT) {
      for (const parameter of Object.keys(device.suppliedParams)) {
        if (!BJT_NOISE_MODEL_PARAMETERS.has(parameter)) {
          throw new InvalidCircuitError(
            `.noise does not support BJT model parameter '${parameter}' for '${device.name}'`,
          );
        }
      }
    } else if (device instanceof BSIM3v3) kind = 'MOSFET';

    if (device instanceof MOSFET) {
      if (device.params.LEVEL !== 1) {
        throw new InvalidCircuitError(
          `.noise only supports MOSFET level 1 for '${device.name}'`,
        );
      }
      for (const parameter of ['RD', 'RS'] as const) {
        if (device.suppliedParams[parameter] !== undefined) {
          throw new InvalidCircuitError(
            `.noise does not support MOSFET model parameter '${parameter}' for '${device.name}'`,
          );
        }
      }
      const sourceNode = device.nodes[2];
      const bulkNode = device.nodes[3] ?? sourceNode;
      if (
        bulkNode !== sourceNode
        || device.suppliedParams.GAMMA !== undefined
        || device.suppliedParams.PHI !== undefined
      ) {
        throw new InvalidCircuitError(
          `.noise does not support MOSFET bulk/body-effect form for '${device.name}'`,
        );
      }
      const { W, L, KF, AF, NLEV, TOX } = device.params;
      if (!(W > 0) || !Number.isFinite(W) || !(L > 0) || !Number.isFinite(L)) {
        throw new InvalidCircuitError(`.noise requires positive finite MOSFET W and L for '${device.name}'`);
      }
      if (!(KF >= 0) || !Number.isFinite(KF) || !(AF > 0) || !Number.isFinite(AF)) {
        throw new InvalidCircuitError(`.noise requires finite MOSFET KF >= 0 and AF > 0 for '${device.name}'`);
      }
      if (NLEV !== 2) {
        throw new InvalidCircuitError(`.noise only supports MOSFET NLEV=2 for '${device.name}'`);
      }
      if (TOX !== undefined && (!(TOX > 0) || !Number.isFinite(TOX))) {
        throw new InvalidCircuitError(`.noise requires a positive finite MOSFET TOX for '${device.name}'`);
      }
    }
    if (kind) {
      throw new InvalidCircuitError(
        `.noise does not support ${kind} noise for '${device.name}'`,
      );
    }
  }
}

/**
 * Solve the bounded noise slice at ngspice's default 27 C circuit temperature:
 * resistor thermal noise, diode junction shot/flicker noise, BJT level-1
 * collector/base shot, base-current KF/AF flicker noise, and RB/RC/RE
 * thermal noise, plus MOS1 channel thermal/KF/AF flicker noise.
 * Controlled and independent ideal sources are noiseless.
 */
export function solveNoise(
  compiled: CompiledCircuit,
  analysis: NoiseAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): NoiseResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const outputIndex = findNodeIndex(compiled, analysis.outputNode);
  const outputReferenceIndex = analysis.outputReferenceNode === undefined
    ? -1
    : findNodeIndex(compiled, analysis.outputReferenceNode);
  if (analysis.outputReferenceNode !== undefined && devices.some(isSemiconductorNoiseDevice)) {
    throw new InvalidCircuitError(
      '.noise differential voltage output only supports resistor noise',
    );
  }
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
        positive: resistor.nodes[0],
        negative: resistor.nodes[1],
        currentPowerDensity: (_frequency: number) =>
          4 * BOLTZMANN_CONSTANT * DEFAULT_TEMPERATURE_KELVIN / resistor.resistance,
      };
    });
  const mosfetSources = devices
    .filter((device): device is MOSFET => device instanceof MOSFET)
    .flatMap(mosfet => {
      const operatingPoint = mosfet.noiseOperatingPoint(dcSolution);
      const { W, L, KF, AF, TOX } = mosfet.params;
      const oxideCapacitance = 3.9 * 8.854214871e-12 / (TOX ?? 1e-7);
      const sources = [{
        positive: operatingPoint.drainNode,
        negative: operatingPoint.sourceNode,
        currentPowerDensity: (_frequency: number) => 4 * BOLTZMANN_CONSTANT * DEFAULT_TEMPERATURE_KELVIN
          * (2 / 3) * Math.abs(operatingPoint.transconductance),
      }];
      if (KF > 0) {
        sources.push({
          positive: operatingPoint.drainNode,
          negative: operatingPoint.sourceNode,
          currentPowerDensity: (frequency: number) => KF
            * operatingPoint.transconductance * operatingPoint.transconductance
            / (Math.pow(frequency, AF) * W * L * oxideCapacitance),
        });
      }
      return sources;
    });
  const bjtSources = devices
    .filter((device): device is BJT => device instanceof BJT)
    .flatMap(bjt => {
      const operatingPoint = bjt.noiseOperatingPoint(dcSolution);
      const sources = [{
        positive: operatingPoint.collectorNode,
        negative: operatingPoint.emitterNode,
        currentPowerDensity: (_frequency: number) => 2 * ELEMENTARY_CHARGE
          * operatingPoint.collectorCurrent,
      }, {
        positive: operatingPoint.baseNode,
        negative: operatingPoint.emitterNode,
        currentPowerDensity: (_frequency: number) => 2 * ELEMENTARY_CHARGE
          * operatingPoint.baseCurrent,
      }];
      if (bjt.params.KF > 0) {
        sources.push({
          positive: operatingPoint.baseNode,
          negative: operatingPoint.emitterNode,
          currentPowerDensity: (frequency: number) => bjt.params.KF
            * Math.pow(Math.max(operatingPoint.baseCurrent, 1e-38), bjt.params.AF)
            / frequency,
        });
      }
      return sources;
    });
  const diodeSources = devices
    .filter((device): device is Diode => device instanceof Diode)
    .flatMap(diode => {
      const operatingPoint = diode.noiseOperatingPoint(dcSolution);
      const current = Math.abs(operatingPoint.current);
      const sources: Array<{
        nodes: number[];
        powerDensity: (frequency: number) => number;
      }> = [{
        nodes: diode.nodes,
        powerDensity: () => 2 * ELEMENTARY_CHARGE * current,
      }];
      if (operatingPoint.flickerCoefficient > 0) {
        const multiplier = operatingPoint.parallelMultiplier;
        sources.push({
          nodes: diode.nodes,
          powerDensity: (frequency: number) => operatingPoint.flickerCoefficient
            * Math.pow(Math.max(current / multiplier, Number.MIN_VALUE), operatingPoint.flickerExponent)
            * multiplier / frequency,
        });
      }
      return sources;
    });
  const noiseSources = [...resistorSources, ...mosfetSources, ...bjtSources];

  const frequencies = generateFrequencies(analysis, options.reltol);
  const hasIntegratedTotals = analysis.stopFreq > analysis.startFreq;
  const outputNoiseDensity: number[] = [];
  const inputNoiseDensity: number[] = [];
  const gainSquaredInverse: number[] = [];
  const sourceOutputPowerDensity = noiseSources.map(() => [] as number[]);
  const diodeOutputPowerDensity = diodeSources.map(() => [] as number[]);

  for (const frequency of frequencies) {
    solver.factorize(gCsc, cCsc, 2 * Math.PI * frequency);
    const [gainReal, gainImaginary] = solver.solve(gainRhs, zeroImaginary);
    const gain = differentialMagnitude(
      gainReal, gainImaginary, outputIndex, outputReferenceIndex,
    );
    if (!(gain > 0) || !Number.isFinite(gain)) {
      const outputName = analysis.outputReferenceNode === undefined
        ? analysis.outputNode
        : `${analysis.outputNode},${analysis.outputReferenceNode}`;
      throw new InvalidCircuitError(
        `.noise input source '${analysis.inputSource}' has zero gain to '${outputName}'`,
      );
    }
    gainSquaredInverse.push(1 / (gain * gain));

    let outputPowerDensity = 0;
    for (let index = 0; index < noiseSources.length; index++) {
      const { positive, negative, currentPowerDensity } = noiseSources[index];
      const currentDensity = Math.sqrt(currentPowerDensity(frequency));
      const rhs = new Float64Array(systemSize);
      if (positive >= 0) rhs[positive] -= currentDensity;
      if (negative >= 0) rhs[negative] += currentDensity;
      const [real, imaginary] = solver.solve(rhs, zeroImaginary);
      const contribution = differentialMagnitudeSquared(
        real, imaginary, outputIndex, outputReferenceIndex,
      );
      sourceOutputPowerDensity[index].push(contribution);
      outputPowerDensity += contribution;
    }
    for (let index = 0; index < diodeSources.length; index++) {
      const { nodes, powerDensity } = diodeSources[index];
      const rhs = new Float64Array(systemSize);
      const [positive, negative] = nodes;
      const currentDensity = Math.sqrt(powerDensity(frequency));
      if (positive >= 0) rhs[positive] -= currentDensity;
      if (negative >= 0) rhs[negative] += currentDensity;
      const [real, imaginary] = solver.solve(rhs, zeroImaginary);
      const contribution = differentialMagnitudeSquared(
        real, imaginary, outputIndex, outputReferenceIndex,
      );
      diodeOutputPowerDensity[index].push(contribution);
      outputPowerDensity += contribution;
    }

    const outputDensity = Math.sqrt(outputPowerDensity);
    outputNoiseDensity.push(outputDensity);
    inputNoiseDensity.push(outputDensity / gain);
  }

  const integratedOutputNoise = hasIntegratedTotals
    ? Math.sqrt(sumIntegratedOutputPower(
      frequencies,
      [...sourceOutputPowerDensity, ...diodeOutputPowerDensity],
    ))
    : undefined;
  const integratedInputNoise = hasIntegratedTotals
    ? Math.sqrt(sumIntegratedInputPower(
      frequencies,
      [...sourceOutputPowerDensity, ...diodeOutputPowerDensity],
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
    analysis.outputReferenceNode,
  );
}

function isSemiconductorNoiseDevice(device: CompiledCircuit['devices'][number]): boolean {
  return device instanceof Diode
    || device instanceof BJT
    || device instanceof JFET
    || device instanceof MOSFET
    || device instanceof BSIM3v3;
}

function findNodeIndex(compiled: CompiledCircuit, name: string): number {
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase()) return index;
  }
  throw new InvalidCircuitError(`.noise output node '${name}' does not exist`);
}

function differentialMagnitude(
  real: Float64Array,
  imaginary: Float64Array,
  positive: number,
  negative: number,
): number {
  return Math.sqrt(differentialMagnitudeSquared(real, imaginary, positive, negative));
}

function differentialMagnitudeSquared(
  real: Float64Array,
  imaginary: Float64Array,
  positive: number,
  negative: number,
): number {
  const realDifference = (positive < 0 ? 0 : real[positive]) - (negative < 0 ? 0 : real[negative]);
  const imaginaryDifference = (positive < 0 ? 0 : imaginary[positive])
    - (negative < 0 ? 0 : imaginary[negative]);
  return realDifference * realDifference + imaginaryDifference * imaginaryDifference;
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
