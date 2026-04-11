import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { toCsc, type CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { ACResult } from '../results.js';

interface GMapping {
  value: number;
  topLeftIdx: number;
  botRightIdx: number;
}

interface CMapping {
  value: number;
  topRightIdx: number;
  botLeftIdx: number;
}

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

  // Build the combined 2n×2n CSC structure ONCE from G and C patterns.
  // Use omega=1 as a representative to establish the full sparsity pattern.
  const N = 2 * systemSize;
  const pattern = new SparseMatrix(N);

  for (let i = 0; i < systemSize; i++) {
    for (const [j, val] of G.getRow(i)) {
      pattern.add(i, j, val);
      pattern.add(i + systemSize, j + systemSize, val);
    }
  }
  for (let i = 0; i < systemSize; i++) {
    for (const [j, cval] of C.getRow(i)) {
      pattern.add(i, j + systemSize, -cval);
      pattern.add(i + systemSize, j, cval);
    }
  }

  const { csc: combinedCsc, scatter } = toCsc(pattern);

  // Build index arrays mapping G and C entries to combined CSC positions.
  const gMappings: GMapping[] = [];
  for (let i = 0; i < systemSize; i++) {
    for (const [j, val] of G.getRow(i)) {
      const topLeftIdx = scatter.get(i * N + j)!;
      const botRightIdx = scatter.get((i + systemSize) * N + (j + systemSize))!;
      gMappings.push({ value: val, topLeftIdx, botRightIdx });
    }
  }

  const cMappings: CMapping[] = [];
  for (let i = 0; i < systemSize; i++) {
    for (const [j, cval] of C.getRow(i)) {
      const topRightIdx = scatter.get(i * N + (j + systemSize))!;
      const botLeftIdx = scatter.get((i + systemSize) * N + j)!;
      cMappings.push({ value: cval, topRightIdx, botLeftIdx });
    }
  }

  const solver = createSparseSolver();
  solver.analyzePattern(combinedCsc);

  // Pre-compute RHS (constant across frequencies)
  const b = new Float64Array(N);
  if (excitationRow >= 0) {
    const phaseRad = (excitationPhase * Math.PI) / 180;
    b[excitationRow] = excitationMag * Math.cos(phaseRad);
    b[excitationRow + systemSize] = excitationMag * Math.sin(phaseRad);
  }

  const vals = combinedCsc.values as Float64Array;

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Fill combined CSC values via pre-built index arrays (O(nnz), no Map iteration)
    vals.fill(0);
    for (const e of gMappings) {
      vals[e.topLeftIdx] = e.value;
      vals[e.botRightIdx] = e.value;
    }
    for (const e of cMappings) {
      vals[e.topRightIdx] = -omega * e.value;
      vals[e.botLeftIdx] = omega * e.value;
    }

    solver.factorize(combinedCsc);
    const x = solver.solve(b);
    const xReal = x.slice(0, systemSize);
    const xImag = x.slice(systemSize);

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
