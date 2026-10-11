import { describe, expect, it } from 'vitest';
import {
  deflateZeroEigenvalues,
  multiply,
  rangeFactor,
  rankTolerance,
  realEigenvalues,
  type EigenValue,
} from './real-eigen.js';

/** Block-diagonal matrix: real values as 1×1 blocks, complex pairs as [[a, b], [-b, a]]. */
function blockDiagonal(values: readonly EigenValue[]): number[][] {
  const size = values.length;
  const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let index = 0; index < size; index++) {
    const value = values[index];
    if (value.imaginary === 0) {
      matrix[index][index] = value.real;
    } else {
      matrix[index][index] = value.real;
      matrix[index + 1][index + 1] = value.real;
      matrix[index][index + 1] = value.imaginary;
      matrix[index + 1][index] = -value.imaginary;
      index++;
    }
  }
  return matrix;
}

/** Deterministic non-orthogonal similarity S·D·S⁻¹ with S unit upper triangular. */
function similar(diagonal: number[][], seed = 1): number[][] {
  const size = diagonal.length;
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
  const s = Array.from({ length: size }, (_, row) => Array.from(
    { length: size },
    (_unused, column) => (column === row ? 1 : column > row ? random() : 0),
  ));
  const inverse: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let row = size - 1; row >= 0; row--) {
    for (let column = 0; column < size; column++) {
      let value = row === column ? 1 : 0;
      for (let inner = row + 1; inner < size; inner++) value -= s[row][inner] * inverse[inner][column];
      inverse[row][column] = value;
    }
  }
  return multiply(multiply(s, diagonal), inverse);
}

function sortValues(values: readonly EigenValue[]): EigenValue[] {
  return [...values].sort((a, b) =>
    Math.hypot(a.real, a.imaginary) - Math.hypot(b.real, b.imaginary) || b.imaginary - a.imaginary);
}

function expectValuesNear(actual: readonly EigenValue[], expected: readonly EigenValue[], tolerance: number): void {
  expect(actual).toHaveLength(expected.length);
  const sortedActual = sortValues(actual);
  sortValues(expected).forEach((value, index) => {
    const distance = Math.hypot(sortedActual[index].real - value.real, sortedActual[index].imaginary - value.imaginary);
    expect(distance / Math.hypot(value.real, value.imaginary)).toBeLessThan(tolerance);
  });
}

describe('realEigenvalues', () => {
  it('returns real and complex-conjugate eigenvalues of a non-normal matrix', () => {
    const expected = [
      { real: -3, imaginary: 0 },
      { real: -1, imaginary: 2 },
      { real: -1, imaginary: -2 },
      { real: 0.5, imaginary: 0 },
      { real: 7, imaginary: 0 },
    ];
    const values = realEigenvalues(similar(blockDiagonal(expected)));
    expectValuesNear(values, expected, 1e-12);
    const pair = values.filter(value => value.imaginary !== 0);
    expect(pair).toHaveLength(2);
    expect(pair[0].real).toBe(pair[1].real);
    expect(pair[0].imaginary).toBe(-pair[1].imaginary);
  });

  it('resolves eigenvalues spread over eight decades to full relative precision', () => {
    // Mirrors the VBIC CEamp time constants (1/|pole|) that the trace/Laguerre path lost.
    const poles = [-1.861979e4, -1.054838e9, -5.920059e10, -5.422208e11, -1.169140e12];
    const expected = [
      ...poles.map(pole => ({ real: -1 / pole, imaginary: 0 })),
      { real: -7.246192e10, imaginary: 4.728303e10 },
    ];
    const pair = expected.pop()!;
    const magnitudeSquared = pair.real ** 2 + pair.imaginary ** 2;
    const inverse = { real: -pair.real / magnitudeSquared, imaginary: pair.imaginary / magnitudeSquared };
    expected.push(inverse, { real: inverse.real, imaginary: -inverse.imaginary });
    expectValuesNear(realEigenvalues(similar(blockDiagonal(expected), 7)), expected, 1e-9);
  });

  it('handles 1×1, empty and already-triangular inputs', () => {
    expect(realEigenvalues([])).toEqual([]);
    expect(realEigenvalues([[4]])).toEqual([{ real: 4, imaginary: 0 }]);
    expectValuesNear(realEigenvalues([[1, 2, 3], [0, 4, 5], [0, 0, 6]]), [
      { real: 1, imaginary: 0 }, { real: 4, imaginary: 0 }, { real: 6, imaginary: 0 },
    ], 1e-14);
  });

  it('rejects non-square and non-finite input', () => {
    expect(() => realEigenvalues([[1, 2]])).toThrow('square');
    expect(() => realEigenvalues([[Number.NaN]])).toThrow('finite');
  });
});

describe('rangeFactor', () => {
  it('reconstructs a rank-deficient matrix from an orthonormal basis', () => {
    const matrix = [[1, 2, 3], [2, 4, 6], [1, 0, 1]];
    const factor = rangeFactor(matrix, rankTolerance(matrix));
    expect(factor.rank).toBe(2);
    const product = multiply(factor.basis, factor.coefficients);
    matrix.forEach((row, rowIndex) => row.forEach((value, column) =>
      expect(Math.abs(product[rowIndex][column] - value)).toBeLessThan(1e-14)));
  });
});

describe('deflateZeroEigenvalues', () => {
  it('removes a zero Jordan chain without perturbing the nonzero eigenvalues', () => {
    // diag(J2(0), 0, -2, 5e-9) under a non-orthogonal similarity: a magnitude cut on
    // the raw eigenvalues would confuse the sqrt(eps) splitting of J2(0) with 5e-9.
    const matrix = [
      [0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, -2, 0],
      [0, 0, 0, 0, 5e-9],
    ];
    const { matrix: reduced, removed } = deflateZeroEigenvalues(similar(matrix, 3));
    expect(removed).toBe(3);
    expectValuesNear(realEigenvalues(reduced), [
      { real: -2, imaginary: 0 },
      { real: 5e-9, imaginary: 0 },
    ], 1e-9);
  });
});
