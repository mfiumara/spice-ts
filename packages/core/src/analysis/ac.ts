import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { toCsc } from '../solver/csc-matrix.js';
import { ComplexSparseSolver } from '../solver/complex-sparse-solver.js';
import { ACResult } from '../results.js';

export interface ComplexACRHS {
  real: Float64Array;
  imaginary: Float64Array;
}

/** Assemble every declared AC source in deterministic compiled-device order. */
export function buildACRHS(compiled: CompiledCircuit): ComplexACRHS {
  const { devices, nodeCount, branchCount } = compiled;
  const real = new Float64Array(nodeCount + branchCount);
  const imaginary = new Float64Array(nodeCount + branchCount);

  for (const device of devices) {
    const contribution = device.getACExcitation?.();
    if (!contribution) continue;

    const phase = (contribution.phase * Math.PI) / 180;
    const re = contribution.magnitude * Math.cos(phase);
    const im = contribution.magnitude * Math.sin(phase);
    if (contribution.kind === 'branch') {
      const row = nodeCount + contribution.branch;
      real[row] += re;
      imaginary[row] += im;
      continue;
    }

    if (contribution.positiveNode >= 0) {
      real[contribution.positiveNode] -= re;
      imaginary[contribution.positiveNode] -= im;
    }
    if (contribution.negativeNode >= 0) {
      real[contribution.negativeNode] += re;
      imaginary[contribution.negativeNode] += im;
    }
  }

  return { real, imaginary };
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

  // Add GMIN to diagonal for numerical stability (same as DC/transient paths)
  for (let i = 0; i < nodeCount; i++) {
    assembler.G.add(i, i, options.gmin ?? 1e-12);
  }

  const G = assembler.G;
  const C = assembler.C;


  // Generate frequency points
  const frequencies = generateFrequencies(analysis);

  // Sweep frequencies
  const voltageArrays = new Map<string, { magnitude: number; phase: number }[]>();
  const currentArrays = new Map<string, { magnitude: number; phase: number }[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  // Build n*n CSC for G and C
  const { csc: gCsc } = toCsc(G);
  const { csc: cCsc } = toCsc(C);

  // Complex sparse solver: analyze pattern once, factorize per frequency
  const solver = new ComplexSparseSolver();
  solver.analyzePattern(
    gCsc,
    cCsc,
    createMatrixVariableIdentities(nodeNames, branchNames),
  );

  // Pre-compute RHS (constant across frequencies)
  const { real: bReal, imaginary: bImag } = buildACRHS(compiled);

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    solver.factorize(gCsc, cCsc, omega);
    const [xReal, xImag] = solver.solve(bReal, bImag);

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
