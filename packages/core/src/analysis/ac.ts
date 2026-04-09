import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { solveComplexLU } from '../solver/lu-solver.js';
import { ACResult } from '../results.js';

export function solveAC(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): ACResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const systemSize = nodeCount + branchCount;

  // Build linearized G and C matrices at DC operating point
  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(dcSolution);
  const ctx = assembler.getStampContext();
  for (const device of devices) device.stamp(ctx);
  for (const device of devices) device.stampDynamic?.(ctx);

  const G = assembler.G;
  const C = assembler.C;

  // Find AC excitation source
  let excitationRow = -1;
  let excitationMag = 1;
  let excitationPhase = 0;
  for (const device of devices) {
    const exc = device.getACExcitation?.();
    if (exc) {
      excitationRow = nodeCount + exc.branch;
      excitationMag = exc.magnitude;
      excitationPhase = exc.phase;
      break;
    }
  }

  // Generate frequency points
  const frequencies = generateFrequencies(analysis);

  // Sweep frequencies
  const voltageArrays = new Map<string, { magnitude: number; phase: number }[]>();
  const currentArrays = new Map<string, { magnitude: number; phase: number }[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Build imaginary part: omega * C
    const Yimag = new SparseMatrix(systemSize);
    for (let i = 0; i < systemSize; i++) {
      const row = C.getRow(i);
      for (const [j, cval] of row) {
        Yimag.add(i, j, omega * cval);
      }
    }

    // RHS from excitation
    const bReal = new Float64Array(systemSize);
    const bImag = new Float64Array(systemSize);
    if (excitationRow >= 0) {
      const phaseRad = (excitationPhase * Math.PI) / 180;
      bReal[excitationRow] = excitationMag * Math.cos(phaseRad);
      bImag[excitationRow] = excitationMag * Math.sin(phaseRad);
    }

    const [xReal, xImag] = solveComplexLU(G, Yimag, bReal, bImag);

    // Extract results
    for (let i = 0; i < nodeNames.length; i++) {
      const re = xReal[i], im = xImag[i];
      voltageArrays.get(nodeNames[i])!.push({
        magnitude: Math.sqrt(re * re + im * im),
        phase: (Math.atan2(im, re) * 180) / Math.PI,
      });
    }
    for (let i = 0; i < branchNames.length; i++) {
      const re = xReal[nodeCount + i], im = xImag[nodeCount + i];
      currentArrays.get(branchNames[i])!.push({
        magnitude: Math.sqrt(re * re + im * im),
        phase: (Math.atan2(im, re) * 180) / Math.PI,
      });
    }
  }

  return new ACResult(frequencies, voltageArrays, currentArrays);
}

function generateFrequencies(analysis: ACAnalysis): number[] {
  const { variation, points, startFreq, stopFreq } = analysis;
  const frequencies: number[] = [];
  switch (variation) {
    case 'dec': {
      const decades = Math.log10(stopFreq / startFreq);
      const totalPoints = Math.round(decades * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(10, i / points));
      break;
    }
    case 'oct': {
      const octaves = Math.log2(stopFreq / startFreq);
      const totalPoints = Math.round(octaves * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(2, i / points));
      break;
    }
    case 'lin': {
      const step = (stopFreq - startFreq) / points;
      for (let i = 0; i <= points; i++) frequencies.push(startFreq + i * step);
      break;
    }
  }
  return frequencies;
}
