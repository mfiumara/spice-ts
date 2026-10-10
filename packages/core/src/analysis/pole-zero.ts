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

  let timeConstantMatrix: number[][];
  try {
    timeConstantMatrix = solveMatrix(conductance, storage);
  } catch {
    throw new InvalidCircuitError('.pz requires a nonsingular DC small-signal matrix');
  }

  const timeScale = spectralScale(timeConstantMatrix, dynamicOrder);
  if (dynamicOrder === 0 || timeScale === 0) {
    return new PoleZeroResult(
      analysis.inputPositive,
      analysis.inputNegative,
      analysis.outputPositive,
      analysis.outputNegative,
      [],
      [],
    );
  }

  const normalized = timeConstantMatrix.map(row => row.map(value => value / timeScale));
  const denominator = determinantPolynomial(normalized, dynamicOrder);
  const input = new Float64Array(compiled.nodeCount + compiled.branchCount);
  if (inputPositive >= 0) input[inputPositive] -= 1;
  if (inputNegative >= 0) input[inputNegative] += 1;
  const output = new Float64Array(input.length);
  if (outputPositive >= 0) output[outputPositive] += 1;
  if (outputNegative >= 0) output[outputNegative] -= 1;

  // For voltage input ngspice finds the roots of V(input)/I(input).
  // Those roots are the denominator roots of V(output)/V(input), without
  // cancelling roots shared with the output numerator.
  let polePolynomial = denominator;
  if (analysis.inputType === 'vol') {
    const inputVoltage = new Float64Array(input.length);
    inputVoltage[inputPositive] = 1;
    polePolynomial = transferNumerator(
      conductance,
      storage,
      input,
      inputVoltage,
      denominator,
      timeScale,
    );
  }
  const poleRoots = polynomialRoots([...polePolynomial].reverse());
  const poles = orderedValues(
    poleRoots.map(root => divideComplexByReal(root, timeScale)),
  );

  let zeros: PoleZeroValue[] = [];
  if (analysis.mode === 'pz') {
    const numerator = transferNumerator(
      conductance,
      storage,
      input,
      output,
      denominator,
      timeScale,
    );
    const zeroRoots = polynomialRoots([...numerator].reverse());
    zeros = orderedValues(
      zeroRoots.map(root => divideComplexByReal(root, timeScale)),
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

function solveMatrix(matrix: number[][], right: number[][]): number[][] {
  const size = matrix.length;
  const result = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  for (let column = 0; column < size; column++) {
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

function spectralScale(matrix: number[][], degree: number): number {
  let power = identity(matrix.length);
  let scale = 0;
  for (let exponent = 1; exponent <= degree; exponent++) {
    power = multiplyMatrices(power, matrix);
    const trace = Math.abs(power.reduce((sum, row, index) => sum + row[index], 0));
    if (trace > 0) scale = Math.max(scale, Math.pow(trace, 1 / exponent));
  }
  return scale;
}

/** Coefficients, ascending in y, of det(I + y * matrix). */
function determinantPolynomial(matrix: number[][], degree: number): number[] {
  const coefficients = [1];
  let power = identity(matrix.length);
  const traces = [0];
  for (let exponent = 1; exponent <= degree; exponent++) {
    power = multiplyMatrices(power, matrix);
    traces.push(power.reduce((sum, row, index) => sum + row[index], 0));
    let coefficient = 0;
    for (let index = 1; index <= exponent; index++) {
      coefficient += (index % 2 === 1 ? 1 : -1)
        * coefficients[exponent - index]
        * traces[index];
    }
    coefficients.push(coefficient / exponent);
  }
  return coefficients;
}

function identity(size: number): number[][] {
  return Array.from(
    { length: size },
    (_, row) => Array.from({ length: size }, (_unused, column) => row === column ? 1 : 0),
  );
}

function multiplyMatrices(left: number[][], right: number[][]): number[][] {
  const size = left.length;
  const product = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  for (let row = 0; row < size; row++) {
    for (let inner = 0; inner < size; inner++) {
      if (left[row][inner] === 0) continue;
      for (let column = 0; column < size; column++) {
        product[row][column] += left[row][inner] * right[inner][column];
      }
    }
  }
  return product;
}

function transferNumerator(
  conductance: number[][],
  storage: number[][],
  input: Float64Array,
  output: Float64Array,
  denominator: number[],
  timeScale: number,
): number[] {
  const sampleCount = denominator.length;
  const radius = 0.61;
  const phaseOffset = Math.PI / sampleCount;
  const samples: Complex[] = [];

  for (let sample = 0; sample < sampleCount; sample++) {
    const angle = phaseOffset + 2 * Math.PI * sample / sampleCount;
    const y = fromPolar(radius, angle);
    const s = divideComplexByReal(y, timeScale);
    const system = conductance.map((row, rowIndex) => row.map((value, column) => add(
      { real: value, imaginary: 0 },
      multiply(s, { real: storage[rowIndex][column], imaginary: 0 }),
    )));
    const response = solveComplex(system, [...input].map(value => ({ real: value, imaginary: 0 })));
    let transfer = { real: 0, imaginary: 0 };
    for (let index = 0; index < output.length; index++) {
      transfer = add(transfer, scaleComplex(response[index], output[index]));
    }
    samples.push(multiply(transfer, evaluateRealPolynomial(denominator, y)));
  }

  const coefficients: number[] = [];
  for (let degree = 0; degree < sampleCount; degree++) {
    let value = { real: 0, imaginary: 0 };
    for (let sample = 0; sample < sampleCount; sample++) {
      const angle = phaseOffset + 2 * Math.PI * sample / sampleCount;
      value = add(value, multiply(samples[sample], fromPolar(1, -degree * angle)));
    }
    coefficients.push(value.real / sampleCount / Math.pow(radius, degree));
  }

  const maximum = Math.max(...coefficients.map(Math.abs), 0);
  if (maximum === 0) throw new InvalidCircuitError('.pz transfer is identically zero');
  while (coefficients.length > 1
    && Math.abs(coefficients[coefficients.length - 1]) <= maximum * 1e-10) {
    coefficients.pop();
  }
  for (let index = 0; index < coefficients.length; index++) {
    if (Math.abs(coefficients[index]) <= maximum * 1e-12) coefficients[index] = 0;
  }
  return coefficients;
}

function solveComplex(matrix: Complex[][], rhs: Complex[]): Complex[] {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row.map(value => ({ ...value })), { ...rhs[index] }]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (magnitude(augmented[row][column]) > magnitude(augmented[pivot][column])) pivot = row;
    }
    if (magnitude(augmented[pivot][column]) <= Number.EPSILON) {
      throw new InvalidCircuitError('.pz encountered a singular interpolation point');
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    for (let row = column + 1; row < size; row++) {
      const factor = divide(augmented[row][column], augmented[column][column]);
      for (let index = column; index <= size; index++) {
        augmented[row][index] = subtract(
          augmented[row][index],
          multiply(factor, augmented[column][index]),
        );
      }
    }
  }
  const solution = Array.from({ length: size }, () => ({ real: 0, imaginary: 0 }));
  for (let row = size - 1; row >= 0; row--) {
    let value = augmented[row][size];
    for (let column = row + 1; column < size; column++) {
      value = subtract(value, multiply(augmented[row][column], solution[column]));
    }
    solution[row] = divide(value, augmented[row][row]);
  }
  return solution;
}

/** Roots of a polynomial whose coefficients are ordered from highest degree to constant. */
function polynomialRoots(input: number[]): Complex[] {
  let realCoefficients = [...input];
  const maximum = Math.max(...realCoefficients.map(Math.abs), 0);
  while (realCoefficients.length > 1 && Math.abs(realCoefficients[0]) <= maximum * 1e-12) {
    realCoefficients.shift();
  }
  const degree = realCoefficients.length - 1;
  if (degree <= 0) return [];

  const leading = realCoefficients[0];
  const original = realCoefficients.map(value => ({ real: value / leading, imaginary: 0 }));
  let deflated = original.map(value => ({ ...value }));
  const roots: Complex[] = [];

  for (let order = degree; order >= 1; order--) {
    let root: Complex | null = null;
    for (let attempt = 0; attempt < 12 && root === null; attempt++) {
      let candidate = fromPolar(
        attempt === 0 ? 0 : 1 + attempt / 3,
        2 * Math.PI * (attempt + 0.37) / 12,
      );
      for (let iteration = 0; iteration < 200; iteration++) {
        const { value, first, second } = polynomialDerivatives(deflated, candidate);
        if (magnitude(value) <= 1e-13) {
          root = candidate;
          break;
        }
        const g = divide(first, value);
        const h = subtract(multiply(g, g), divide(second, value));
        const radical = squareRoot(scaleComplex(
          subtract(scaleComplex(h, order), multiply(g, g)),
          order - 1,
        ));
        const plus = add(g, radical);
        const minus = subtract(g, radical);
        const denominator = magnitude(plus) >= magnitude(minus) ? plus : minus;
        if (magnitude(denominator) === 0) break;
        const delta = divide({ real: order, imaginary: 0 }, denominator);
        candidate = subtract(candidate, delta);
        if (magnitude(delta) <= 1e-12 * Math.max(1, magnitude(candidate))) {
          root = candidate;
          break;
        }
      }
    }
    if (root === null) {
      throw new InvalidCircuitError('.pz polynomial root iteration did not converge');
    }
    if (Math.abs(root.imaginary) <= 1e-10 * Math.max(1, Math.abs(root.real))) {
      root = { real: root.real, imaginary: 0 };
    }
    roots.push(root);
    deflated = syntheticDeflate(deflated, root);
  }

  return roots.map(root => newtonPolish(original, root));
}

function polynomialDerivatives(
  coefficients: Complex[],
  value: Complex,
): { value: Complex; first: Complex; second: Complex } {
  let polynomial = coefficients[0];
  let first = { real: 0, imaginary: 0 };
  let second = { real: 0, imaginary: 0 };
  for (let index = 1; index < coefficients.length; index++) {
    second = add(multiply(second, value), scaleComplex(first, 2));
    first = add(multiply(first, value), polynomial);
    polynomial = add(multiply(polynomial, value), coefficients[index]);
  }
  return { value: polynomial, first, second };
}

function syntheticDeflate(coefficients: Complex[], root: Complex): Complex[] {
  const result = [{ ...coefficients[0] }];
  for (let index = 1; index < coefficients.length - 1; index++) {
    result.push(add(coefficients[index], multiply(root, result[index - 1])));
  }
  return result;
}

function newtonPolish(coefficients: Complex[], initial: Complex): Complex {
  let root = initial;
  for (let iteration = 0; iteration < 20; iteration++) {
    const { value, first } = polynomialDerivatives(coefficients, root);
    if (magnitude(first) === 0) break;
    const delta = divide(value, first);
    root = subtract(root, delta);
    if (magnitude(delta) <= 1e-13 * Math.max(1, magnitude(root))) break;
  }
  return root;
}

function orderedValues(values: Complex[], zeroScale = maximumMagnitude(values)): PoleZeroValue[] {
  const threshold = Math.max(zeroScale, 1) * 1e-12;
  return values
    .map(value => ({
      real: Math.abs(value.real) <= threshold ? 0 : value.real,
      imaginary: Math.abs(value.imaginary) <= threshold ? 0 : value.imaginary,
    }))
    .sort((left, right) => left.real - right.real || left.imaginary - right.imaginary);
}

function maximumMagnitude(values: readonly Complex[]): number {
  return Math.max(...values.map(magnitude), 0);
}

function evaluateRealPolynomial(coefficients: number[], value: Complex): Complex {
  let result = { real: 0, imaginary: 0 };
  for (let index = coefficients.length - 1; index >= 0; index--) {
    result = add(multiply(result, value), { real: coefficients[index], imaginary: 0 });
  }
  return result;
}

function add(left: Complex, right: Complex): Complex {
  return { real: left.real + right.real, imaginary: left.imaginary + right.imaginary };
}

function subtract(left: Complex, right: Complex): Complex {
  return { real: left.real - right.real, imaginary: left.imaginary - right.imaginary };
}

function multiply(left: Complex, right: Complex): Complex {
  return {
    real: left.real * right.real - left.imaginary * right.imaginary,
    imaginary: left.real * right.imaginary + left.imaginary * right.real,
  };
}

function divide(left: Complex, right: Complex): Complex {
  const denominator = right.real * right.real + right.imaginary * right.imaginary;
  return {
    real: (left.real * right.real + left.imaginary * right.imaginary) / denominator,
    imaginary: (left.imaginary * right.real - left.real * right.imaginary) / denominator,
  };
}

function scaleComplex(value: Complex, factor: number): Complex {
  return { real: value.real * factor, imaginary: value.imaginary * factor };
}

function divideComplexByReal(value: Complex, divisor: number): Complex {
  return { real: value.real / divisor, imaginary: value.imaginary / divisor };
}

function magnitude(value: Complex): number {
  return Math.hypot(value.real, value.imaginary);
}

function squareRoot(value: Complex): Complex {
  const absolute = magnitude(value);
  const real = Math.sqrt(Math.max(0, (absolute + value.real) / 2));
  const imaginaryMagnitude = Math.sqrt(Math.max(0, (absolute - value.real) / 2));
  const imaginary = value.imaginary < 0 ? -imaginaryMagnitude : imaginaryMagnitude;
  return { real, imaginary };
}

function fromPolar(radius: number, angle: number): Complex {
  return { real: radius * Math.cos(angle), imaginary: radius * Math.sin(angle) };
}
