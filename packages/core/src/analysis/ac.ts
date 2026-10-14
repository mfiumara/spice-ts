import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { createMatrixVariableIdentities, MNAAssembler } from '../mna/assembler.js';
import { toCsc, type CscMatrix } from '../solver/csc-matrix.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { ComplexSparseSolver } from '../solver/complex-sparse-solver.js';
import { ACResult } from '../results.js';
import { frequencyGrid } from './frequency-grid.js';
import type { ProtocolExecutionGuard } from '../protocol/execution-guard.js';
import { Diode } from '../devices/diode.js';
import type { DeviceModel, StampContext } from '../devices/device.js';

export interface ComplexACRHS {
  real: Float64Array;
  imaginary: Float64Array;
}

export interface LinearizedFrequencySystem {
  size: number;
  solve(omega: number, rhs: ComplexACRHS): ComplexACRHS;
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

/**
 * A device whose small-signal conductances depend on frequency (ngspice
 * MESAacLoad with DELFO != 0: the output conductance moves from LAMBDA to
 * LAMBDAHF). `stampFrequencyConductance` adds the difference to the
 * frequency-independent stamp at angular frequency `omega`.
 */
interface FrequencyDependentConductance {
  readonly frequencyDependent: boolean;
  stampFrequencyConductance(ctx: StampContext, omega: number): void;
}

function isFrequencyDependent(device: DeviceModel): device is DeviceModel & FrequencyDependentConductance {
  return 'stampFrequencyConductance' in device
    && (device as DeviceModel & FrequencyDependentConductance).frequencyDependent;
}

function samePattern(a: CscMatrix, b: CscMatrix): boolean {
  if (a.rowIdx.length !== b.rowIdx.length) return false;
  for (let i = 0; i < a.colPtr.length; i++) if (a.colPtr[i] !== b.colPtr[i]) return false;
  for (let i = 0; i < a.rowIdx.length; i++) if (a.rowIdx[i] !== b.rowIdx[i]) return false;
  return true;
}

export function createLinearizedFrequencySystem(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  dcSolution: Float64Array,
  mode: 'standard' | 'distortion' = 'standard',
): LinearizedFrequencySystem {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount, { deviceGmin: options.deviceGmin });
  assembler.solution.set(dcSolution);
  const ctx = assembler.getStampContext();
  for (const device of devices) {
    if (mode === 'standard' && device.stampSmallSignal) device.stampSmallSignal(ctx);
    else device.stamp(ctx);
  }
  for (const device of devices) {
    if (mode === 'distortion' && device instanceof Diode) device.stampDistortionDynamic(ctx);
    else device.stampDynamic?.(ctx);
  }
  for (let i = 0; i < nodeCount; i++) {
    assembler.G.add(i, i, options.gmin ?? 1e-12);
  }

  const { csc: gCsc } = toCsc(assembler.G);
  const { csc: cCsc } = toCsc(assembler.C);
  const variables = createMatrixVariableIdentities(nodeNames, branchNames);
  const solver = new ComplexSparseSolver();
  solver.analyzePattern(gCsc, cCsc, variables);
  let analyzedG = gCsc;

  const dispersive = mode === 'standard' ? devices.filter(isFrequencyDependent) : [];
  const conductanceAt = (omega: number): CscMatrix => {
    if (dispersive.length === 0) return gCsc;
    const delta = new MNAAssembler(nodeCount, branchCount, { deviceGmin: options.deviceGmin });
    delta.solution.set(dcSolution);
    const deltaCtx = delta.getStampContext();
    for (const device of dispersive) device.stampFrequencyConductance(deltaCtx, omega);
    const merged = new SparseMatrix(nodeCount + branchCount);
    merged.addMatrix(assembler.G, 1);
    merged.addMatrix(delta.G, 1);
    const { csc } = toCsc(merged);
    if (!samePattern(csc, analyzedG)) {
      solver.analyzePattern(csc, cCsc, variables);
      analyzedG = csc;
    }
    return csc;
  };

  return {
    size: nodeCount + branchCount,
    solve(omega, rhs) {
      solver.factorize(conductanceAt(omega), cCsc, omega);
      const [real, imaginary] = solver.solve(rhs.real, rhs.imaginary);
      return { real, imaginary };
    },
  };
}

export function solveAC(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
  guard?: ProtocolExecutionGuard,
): ACResult {
  const { nodeCount, nodeNames, branchNames } = compiled;
  const system = createLinearizedFrequencySystem(compiled, options, dcSolution);

  // Generate frequency points
  const frequencies = frequencyGrid(analysis, options.reltol, 'ac');

  // Sweep frequencies
  const voltageArrays = new Map<string, { magnitude: number; phase: number }[]>();
  const currentArrays = new Map<string, { magnitude: number; phase: number }[]>();
  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  // Pre-compute RHS (constant across frequencies)
  const rhs = buildACRHS(compiled);

  for (const freq of frequencies) {
    guard?.checkpoint('solve:ac-point');
    guard?.recordResultPoint();
    const omega = 2 * Math.PI * freq;

    const { real: xReal, imaginary: xImag } = system.solve(omega, rhs);

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
