import type { CompiledCircuit } from '../circuit.js';
import { Resistor } from '../devices/resistor.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import { MNAAssembler } from '../mna/assembler.js';
import { NoiseResult } from '../results.js';
import { toCsc } from '../solver/csc-matrix.js';
import { ComplexSparseSolver } from '../solver/complex-sparse-solver.js';
import type { NoiseAnalysis, ResolvedOptions } from '../types.js';

const BOLTZMANN_CONSTANT = 1.380649e-23;
const DEFAULT_TEMPERATURE_KELVIN = 273.15 + 27;

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
  const { devices, nodeCount, branchCount } = compiled;
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
  solver.analyzePattern(gCsc, cCsc);

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

  const frequencies = generateLinearFrequencies(analysis);
  const outputNoiseDensity: number[] = [];
  const inputNoiseDensity: number[] = [];

  for (const frequency of frequencies) {
    solver.factorize(gCsc, cCsc, 2 * Math.PI * frequency);
    const [gainReal, gainImaginary] = solver.solve(gainRhs, zeroImaginary);
    const gain = Math.hypot(gainReal[outputIndex], gainImaginary[outputIndex]);
    if (!(gain > 0) || !Number.isFinite(gain)) {
      throw new InvalidCircuitError(
        `.noise input source '${analysis.inputSource}' has zero gain to '${analysis.outputNode}'`,
      );
    }

    let outputPowerDensity = 0;
    for (const { resistor, currentDensity } of resistorSources) {
      const rhs = new Float64Array(systemSize);
      const [positive, negative] = resistor.nodes;
      if (positive >= 0) rhs[positive] -= currentDensity;
      if (negative >= 0) rhs[negative] += currentDensity;
      const [real, imaginary] = solver.solve(rhs, zeroImaginary);
      outputPowerDensity += real[outputIndex] ** 2 + imaginary[outputIndex] ** 2;
    }

    const outputDensity = Math.sqrt(outputPowerDensity);
    outputNoiseDensity.push(outputDensity);
    inputNoiseDensity.push(outputDensity / gain);
  }

  return new NoiseResult(
    frequencies,
    analysis.outputNode,
    analysis.inputSource,
    outputNoiseDensity,
    inputNoiseDensity,
  );
}

function findNodeIndex(compiled: CompiledCircuit, name: string): number {
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase() && index >= 0) return index;
  }
  throw new InvalidCircuitError(`.noise output node '${name}' does not exist`);
}

function generateLinearFrequencies(analysis: NoiseAnalysis): number[] {
  const step = (analysis.stopFreq - analysis.startFreq) / (analysis.points - 1);
  return Array.from(
    { length: analysis.points },
    (_, index) => index === analysis.points - 1
      ? analysis.stopFreq
      : analysis.startFreq + index * step,
  );
}
