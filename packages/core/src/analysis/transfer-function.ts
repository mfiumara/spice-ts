import type { CompiledCircuit } from '../circuit.js';
import { CurrentSource } from '../devices/current-source.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import { MNAAssembler } from '../mna/assembler.js';
import { TransferFunctionResult } from '../results.js';
import { solveLU } from '../solver/lu-solver.js';
import type { ConvergenceTelemetry, ResolvedOptions, TransferFunctionAnalysis } from '../types.js';
import { solveDCOperatingPoint } from './dc.js';

/** Solve the bounded single-node voltage- or voltage-source current-output form of `.tf`. */
export function solveTransferFunction(
  compiled: CompiledCircuit,
  analysis: TransferFunctionAnalysis,
  options: ResolvedOptions,
  convergence?: ConvergenceTelemetry,
): TransferFunctionResult {
  const output = 'outputNode' in analysis
    ? { kind: 'voltage' as const, index: findNodeIndex(compiled, analysis.outputNode) }
    : { kind: 'current' as const, source: findOutputSource(compiled, analysis.outputSource) };
  const inputSource = compiled.devices.find(device =>
    (device instanceof VoltageSource || device instanceof CurrentSource)
      && device.name.toLowerCase() === analysis.inputSource.toLowerCase(),
  );
  if (!(inputSource instanceof VoltageSource || inputSource instanceof CurrentSource)) {
    throw new InvalidCircuitError(
      `.tf input source '${analysis.inputSource}' is not an independent voltage or current source`,
    );
  }

  const dcSolution = solveSpiceOperatingPoint(compiled, options, convergence);
  const assembler = buildLinearizedSystem(compiled, options, dcSolution);
  const inputRhs = new Float64Array(assembler.systemSize);
  let inputResistance: number;

  if (inputSource instanceof VoltageSource) {
    inputRhs[compiled.nodeCount + inputSource.branchIndex] = 1;
    const response = solveLU(assembler.G, inputRhs);
    const inputCurrent = response[compiled.nodeCount + inputSource.branchIndex];
    const resistance = -1 / inputCurrent;
    inputResistance = Number.isFinite(resistance) ? resistance : 1e20;
    return resultWithOutputResistance(
      analysis, assembler, output, outputValue(compiled, output, response), inputResistance,
    );
  }

  const [positive, negative] = inputSource.nodes;
  // SPICE current-source current flows from its positive to negative terminal.
  if (positive >= 0) inputRhs[positive] -= 1;
  if (negative >= 0) inputRhs[negative] += 1;
  const response = solveLU(assembler.G, inputRhs);
  inputResistance = nodeVoltage(response, negative) - nodeVoltage(response, positive);
  return resultWithOutputResistance(
    analysis, assembler, output, outputValue(compiled, output, response), inputResistance,
  );
}

function solveSpiceOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  convergence?: ConvergenceTelemetry,
): Float64Array {
  return solveDCOperatingPoint(compiled, options, undefined, convergence).assembler.solution;
}

function buildLinearizedSystem(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): MNAAssembler {
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  assembler.solution.set(dcSolution);
  const ctx = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(ctx);
  for (const device of compiled.devices) device.stampDynamic?.(ctx);
  for (let index = 0; index < compiled.nodeCount; index++) {
    assembler.G.add(index, index, options.gmin);
  }
  return assembler;
}

function resultWithOutputResistance(
  analysis: TransferFunctionAnalysis,
  assembler: MNAAssembler,
  output: { kind: 'voltage'; index: number } | { kind: 'current'; source: VoltageSource },
  transfer: number,
  inputResistance: number,
): TransferFunctionResult {
  if (output.kind === 'current') {
    return new TransferFunctionResult(
      undefined,
      analysis.inputSource,
      transfer,
      inputResistance,
      1e20,
      output.source.name,
    );
  }
  const outputRhs = new Float64Array(assembler.systemSize);
  outputRhs[output.index] = 1;
  const outputResponse = solveLU(assembler.G, outputRhs);

  return new TransferFunctionResult(
    'outputNode' in analysis ? analysis.outputNode : undefined,
    analysis.inputSource,
    transfer,
    inputResistance,
    outputResponse[output.index],
  );
}

function findOutputSource(compiled: CompiledCircuit, name: string): VoltageSource {
  const source = compiled.devices.find(device =>
    device instanceof VoltageSource && device.name.toLowerCase() === name.toLowerCase(),
  );
  if (!(source instanceof VoltageSource)) {
    throw new InvalidCircuitError(
      `.tf current output '${name}' is not an independent voltage source`,
    );
  }
  return source;
}

function outputValue(
  compiled: CompiledCircuit,
  output: { kind: 'voltage'; index: number } | { kind: 'current'; source: VoltageSource },
  response: Float64Array,
): number {
  return output.kind === 'voltage'
    ? response[output.index]
    : response[compiled.nodeCount + output.source.branchIndex];
}

function findNodeIndex(compiled: CompiledCircuit, name: string): number {
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase() && index >= 0) return index;
  }
  throw new InvalidCircuitError(`.tf output node '${name}' does not exist`);
}

function nodeVoltage(solution: Float64Array, index: number): number {
  return index < 0 ? 0 : solution[index];
}
