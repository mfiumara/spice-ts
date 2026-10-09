import type { CompiledCircuit } from '../circuit.js';
import { CurrentSource } from '../devices/current-source.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { InvalidCircuitError } from '../errors.js';
import { MNAAssembler } from '../mna/assembler.js';
import { TransferFunctionResult } from '../results.js';
import { solveLU } from '../solver/lu-solver.js';
import type { ResolvedOptions, TransferFunctionAnalysis } from '../types.js';

/** Solve the bounded single-node voltage-output form of ngspice `.tf`. */
export function solveTransferFunction(
  compiled: CompiledCircuit,
  analysis: TransferFunctionAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): TransferFunctionResult {
  const outputIndex = findNodeIndex(compiled, analysis.outputNode);
  const inputSource = compiled.devices.find(device =>
    (device instanceof VoltageSource || device instanceof CurrentSource)
      && device.name.toLowerCase() === analysis.inputSource.toLowerCase(),
  );
  if (!(inputSource instanceof VoltageSource || inputSource instanceof CurrentSource)) {
    throw new InvalidCircuitError(
      `.tf input source '${analysis.inputSource}' is not an independent voltage or current source`,
    );
  }

  const assembler = buildLinearizedSystem(compiled, options, dcSolution);
  const inputRhs = new Float64Array(assembler.systemSize);
  let inputResistance: number;

  if (inputSource instanceof VoltageSource) {
    inputRhs[compiled.nodeCount + inputSource.branchIndex] = 1;
    const response = solveLU(assembler.G, inputRhs);
    const inputCurrent = response[compiled.nodeCount + inputSource.branchIndex];
    inputResistance = -1 / inputCurrent;
    return resultWithOutputResistance(
      analysis, assembler, outputIndex, response[outputIndex], inputResistance,
    );
  }

  const [positive, negative] = inputSource.nodes;
  // SPICE current-source current flows from its positive to negative terminal.
  if (positive >= 0) inputRhs[positive] -= 1;
  if (negative >= 0) inputRhs[negative] += 1;
  const response = solveLU(assembler.G, inputRhs);
  inputResistance = nodeVoltage(response, negative) - nodeVoltage(response, positive);
  return resultWithOutputResistance(
    analysis, assembler, outputIndex, response[outputIndex], inputResistance,
  );
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
  outputIndex: number,
  transfer: number,
  inputResistance: number,
): TransferFunctionResult {
  const outputRhs = new Float64Array(assembler.systemSize);
  outputRhs[outputIndex] = 1;
  const outputResponse = solveLU(assembler.G, outputRhs);

  return new TransferFunctionResult(
    analysis.outputNode,
    analysis.inputSource,
    transfer,
    inputResistance,
    outputResponse[outputIndex],
  );
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
