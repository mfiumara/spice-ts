import type { ResolvedOptions, DCSweepAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCSweepResult } from '../results.js';
import { VoltageSource } from '../devices/voltage-source.js';
import { CurrentSource } from '../devices/current-source.js';
import { InvalidCircuitError } from '../errors.js';

export function solveDCSweep(
  compiled: CompiledCircuit,
  analysis: DCSweepAnalysis,
  options: ResolvedOptions,
): DCSweepResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;

  // Find the sweep source
  const source = devices.find(
    (d): d is VoltageSource | CurrentSource =>
      (d instanceof VoltageSource || d instanceof CurrentSource) && d.name === analysis.source,
  );
  if (!source) {
    throw new InvalidCircuitError(`DC sweep source '${analysis.source}' not found`);
  }

  const originalWaveform = source.waveform;
  const numPoints = Math.round((analysis.stop - analysis.start) / analysis.step) + 1;

  // Pre-allocate result arrays
  const sweepValues = new Float64Array(numPoints);
  const voltageArrays = new Map<string, Float64Array>();
  const currentArrays = new Map<string, Float64Array>();
  for (const name of nodeNames) voltageArrays.set(name, new Float64Array(numPoints));
  for (const name of branchNames) currentArrays.set(name, new Float64Array(numPoints));

  const assembler = new MNAAssembler(nodeCount, branchCount);

  try {
    for (let i = 0; i < numPoints; i++) {
      const sweepValue = analysis.start + i * analysis.step;
      sweepValues[i] = sweepValue;

      source.waveform = { type: 'dc', value: sweepValue };

      newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);

      // Record solution
      for (let n = 0; n < nodeNames.length; n++) {
        voltageArrays.get(nodeNames[n])![i] = assembler.solution[n];
      }
      for (let b = 0; b < branchNames.length; b++) {
        currentArrays.get(branchNames[b])![i] = assembler.solution[nodeCount + b];
      }
    }
  } finally {
    source.waveform = originalWaveform;
  }

  return new DCSweepResult(sweepValues, voltageArrays, currentArrays);
}
