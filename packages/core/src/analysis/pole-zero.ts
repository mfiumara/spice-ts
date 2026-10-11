import type { CompiledCircuit } from '../circuit.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';
import { Resistor } from '../devices/resistor.js';
import { InvalidCircuitError } from '../errors.js';
import { MNAAssembler } from '../mna/assembler.js';
import { PoleZeroResult, type PoleZeroValue } from '../results.js';
import type {
  ConvergenceTelemetry,
  PoleZeroAnalysis,
  ResolvedOptions,
} from '../types.js';
import { solveDCOperatingPoint } from './dc.js';
import {
  deflateZeroEigenvalues,
  EigenConvergenceError,
  equilibratedRangeFactor,
  irreducibleBlocks,
  multiply,
  realEigenvalues,
} from './real-eigen.js';

interface Complex {
  real: number;
  imaginary: number;
}

const MAX_DYNAMIC_ORDER = 12;

/** Solve the bounded grounded-reference ngspice `.pz` forms. */
export function solvePoleZero(
  compiled: CompiledCircuit,
  analysis: PoleZeroAnalysis,
  options: ResolvedOptions,
  convergence?: ConvergenceTelemetry,
): PoleZeroResult {
  const inputPositive = nodeIndex(compiled, analysis.inputPositive, 'input');
  const inputNegative = nodeIndex(compiled, analysis.inputNegative, 'input');
  const outputPositive = nodeIndex(compiled, analysis.outputPositive, 'output');
  const outputNegative = nodeIndex(compiled, analysis.outputNegative, 'output');
  if (analysis.inputType === 'vol') assertVoltageInputDevicesSupported(compiled);

  const dcSolution = solveDCOperatingPoint(
    compiled,
    options,
    undefined,
    convergence,
  ).assembler.solution;
  const assembler = buildLinearizedSystem(compiled, options, dcSolution);
  const conductance = sparseToDense(assembler.G);
  const storage = sparseToDense(assembler.C);
  const dynamicOrder = matrixRank(storage);

  if (dynamicOrder > MAX_DYNAMIC_ORDER) {
    throw new InvalidCircuitError(
      `.pz dynamic order ${dynamicOrder} exceeds bounded limit ${MAX_DYNAMIC_ORDER}`,
    );
  }

  if (dynamicOrder === 0) {
    return new PoleZeroResult(
      analysis.inputPositive,
      analysis.inputNegative,
      analysis.outputPositive,
      analysis.outputNegative,
      [],
      [],
    );
  }

  // Natural frequencies: finite roots of det(G + sC), i.e. s = -1/μ for the
  // nonzero eigenvalues μ of G⁻¹C (shifted when G is singular).
  const naturalRoots = pencilRootsOrThrow(
    conductance,
    storage,
    maximumAbsolute(conductance) / maximumAbsolute(storage),
    '.pz requires a nonsingular DC small-signal matrix',
  );
  if (naturalRoots.length === 0) {
    return new PoleZeroResult(
      analysis.inputPositive,
      analysis.inputNegative,
      analysis.outputPositive,
      analysis.outputNegative,
      [],
      [],
    );
  }
  const shiftScale = geometricMeanMagnitude(naturalRoots);

  const input = new Float64Array(compiled.nodeCount + compiled.branchCount);
  if (inputPositive >= 0) input[inputPositive] -= 1;
  if (inputNegative >= 0) input[inputNegative] += 1;
  const output = new Float64Array(input.length);
  if (outputPositive >= 0) output[outputPositive] += 1;
  if (outputNegative >= 0) output[outputNegative] -= 1;

  // For voltage input ngspice finds the roots of V(input)/I(input).
  // Those roots are the zeros of the driving-point transfer, without
  // cancelling roots shared with the output numerator.
  let poleRoots = naturalRoots;
  if (analysis.inputType === 'vol') {
    const inputVoltage = new Float64Array(input.length);
    inputVoltage[inputPositive] = 1;
    poleRoots = transferZeros(conductance, storage, input, inputVoltage, shiftScale);
  }
  const poles = orderedValues(poleRoots);

  let zeros: PoleZeroValue[] = [];
  if (analysis.mode === 'pz') {
    zeros = orderedValues(
      transferZeros(conductance, storage, input, output, shiftScale),
      maximumMagnitude(poles),
    );
  }

  return new PoleZeroResult(
    analysis.inputPositive,
    analysis.inputNegative,
    analysis.outputPositive,
    analysis.outputNegative,
    poles,
    zeros,
  );
}

function assertVoltageInputDevicesSupported(compiled: CompiledCircuit): void {
  for (const device of compiled.devices) {
    if (
      device instanceof Resistor
      || device instanceof Capacitor
      || device instanceof Inductor
    ) continue;
    throw new InvalidCircuitError(
      `.pz vol supports only ideal R, L, C devices; found ${device.name} (${device.constructor.name})`,
    );
  }
}

function buildLinearizedSystem(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): MNAAssembler {
  const assembler = new MNAAssembler(compiled.nodeCount, compiled.branchCount);
  assembler.solution.set(dcSolution);
  const context = assembler.getStampContext();
  for (const device of compiled.devices) device.stamp(context);
  for (const device of compiled.devices) device.stampDynamic?.(context);
  for (let index = 0; index < compiled.nodeCount; index++) {
    assembler.G.add(index, index, options.gmin);
  }
  return assembler;
}

function nodeIndex(
  compiled: CompiledCircuit,
  name: string,
  terminal: 'input' | 'output',
): number {
  if (name === '0') return -1;
  for (const [nodeName, index] of compiled.nodeIndexMap) {
    if (nodeName.toLowerCase() === name.toLowerCase() && index >= 0) return index;
  }
  throw new InvalidCircuitError(`.pz ${terminal} node '${name}' does not exist`);
}

function sparseToDense(matrix: MNAAssembler['G']): number[][] {
  const dense = Array.from({ length: matrix.size }, () => Array(matrix.size).fill(0) as number[]);
  for (let row = 0; row < matrix.size; row++) {
    for (const [column, value] of matrix.getRow(row)) dense[row][column] = value;
  }
  return dense;
}

/** Solves `matrix · X = right` column by column for an n × k right-hand side. */
function solveColumns(matrix: number[][], right: number[][]): number[][] {
  const size = matrix.length;
  const columns = right[0]?.length ?? 0;
  const result = Array.from({ length: size }, () => Array(columns).fill(0) as number[]);
  for (let column = 0; column < columns; column++) {
    const rhs = right.map(row => row[column]);
    const solution = solveReal(matrix, rhs);
    for (let row = 0; row < size; row++) result[row][column] = solution[row];
  }
  return result;
}

function solveReal(matrix: number[][], rhs: number[]): number[] {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  const scale = Math.max(...matrix.flat().map(Math.abs), 1);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) <= Number.EPSILON * scale * size) {
      throw new Error('singular matrix');
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = column + 1; row < size; row++) {
      const factor = augmented[row][column] / augmented[column][column];
      for (let index = column; index <= size; index++) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  const solution = Array(size).fill(0) as number[];
  for (let row = size - 1; row >= 0; row--) {
    let value = augmented[row][size];
    for (let column = row + 1; column < size; column++) {
      value -= augmented[row][column] * solution[column];
    }
    solution[row] = value / augmented[row][row];
  }
  return solution;
}

function matrixRank(matrix: number[][]): number {
  const work = matrix.map(row => [...row]);
  const size = matrix.length;
  const scale = Math.max(...work.flat().map(Math.abs), 0);
  if (scale === 0) return 0;
  const tolerance = scale * size * Number.EPSILON * 100;
  let rank = 0;
  for (let column = 0; column < size && rank < size; column++) {
    let pivot = rank;
    for (let row = rank + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (Math.abs(work[pivot][column]) <= tolerance) continue;
    [work[rank], work[pivot]] = [work[pivot], work[rank]];
    for (let row = rank + 1; row < size; row++) {
      const factor = work[row][column] / work[rank][column];
      for (let index = column; index < size; index++) {
        work[row][index] -= factor * work[rank][index];
      }
    }
    rank++;
  }
  return rank;
}

/**
 * Zeros of `output · (G + sC)⁻¹ · input`: the finite roots of the bordered pencil
 * `[[G, input], [outputᵀ, 0]] + s [[C, 0], [0, 0]]`, without cancelling roots that
 * are shared with the poles.
 */
function transferZeros(
  conductance: number[][],
  storage: number[][],
  input: Float64Array,
  output: Float64Array,
  shiftScale: number,
): Complex[] {
  const size = conductance.length;
  const borderedConductance = conductance.map((row, index) => [...row, input[index]]);
  borderedConductance.push([...output, 0]);
  const borderedStorage = storage.map(row => [...row, 0]);
  borderedStorage.push(Array(size + 1).fill(0) as number[]);
  return pencilRootsOrThrow(
    borderedConductance,
    borderedStorage,
    shiftScale,
    '.pz transfer is identically zero',
  );
}

class SingularPencilError extends Error {}

function pencilRootsOrThrow(
  conductance: number[][],
  storage: number[][],
  shiftScale: number,
  singularMessage: string,
): Complex[] {
  try {
    return pencilRoots(conductance, storage, shiftScale);
  } catch (error) {
    if (error instanceof SingularPencilError) throw new InvalidCircuitError(singularMessage);
    if (error instanceof EigenConvergenceError) {
      throw new InvalidCircuitError('.pz eigenvalue iteration did not converge');
    }
    throw error;
  }
}

/**
 * Shift factors (multiples of the pencil's frequency scale) tried in order. The
 * unshifted pencil is preferred; the irrational factors only serve to avoid landing
 * on a root when `A` is singular, i.e. when the pencil has a root at s = 0.
 */
const SHIFT_FACTORS = [0, 0.7236067977499789, -1.3819660112501051, 2.23606797749979, -0.4472135954999579];

/**
 * Finite roots s of det(A + sB) for real square A, B.
 *
 * With a shift σ, `M = R (A + σB)⁻¹ Q` where `B = Q R` is a rank-revealing
 * factorization, so M is rank(B) × rank(B) and carries every finite root as an
 * eigenvalue μ = 1/(σ - s). Infinite roots are the zero eigenvalues of M and roots
 * at s = 0 are the zero eigenvalues of `K = I - σM` (eigenvalue κ = s/(s - σ)).
 * Both are removed by rank decisions (`deflateZeroEigenvalues`), so their Jordan
 * chains never leak spurious roots and roots at the origin stay exact.
 */
function pencilRoots(a: number[][], b: number[][], shiftScale: number): Complex[] {
  const range = equilibratedRangeFactor(b);
  if (range.rank === 0) return [];
  const scale = Number.isFinite(shiftScale) && shiftScale > 0 ? shiftScale : 1;

  for (const factor of SHIFT_FACTORS) {
    const shift = factor * scale;
    const shifted = shift === 0
      ? a
      : a.map((row, rowIndex) => row.map((value, column) => value + shift * b[rowIndex][column]));
    let solved: number[][];
    try {
      solved = solveColumns(shifted, range.left);
    } catch {
      continue;
    }
    if (!solved.every(row => row.every(Number.isFinite))) continue;
    const reduced = multiply(range.right, solved);
    const roots: Complex[] = [];
    for (const block of irreducibleBlocks(reduced)) {
      const finite = deflateZeroEigenvalues(
        block.map(row => block.map(column => reduced[row][column])),
      ).matrix;
      if (shift === 0) {
        roots.push(...realEigenvalues(finite).map(negativeReciprocal));
        continue;
      }
      const complement = finite.map((row, rowIndex) => row.map((value, column) =>
        (rowIndex === column ? 1 : 0) - shift * value));
      const { matrix: remaining, removed } = deflateZeroEigenvalues(complement);
      roots.push(...realEigenvalues(remaining).map(kappa => fromComplement(kappa, shift)));
      for (let index = 0; index < removed; index++) roots.push({ real: 0, imaginary: 0 });
    }
    return roots;
  }
  throw new SingularPencilError();
}

/** s = -1/μ. */
function negativeReciprocal(value: Complex): Complex {
  if (value.imaginary === 0) return { real: -1 / value.real, imaginary: 0 };
  const squared = value.real * value.real + value.imaginary * value.imaginary;
  return { real: -value.real / squared, imaginary: value.imaginary / squared };
}

/** s = σκ / (κ - 1), the inverse of κ = s / (s - σ). */
function fromComplement(kappa: Complex, shift: number): Complex {
  const denominatorReal = kappa.real - 1;
  if (kappa.imaginary === 0) return { real: shift * kappa.real / denominatorReal, imaginary: 0 };
  const squared = denominatorReal * denominatorReal + kappa.imaginary * kappa.imaginary;
  return {
    real: shift * (kappa.real * denominatorReal + kappa.imaginary * kappa.imaginary) / squared,
    imaginary: shift * (kappa.imaginary * denominatorReal - kappa.real * kappa.imaginary) / squared,
  };
}

function orderedValues(values: Complex[], zeroScale = maximumMagnitude(values)): PoleZeroValue[] {
  const threshold = Math.max(zeroScale, 1) * 1e-12;
  return values
    .map(value => ({
      real: Math.abs(value.real) <= threshold ? 0 : value.real,
      imaginary: Math.abs(value.imaginary) <= threshold ? 0 : value.imaginary,
    }))
    // ngspice-47 order: ascending real part, positive imaginary part first in a pair.
    .sort((left, right) => left.real - right.real || right.imaginary - left.imaginary);
}

function maximumMagnitude(values: readonly Complex[]): number {
  return Math.max(...values.map(magnitude), 0);
}

function maximumAbsolute(matrix: number[][]): number {
  let maximum = 0;
  for (const row of matrix) for (const value of row) maximum = Math.max(maximum, Math.abs(value));
  return maximum;
}

/** Geometric mean of the nonzero root magnitudes (the shift scale for zeros). */
function geometricMeanMagnitude(values: readonly Complex[]): number {
  const logs = values.map(magnitude).filter(value => value > 0).map(Math.log);
  if (logs.length === 0) return 1;
  return Math.exp(logs.reduce((sum, value) => sum + value, 0) / logs.length);
}

function magnitude(value: Complex): number {
  return Math.hypot(value.real, value.imaginary);
}
