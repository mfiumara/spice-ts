import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { toCsc, updateCscValues, type ScatterMap, type CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
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

  const solver = createSparseSolver();
  let csc: CscMatrix | null = null;
  let scatter: ScatterMap | null = null;
  let patternAnalyzed = false;
  let prevNnz = -1;

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Build combined 2n×2n real matrix:
    // [ G   -omega*C ]
    // [ omega*C   G  ]
    const N = 2 * systemSize;
    const combined = new SparseMatrix(N);

    for (let i = 0; i < systemSize; i++) {
      for (const [j, val] of G.getRow(i)) {
        combined.add(i, j, val);
        combined.add(i + systemSize, j + systemSize, val);
      }
    }
    for (let i = 0; i < systemSize; i++) {
      const row = C.getRow(i);
      for (const [j, cval] of row) {
        combined.add(i, j + systemSize, -omega * cval);
        combined.add(i + systemSize, j, omega * cval);
      }
    }

    if (!patternAnalyzed) {
      const result = toCsc(combined);
      csc = result.csc;
      scatter = result.scatter;
      prevNnz = csc.values.length;
      solver.analyzePattern(csc);
      patternAnalyzed = true;
    } else {
      const result = toCsc(combined);
      const nnz = result.csc.values.length;
      if (nnz !== prevNnz) {
        csc = result.csc;
        scatter = result.scatter;
        prevNnz = nnz;
        solver.analyzePattern(csc);
      } else {
        updateCscValues(csc!, combined, scatter!);
      }
    }

    // RHS from excitation
    const b = new Float64Array(N);
    if (excitationRow >= 0) {
      const phaseRad = (excitationPhase * Math.PI) / 180;
      b[excitationRow] = excitationMag * Math.cos(phaseRad);
      b[excitationRow + systemSize] = excitationMag * Math.sin(phaseRad);
    }

    solver.factorize(csc!);
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
