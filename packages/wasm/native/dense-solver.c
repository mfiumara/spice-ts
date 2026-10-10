/*
 * Deterministic bounded dense f64 Gaussian elimination kernel.
 * No imports, WASI, allocation, threads, SIMD, clock, or randomness.
 */

#define MAX_ORDER 64
#define FINITE_MAX 1.7976931348623157e308

static double magnitude(double value) {
  return value < 0 ? -value : value;
}

static int finite(double value) {
  return value == value && magnitude(value) <= FINITE_MAX;
}

__attribute__((export_name("abi_version")))
int abi_version(void) {
  return 1;
}

__attribute__((export_name("max_order")))
int max_order(void) {
  return MAX_ORDER;
}

__attribute__((export_name("solve_f64")))
int solve_f64(int order, double *matrix, double *rhs) {
  if (order < 1 || order > MAX_ORDER || matrix == 0 || rhs == 0) return 3;

  for (int index = 0; index < order * order; index++) {
    if (!finite(matrix[index])) return 2;
  }
  for (int index = 0; index < order; index++) {
    if (!finite(rhs[index])) return 2;
  }

  for (int column = 0; column < order; column++) {
    int pivot = column;
    double largest = magnitude(matrix[column * order + column]);
    for (int row = column + 1; row < order; row++) {
      double candidate = magnitude(matrix[row * order + column]);
      if (candidate > largest) {
        largest = candidate;
        pivot = row;
      }
    }
    if (!(largest > 0)) return 1;

    if (pivot != column) {
      for (int entry = column; entry < order; entry++) {
        double temporary = matrix[column * order + entry];
        matrix[column * order + entry] = matrix[pivot * order + entry];
        matrix[pivot * order + entry] = temporary;
      }
      double temporary = rhs[column];
      rhs[column] = rhs[pivot];
      rhs[pivot] = temporary;
    }

    for (int row = column + 1; row < order; row++) {
      double factor = matrix[row * order + column] / matrix[column * order + column];
      if (!finite(factor)) return 2;
      matrix[row * order + column] = 0;
      for (int entry = column + 1; entry < order; entry++) {
        matrix[row * order + entry] -= factor * matrix[column * order + entry];
        if (!finite(matrix[row * order + entry])) return 2;
      }
      rhs[row] -= factor * rhs[column];
      if (!finite(rhs[row])) return 2;
    }
  }

  for (int row = order - 1; row >= 0; row--) {
    double value = rhs[row];
    for (int column = row + 1; column < order; column++) {
      value -= matrix[row * order + column] * rhs[column];
    }
    rhs[row] = value / matrix[row * order + row];
    if (!finite(rhs[row])) return 2;
  }
  return 0;
}
