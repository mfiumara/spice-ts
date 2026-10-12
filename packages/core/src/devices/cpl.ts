import { InvalidCircuitError } from '../errors.js';
import { DEVICE_GMIN, type DeviceModel, type StampContext } from './device.js';
import {
  SwecHistory,
  addConductance,
  maxStepAfterDelay,
  swecGmin,
  swecTimePs,
} from './swec-history.js';
import { updateComplexPair } from './txl.js';

/**
 * ngspice-47 CPL (P-element) coupled multiconductor lossy transmission lines.
 *
 * A literal port of ngspice-47 `src/spicelib/devices/cpl` (cplsetup.c and
 * cplload.c, Charles Hough / Shen Lin 1992): the per-unit-length R, L, G, C
 * matrices are diagonalised with Jacobi rotations at eight scaled
 * frequencies, the modal admittance and propagation matrices are fitted
 * with polynomials and third-order Pade approximants, and the resulting
 * poles are convolved recursively with each mode's delayed port history.
 * Numerical quirks of the reference (integer-picosecond history, R clamped
 * to at least 1e-4, the cumulative slope factor in `update_cnv`, the
 * last-mode-wins assignment of delayed matrix entries) are kept on purpose:
 * parity with ngspice is the acceptance criterion.
 */

const MAX_DEG = 8;
const LEFT_DEG = 7;
const JACOBI_TOLERANCE = 1.0e-8;
const JACOBI_ROTATION_LIMIT = 100_000;

/** One three-pole term set (ngspice TMS). */
export interface CplTerms {
  /** ngspice `ifImg`: terms 1 and 2 are the real and imaginary parts of a complex pair. */
  readonly ifImg: boolean;
  readonly aten: number;
  readonly c: Float64Array;
  readonly x: Float64Array;
}

/** Recursive-convolution coefficients computed by ngspice ReadCpL. */
export interface CplCoefficients {
  readonly lines: number;
  /** Modal delays in picoseconds (ngspice `taul`). */
  readonly taul: Float64Array;
  /** Characteristic admittance, index line * lines + line; null where ngspice stores no terms. */
  readonly h1: readonly (CplTerms | null)[];
  /** Modal current propagation, index (row * lines + column) * lines + mode. */
  readonly h2: readonly (CplTerms | null)[];
  /** Modal delayed admittance, index (row * lines + column) * lines + mode. */
  readonly h3: readonly (CplTerms | null)[];
  readonly h1C: Float64Array;
  readonly h2C: Float64Array;
  readonly h3C: Float64Array;
  /** Series-resistance diagonal after ngspice's 1e-4 clamp, for the DC model. */
  readonly dcResistance: Float64Array;
}

/** Full symmetric per-unit-length matrices of a CPL instance. */
export interface CplMatrices {
  readonly R: readonly (readonly number[])[];
  readonly L: readonly (readonly number[])[];
  readonly G: readonly (readonly number[])[];
  readonly C: readonly (readonly number[])[];
}

function cplError(message: string): InvalidCircuitError {
  return new InvalidCircuitError(`CPL: ${message}`);
}

const ABS = (value: number): number => (value >= 0 ? value : -value);
/** ngspice macros.h: `copysign(1.0, a)`. */
const SGN = (value: number): number => (Object.is(value, -0) || value < 0 ? -1 : 1);

function square(dim: number): number[][] {
  return Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
}

interface MultOut {
  readonly poly: Float64Array[];
  readonly c0: number[];
}

/** The static working set of cplsetup.c, owned by one setup run. */
export class CplSetup {
  readonly dim: number;
  readonly R: number[][];
  readonly G: number[][];
  readonly L: number[][];
  readonly C: number[][];
  readonly length: number;
  private ZY: number[][];
  private Sv: number[][];
  private D: number[];
  private Y5: number[][];
  private Y5_1: number[][];
  private Sv_1: number[][];
  private Si: number[][];
  private Si_1: number[][];
  private readonly frequency = new Float64Array(MAX_DEG);
  scalingF = 1;
  private scalingF2 = 1;
  readonly SiSv_1: Float64Array[][];
  readonly Sip: Float64Array[][];
  private readonly Si_1p: Float64Array[][];
  private readonly Sv_1p: Float64Array[][];
  readonly W: Float64Array[];
  readonly TAU: number[];
  readonly IWI: MultOut[][];
  readonly IWV: MultOut[][];
  readonly SIV: { poly: Float64Array | null; c0: number }[][];

  constructor(matrices: CplMatrices, length: number) {
    const dim = matrices.R.length;
    this.dim = dim;
    this.length = length;
    this.R = square(dim);
    this.G = square(dim);
    this.L = square(dim);
    this.C = square(dim);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        this.R[i][j] = matrices.R[i][j];
        this.G[i][j] = matrices.G[i][j];
        this.L[i][j] = matrices.L[i][j];
        this.C[i][j] = matrices.C[i][j];
      }
    }
    this.ZY = square(dim);
    this.Sv = square(dim);
    this.D = new Array<number>(dim).fill(0);
    this.Y5 = square(dim);
    this.Y5_1 = square(dim);
    this.Sv_1 = square(dim);
    this.Si = square(dim);
    this.Si_1 = square(dim);
    const polys = (): Float64Array[][] => Array.from({ length: dim }, () =>
      Array.from({ length: dim }, () => new Float64Array(LEFT_DEG + 1)));
    this.SiSv_1 = polys();
    this.Sip = polys();
    this.Si_1p = polys();
    this.Sv_1p = polys();
    this.W = Array.from({ length: dim }, () => new Float64Array(MAX_DEG));
    this.TAU = new Array<number>(dim).fill(0);
    const multOut = (): MultOut[][] => Array.from({ length: dim }, () =>
      Array.from({ length: dim }, () => ({
        poly: Array.from({ length: dim }, () => new Float64Array(LEFT_DEG + 1)),
        c0: new Array<number>(dim).fill(0),
      })));
    this.IWI = multOut();
    this.IWV = multOut();
    this.SIV = Array.from({ length: dim }, () =>
      Array.from({ length: dim }, () => ({ poly: null, c0: 0 })));
  }

  /** ngspice `coupled`. */
  run(): void {
    const dim = this.dim;
    this.scalingF = 1;
    this.scalingF2 = 1;
    this.loopZY(0);
    this.evalFrequency();
    this.evalSiSi1(0);
    this.storeSiSv1(0);
    this.store(0);
    for (let i = 1; i <= LEFT_DEG; i++) {
      this.loopZY(this.frequency[i]);
      this.evalSiSi1(this.frequency[i]);
      this.storeSiSv1(i);
      this.store(i);
    }
    this.polyMatrix(this.Sip);
    this.polyMatrix(this.Si_1p);
    this.polyMatrix(this.Sv_1p);
    for (let i = 0; i < dim; i++) {
      match(LEFT_DEG, this.W[i], this.frequency, this.W[i]);
      this.TAU[i] = this.approxMode(this.W[i]);
    }
    this.matrixPolyMult(this.Sip, this.Si_1p, this.IWI);
    this.matrixPolyMult(this.Sip, this.Sv_1p, this.IWV);
    this.polyMatrix(this.SiSv_1);
    this.generateOut();
  }

  private polyMatrix(A: Float64Array[][]): void {
    for (let i = 0; i < this.dim; i++) {
      for (let j = 0; j < this.dim; j++) match(LEFT_DEG, A[i][j], this.frequency, A[i][j]);
    }
  }

  /** ngspice `eval_frequency`. */
  private evalFrequency(): void {
    let min = this.D[0];
    for (let i = 1; i < this.dim; i++) if (this.D[i] < min) min = this.D[i];
    if (!(min > 0)) throw cplError('a mode frequency is not positive');
    this.scalingF2 = 1.0 / min;
    this.scalingF = Math.sqrt(this.scalingF2);
    const step = this.length * 8.0;
    this.frequency[0] = 0;
    for (let i = 1; i <= LEFT_DEG; i++) this.frequency[i] = this.frequency[i - 1] + step;
    for (let i = 0; i < this.dim; i++) this.D[i] *= this.scalingF2;
  }

  /** ngspice `loop_ZY`. */
  private loopZY(y: number): void {
    const dim = this.dim;
    const { ZY, C, G, L, R } = this;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) ZY[i][j] = this.scalingF * C[i][j] + G[i][j] * y;
    }
    this.diag();
    let fmin = this.D[0];
    for (let i = 1; i < dim; i++) if (this.D[i] < fmin) fmin = this.D[i];
    if (fmin < 0) {
      throw cplError('the capacitance matrix of the multiconductor system is not positive definite');
    }
    fmin = Math.sqrt(fmin);
    const fmin1 = 1 / fmin;
    for (let i = 0; i < dim; i++) this.D[i] = Math.sqrt(this.D[i]);
    const { Sv, Y5, Y5_1, Sv_1, D } = this;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        Y5[i][j] = D[i] * Sv[j][i];
        Y5_1[i][j] = Sv[j][i] / D[i];
      }
    }
    multiplyInto(Sv_1, Sv, Y5, dim);
    copyInto(Y5, Sv_1, dim);
    multiplyInto(Sv_1, Sv, Y5_1, dim);
    copyInto(Y5_1, Sv_1, dim);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let sum = 0;
        for (let k = 0; k < dim; k++) sum += (this.scalingF * L[i][k] + R[i][k] * y) * Y5[k][j];
        ZY[i][j] = sum;
      }
    }
    multiplyInto(Sv_1, Y5, ZY, dim);
    copyInto(ZY, Sv_1, dim);

    this.diag();

    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let sum = 0;
        for (let k = 0; k < dim; k++) sum += Sv[k][i] * Y5[k][j];
        Sv_1[i][j] = sum * fmin1;
      }
    }
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let sum = 0;
        for (let k = 0; k < dim; k++) sum += Y5_1[i][k] * Sv[k][j];
        ZY[i][j] = sum * fmin;
      }
    }
    copyInto(Sv, ZY, dim);
  }

  /** ngspice `eval_Si_Si_1`. */
  private evalSiSi1(y: number): void {
    const dim = this.dim;
    const { Si_1, Sv_1, R, L, D } = this;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let sum = 0;
        for (let k = 0; k < dim; k++) sum += Sv_1[i][k] * (y * R[k][j] + this.scalingF * L[k][j]);
        Si_1[i][j] = sum;
      }
    }
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) Si_1[i][j] /= Math.sqrt(D[i]);
    }
    // Gauss-Jordan inverse with partial pivoting (Gaussian_Elimination2 type -1).
    const A = Array.from({ length: dim }, (_unused, i) => {
      const row = new Array<number>(2 * dim + 1).fill(0);
      for (let j = 0; j < dim; j++) row[j] = Si_1[i][j];
      row[i + dim] = 1;
      return row;
    });
    const width = 2 * dim;
    for (let i = 0; i < dim; i++) {
      let imax = i;
      let max = ABS(A[i][i]);
      for (let j = i + 1; j < dim; j++) {
        if (ABS(A[j][i]) > max) {
          imax = j;
          max = ABS(A[j][i]);
        }
      }
      if (!(max >= 1.0e-88)) {
        throw cplError('Gaussian elimination (misc) fails during setup of CPL; check the model parameters');
      }
      if (imax !== i) {
        const swap = A[i];
        A[i] = A[imax];
        A[imax] = swap;
      }
      let f = 1.0 / A[i][i];
      A[i][i] = 1.0;
      for (let j = i + 1; j <= width; j++) A[i][j] *= f;
      for (let j = 0; j < dim; j++) {
        if (i === j) continue;
        f = A[j][i];
        A[j][i] = 0.0;
        for (let k = i + 1; k <= width; k++) A[j][k] -= f * A[i][k];
      }
    }
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) this.Si[i][j] = A[i][j + dim];
    }
  }

  private storeSiSv1(index: number): void {
    const dim = this.dim;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        let temp = 0;
        for (let k = 0; k < dim; k++) temp += this.Si[i][k] * this.Sv_1[k][j];
        this.SiSv_1[i][j][index] = temp;
      }
    }
  }

  private store(index: number): void {
    const dim = this.dim;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        this.Sip[i][j][index] = this.Si[i][j];
        this.Si_1p[i][j][index] = this.Si_1[i][j];
        this.Sv_1p[i][j][index] = this.Sv_1[i][j];
      }
      this.W[i][index] = this.D[i];
    }
  }

  /** ngspice `approx_mode`: modal delay and attenuated propagation series, in place. */
  private approxMode(X: Float64Array): number {
    const w0 = X[0];
    const w1 = X[1] / w0;
    const w2 = X[2] / w0;
    const w3 = X[3] / w0;
    const w4 = X[4] / w0;
    const w5 = X[5] / w0;
    const y1 = 0.5 * w1;
    const y2 = w2 - y1 * y1;
    const y3 = 3 * w3 - 3.0 * y1 * y2;
    const y4 = 12.0 * w4 - 3.0 * y2 * y2 - 4.0 * y1 * y3;
    const y5 = 60.0 * w5 - 5.0 * y1 * y4 - 10.0 * y2 * y3;
    const y6 = -10.0 * y3 * y3 - 15.0 * y2 * y4 - 6.0 * y1 * y5;
    const delay = Math.sqrt(w0) * this.length / this.scalingF;
    const atten = Math.exp(-delay * y1);
    const a = [0, y2 / 2.0, y3 / 6.0, y4 / 24.0, y5 / 120.0, y6 / 720.0];
    for (let i = 1; i <= 5; i++) a[i] *= -delay;
    X[0] = 1.0;
    X[1] = a[1];
    for (let i = 2; i <= 5; i++) {
      X[i] = 0.0;
      for (let j = 1; j <= i; j++) X[i] += j * a[j] * X[i - j];
      X[i] = X[i] / i;
    }
    for (let i = 0; i <= 5; i++) X[i] *= atten;
    return delay;
  }

  /** ngspice `matrix_p_mult`: X(y) = A(y) diag(W(y)) B(y), normalised per entry. */
  private matrixPolyMult(A: Float64Array[][], B: Float64Array[][], X: MultOut[][]): void {
    const dim = this.dim;
    const T = Array.from({ length: dim }, (_unused, i) =>
      Array.from({ length: dim }, (_unused2, j) => {
        const p = new Float64Array(LEFT_DEG + 1);
        multiplyPolynomials(B[i][j], this.W[i], p, LEFT_DEG, LEFT_DEG, LEFT_DEG);
        return p;
      }));
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        for (let k = 0; k < dim; k++) {
          const p = X[i][j].poly[k];
          multiplyPolynomials(A[i][k], T[k][j], p, LEFT_DEG, LEFT_DEG, LEFT_DEG);
          const t1 = p[0];
          X[i][j].c0[k] = t1;
          if (t1 !== 0) {
            p[0] = 1.0;
            for (let l = 1; l <= LEFT_DEG; l++) p[l] /= t1;
          }
        }
      }
    }
  }

  /** ngspice `generate_out`: Pade-fit every admittance and propagation entry. */
  private generateOut(): void {
    const dim = this.dim;
    const { G, R, length } = this;
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        const p = this.SiSv_1[i][j];
        const C = p[0];
        this.SIV[i][j].c0 = C;
        if (C === 0) continue;
        for (let k = 0; k <= LEFT_DEG; k++) p[k] /= C;
        const ab = i === j ? Math.sqrt(G[i][i] / R[i][i]) / C : 0;
        this.SIV[i][j].poly = padeApproximation(ab, p);
      }
    }
    for (const [out, diagonal] of [
      [this.IWI, (i: number) => Math.exp(-Math.sqrt(G[i][i] * R[i][i]) * length)],
      [this.IWV, (i: number) => Math.sqrt(G[i][i] / R[i][i]) * Math.exp(-Math.sqrt(G[i][i] * R[i][i]) * length)],
    ] as const) {
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          for (let k = 0; k < dim; k++) {
            const p = out[i][j].poly[k];
            const C = out[i][j].c0[k];
            if (C === 0) continue;
            const ab = i === j && k === i ? diagonal(i) / C : 0;
            p.set(padeApproximation(ab, p));
          }
        }
      }
    }
  }

  /** ngspice `diag`: Jacobi diagonalisation of the upper triangle of ZY. */
  private diag(): void {
    const dim = this.dim;
    const ZY = this.ZY;
    let fmin = ABS(ZY[0][0]);
    let fmax = fmin;
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) {
        if (ABS(ZY[i][j]) > fmax) fmax = ABS(ZY[i][j]);
        else if (ABS(ZY[i][j]) < fmin) fmin = ABS(ZY[i][j]);
      }
    }
    fmin = 2.0 / (fmin + fmax);
    for (let i = 0; i < dim; i++) {
      for (let j = i; j < dim; j++) ZY[i][j] *= fmin;
    }
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) this.Sv[i][j] = i === j ? 1.0 : 0.0;
    }

    const rows: { row: number; col: number; value: number }[] = [];
    const insert = (entry: { row: number; col: number; value: number }): void => {
      let index = 0;
      while (index < rows.length && !(rows[index].value < entry.value)) index++;
      rows.splice(index, 0, entry);
    };
    const largestInRow = (p: number): [number, number] => {
      let m = p + 1;
      let mv = ABS(ZY[p][m]);
      for (let j = m + 1; j < dim; j++) {
        if (Math.trunc(ABS(ZY[p][j]) * 1e7) > Math.trunc(1e7 * mv)) {
          mv = ABS(ZY[p][j]);
          m = j;
        }
      }
      return [m, mv];
    };
    const reinsert = (p: number): void => {
      const [m, mv] = largestInRow(p);
      const index = rows.findIndex(entry => entry.row === p);
      const [entry] = rows.splice(index, 1);
      entry.col = m;
      entry.value = mv;
      insert(entry);
    };

    for (let i = 0; i < dim - 1; i++) {
      const [m, mv] = largestInRow(i);
      insert({ row: i, col: m, value: mv });
    }
    let rotations = 0;
    while (rows.length > 0 && rows[0].value > JACOBI_TOLERANCE) {
      if (++rotations > JACOBI_ROTATION_LIMIT) {
        throw cplError('Jacobi diagonalisation of the line matrices did not converge');
      }
      const p = rows[0].row;
      const q = rows[0].col;
      this.rotate(p, q);
      reinsert(p);
      if (q + 1 !== dim) reinsert(q);
    }
    for (let i = 0; i < dim; i++) this.D[i] = ZY[i][i] / fmin;
  }

  /** ngspice `rotate`: one Jacobi rotation zeroing ZY[p][q] (upper triangle, p < q). */
  private rotate(p: number, q: number): void {
    const dim = this.dim;
    const ZY = this.ZY;
    const ld = -ZY[p][q];
    const mu = 0.5 * (ZY[p][p] - ZY[q][q]);
    const ve = Math.sqrt(ld * ld + mu * mu);
    const co = Math.sqrt((ve + ABS(mu)) / (2.0 * ve));
    const si = SGN(mu) * ld / (2.0 * ve * co);
    const T = new Array<number>(dim).fill(0);
    for (let j = p + 1; j < dim; j++) T[j] = ZY[p][j];
    for (let j = 0; j < p; j++) T[j] = ZY[j][p];
    for (let j = p + 1; j < dim; j++) {
      if (j === q) continue;
      if (j > q) ZY[p][j] = T[j] * co - ZY[q][j] * si;
      else ZY[p][j] = T[j] * co - ZY[j][q] * si;
    }
    for (let j = q + 1; j < dim; j++) {
      if (j === p) continue;
      ZY[q][j] = T[j] * si + ZY[q][j] * co;
    }
    for (let j = 0; j < p; j++) {
      if (j === q) continue;
      ZY[j][p] = T[j] * co - ZY[j][q] * si;
    }
    for (let j = 0; j < q; j++) {
      if (j === p) continue;
      ZY[j][q] = T[j] * si + ZY[j][q] * co;
    }
    const t = ZY[p][p];
    ZY[p][p] = t * co * co + ZY[q][q] * si * si - 2.0 * ZY[p][q] * si * co;
    ZY[q][q] = t * si * si + ZY[q][q] * co * co + 2.0 * ZY[p][q] * si * co;
    ZY[p][q] = 0.0;
    const Sv = this.Sv;
    for (let j = 0; j < dim; j++) {
      const a = Sv[j][p];
      const b = Sv[j][q];
      Sv[j][p] = a * co - b * si;
      Sv[j][q] = a * si + b * co;
    }
  }
}

function multiplyInto(out: number[][], left: number[][], right: number[][], dim: number): void {
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      let sum = 0;
      for (let k = 0; k < dim; k++) sum += left[i][k] * right[k][j];
      out[i][j] = sum;
    }
  }
}

function copyInto(out: number[][], source: number[][], dim: number): void {
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) out[i][j] = source[i][j];
  }
}

/** ngspice `mult_p`: p3 = p1 * p2 truncated to degree d3. */
function multiplyPolynomials(
  p1: Float64Array, p2: Float64Array, p3: Float64Array, d1: number, d2: number, d3: number,
): void {
  for (let i = 0; i <= d3; i++) p3[i] = 0;
  for (let i = 0; i <= d1; i++) {
    for (let j = i, k = 0; k <= d2; j++, k++) {
      if (j > d3) break;
      p3[j] += p1[i] * p2[k];
    }
  }
}

/** ngspice `polint` (Neville) on xa[0..n-1], ya[0..n-1], evaluated at x. */
function polint(xa: ArrayLike<number>, ya: ArrayLike<number>, n: number, x: number): number {
  let ns = 1;
  let dif = ABS(x - xa[0]);
  const c = new Array<number>(n + 2).fill(0);
  const d = new Array<number>(n + 2).fill(0);
  for (let i = 1; i <= n; i++) {
    const dift = ABS(x - xa[i - 1]);
    if (dift < dif) {
      ns = i;
      dif = dift;
    }
    c[i] = ya[i - 1];
    d[i] = ya[i - 1];
  }
  let y = ya[ns - 1];
  ns--;
  for (let m = 1; m < n; m++) {
    for (let i = 1; i <= n - m; i++) {
      const ho = xa[i - 1] - x;
      const hp = xa[i + m - 1] - x;
      const w = c[i + 1] - d[i];
      let den = ho - hp;
      if (den === 0) throw cplError('polynomial interpolation failed (routine POLINT)');
      den = w / den;
      d[i] = hp * den;
      c[i] = ho * den;
    }
    const dy = 2 * ns < (n - m) ? c[ns + 1] : d[ns--];
    y += dy;
  }
  return y;
}

/** ngspice `match`: coefficients cof[0..n] of the polynomial through (xa, ya). */
function match(n: number, cof: Float64Array, xa: ArrayLike<number>, ya: ArrayLike<number>): void {
  const x = Array.from({ length: n + 1 }, (_unused, j) => xa[j]);
  const y = Array.from({ length: n + 1 }, (_unused, j) => ya[j]);
  for (let j = 0; j <= n; j++) {
    cof[j] = polint(x, y, n + 1 - j, 0.0);
    let xmin = 1.0e38;
    let k = -1;
    for (let i = 0; i <= n - j; i++) {
      if (ABS(x[i]) < xmin) {
        xmin = ABS(x[i]);
        k = i;
      }
      if (x[i]) y[i] = (y[i] - cof[j]) / x[i];
    }
    for (let i = k + 1; i <= n - j; i++) {
      y[i - 1] = y[i];
      x[i - 1] = x[i];
    }
  }
}

function eval2(a: number, b: number, c: number, x: number): number {
  return a * x * x + b * x + c;
}

function complexResidue(
  q1: number, q2: number, q3: number, p1: number, p2: number, a: number, b: number,
): [number, number] {
  let d = (3.0 * (a * a - b * b) + 2.0 * p1 * a + p2) * (3.0 * (a * a - b * b) + 2.0 * p1 * a + p2);
  d += (6.0 * a * b + 2.0 * p1 * b) * (6.0 * a * b + 2.0 * p1 * b);
  let n = -(q1 * (a * a - b * b) + q2 * a + q3) * (6.0 * a * b + 2.0 * p1 * b);
  n += (2.0 * q1 * a * b + q2 * b) * (3.0 * (a * a - b * b) + 2.0 * p1 * a + p2);
  const ci = n / d;
  n = (3.0 * (a * a - b * b) + 2.0 * p1 * a + p2) * (q1 * (a * a - b * b) + q2 * a + q3);
  n += (6.0 * a * b + 2.0 * p1 * b) * (2.0 * q1 * a * b + q2 * b);
  return [n / d, ci];
}

/**
 * ngspice `Pade_apx`: [c1, c2, c3, x1, x2, x3, rtv] with rtv 2 for a complex
 * pole pair (x2 + j x3) and 1 for three real poles.
 */
function padeApproximation(ab: number, b: ArrayLike<number>): Float64Array {
  const At = [
    [1.0 - ab, b[1], b[2], -b[3]],
    [b[1], b[2], b[3], -b[4]],
    [b[2], b[3], b[4], -b[5]],
  ];
  for (let i = 0; i < 3; i++) {
    let imax = i;
    let max = ABS(At[i][i]);
    for (let j = i + 1; j < 3; j++) {
      if (ABS(At[j][i]) > max) {
        imax = j;
        max = ABS(At[j][i]);
      }
    }
    if (!(max >= 1e-28)) {
      throw cplError('Gaussian elimination (mult) fails during setup of CPL; check the model parameters');
    }
    if (imax !== i) {
      const swap = At[i];
      At[i] = At[imax];
      At[imax] = swap;
    }
    let f = 1.0 / At[i][i];
    At[i][i] = 1.0;
    for (let j = i + 1; j <= 3; j++) At[i][j] *= f;
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      f = At[j][i];
      At[j][i] = 0.0;
      for (let k = i + 1; k <= 3; k++) At[j][k] -= f * At[i][k];
    }
  }
  const p3 = At[0][3];
  const p2 = At[1][3];
  const p1 = At[2][3];
  const q1 = p1 + b[1];
  const q2 = b[1] * p1 + p2 + b[2];
  const q3 = p3 * ab;

  // find_roots
  const q = (p1 * p1 - 3.0 * p2) / 9.0;
  const p = (2.0 * p1 * p1 * p1 - 9.0 * p1 * p2 + 27.0 * p3) / 54.0;
  let t = q * q * q - p * p;
  let x: number;
  if (t >= 0.0) {
    t = Math.acos(p / (q * Math.sqrt(q)));
    x = -2.0 * Math.sqrt(q) * Math.cos(t / 3.0) - p1 / 3.0;
  } else if (p > 0.0) {
    t = Math.pow(Math.sqrt(-t) + p, 1.0 / 3.0);
    x = -(t + q / t) - p1 / 3.0;
  } else if (p === 0.0) {
    x = -p1 / 3.0;
  } else {
    t = Math.pow(Math.sqrt(-t) - p, 1.0 / 3.0);
    x = (t + q / t) - p1 / 3.0;
  }
  const backup = x;
  let iterations = 0;
  const newton = (value: number): number => {
    const t1 = value * (value * (value + p1) + p2) + p3;
    const t2 = value * (2.0 * p1 + 3.0 * value) + p2;
    return value - t1 / t2;
  };
  for (t = newton(x); ABS(t - x) > 5.0e-4; t = newton(x)) {
    if (++iterations === 32) {
      x = backup;
      break;
    }
    x = t;
  }
  const x1 = x;
  const a1 = p1 + x;
  const a2 = -p3 / x;
  t = a1 * a1 - 4.0 * a2;
  const out = new Float64Array(7);
  out[3] = x1;
  out[0] = eval2(q1 - p1, q2 - p2, q3 - p3, x1) / eval2(3.0, 2.0 * p1, p2, x1);
  if (t < 0) {
    const x3 = 0.5 * Math.sqrt(-t);
    const x2 = -0.5 * a1;
    const [c2, c3] = complexResidue(q1 - p1, q2 - p2, q3 - p3, p1, p2, x2, x3);
    out.set([c2, c3], 1);
    out.set([x2, x3], 4);
    out[6] = 2;
  } else {
    t = Math.sqrt(t);
    const x2 = a1 >= 0.0 ? -0.5 * (a1 + t) : -0.5 * (a1 - t);
    const x3 = a2 / x2;
    out[1] = eval2(q1 - p1, q2 - p2, q3 - p3, x2) / eval2(3.0, 2.0 * p1, p2, x2);
    out[2] = eval2(q1 - p1, q2 - p2, q3 - p3, x3) / eval2(3.0, 2.0 * p1, p2, x3);
    out.set([x2, x3], 4);
    out[6] = 1;
  }
  return out;
}

function terms(c0: number, poly: ArrayLike<number> | null): CplTerms | null {
  if (c0 === 0 || poly === null) return null;
  return {
    ifImg: Math.trunc(poly[6] - 1.0) !== 0,
    aten: c0,
    c: Float64Array.of(poly[0] * c0, poly[1] * c0, poly[2] * c0),
    x: Float64Array.of(poly[3], poly[4], poly[5]),
  };
}

function termSum(entry: CplTerms | null): number {
  if (entry === null) return 0;
  return entry.ifImg ? entry.c[0] + 2.0 * entry.c[1] : entry.c[0] + entry.c[1] + entry.c[2];
}

/**
 * Expand upper-triangular row-major vectors (ngspice IF_REALVEC order) into
 * full symmetric matrices, clamping R to at least 1e-4 as ngspice ReadCpL does.
 */
export function cplMatricesFromUpperTriangles(
  lines: number,
  vectors: { R: readonly number[]; L: readonly number[]; G: readonly number[]; C: readonly number[] },
): CplMatrices {
  const expected = lines * (lines + 1) / 2;
  for (const [name, values] of Object.entries(vectors)) {
    if (values.length !== expected) {
      throw cplError(
        `model matrix ${name} has ${values.length} values; ${lines} coupled lines need ${expected} (upper triangle)`,
      );
    }
    if (!values.every(Number.isFinite)) throw cplError(`model matrix ${name} has a non-finite value`);
  }
  const R = square(lines);
  const L = square(lines);
  const G = square(lines);
  const C = square(lines);
  let counter = 0;
  for (let i = 0; i < lines; i++) {
    for (let j = 0; j < lines; j++) {
      if (i > j) {
        R[i][j] = R[j][i];
        G[i][j] = G[j][i];
        C[i][j] = C[j][i];
        L[i][j] = L[j][i];
      } else {
        R[i][j] = Math.max(vectors.R[counter], 1.0e-4);
        G[i][j] = vectors.G[counter];
        L[i][j] = vectors.L[counter];
        C[i][j] = vectors.C[counter];
        counter++;
      }
    }
  }
  return { R, L, G, C };
}

/** ngspice ReadCpL: modal Pade coefficients of a CPL instance of total length `length`. */
export function computeCplCoefficients(matrices: CplMatrices, length: number): CplCoefficients {
  const setup = new CplSetup(matrices, length);
  setup.run();
  const n = setup.dim;
  const h1: (CplTerms | null)[] = [];
  const h2: (CplTerms | null)[] = [];
  const h3: (CplTerms | null)[] = [];
  const h1C = new Float64Array(n * n);
  const h2C = new Float64Array(n * n * n);
  const h3C = new Float64Array(n * n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const siv = setup.SIV[i][j];
      const entry = terms(siv.c0, siv.poly);
      h1.push(entry);
      h1C[i * n + j] = termSum(entry);
      for (let k = 0; k < n; k++) {
        const index = (i * n + j) * n + k;
        const current = terms(setup.IWI[i][j].c0[k], setup.IWI[i][j].poly[k]);
        const voltage = terms(setup.IWV[i][j].c0[k], setup.IWV[i][j].poly[k]);
        h2.push(current);
        h3.push(voltage);
        h2C[index] = termSum(current);
        h3C[index] = termSum(voltage);
      }
    }
  }
  const taul = Float64Array.from(setup.TAU, value => value * 1.0e12);
  const dcResistance = Float64Array.from({ length: n }, (_unused, i) => setup.R[i][i]);
  const all = [...taul, ...h1C, ...h2C, ...h3C];
  for (const entry of [...h1, ...h2, ...h3]) {
    if (entry) all.push(entry.aten, ...entry.c, ...entry.x);
  }
  if (!all.every(Number.isFinite)) {
    throw cplError('the modal Pade approximation of these line matrices is not finite');
  }
  return { lines: n, taul, h1, h2, h3, h1C, h2C, h3C, dcResistance };
}

/** Convolution state of ngspice CPLine (TMS cnv_i / cnv_o, h1e, ext, ratio). */
class CplState {
  readonly h1I: Float64Array;
  readonly h1O: Float64Array;
  readonly h1e: Float64Array;
  readonly h2I: Float64Array;
  readonly h2O: Float64Array;
  readonly h3I: Float64Array;
  readonly h3O: Float64Array;
  readonly ratio: Float64Array;
  ext = false;

  constructor(lines: number) {
    const pairs = lines * lines * 3;
    const triples = lines * lines * lines * 3;
    this.h1I = new Float64Array(pairs);
    this.h1O = new Float64Array(pairs);
    this.h1e = new Float64Array(pairs);
    this.h2I = new Float64Array(triples);
    this.h2O = new Float64Array(triples);
    this.h3I = new Float64Array(triples);
    this.h3O = new Float64Array(triples);
    this.ratio = new Float64Array(lines);
  }

  copyFrom(other: CplState): void {
    this.h1I.set(other.h1I);
    this.h1O.set(other.h1O);
    this.h1e.set(other.h1e);
    this.h2I.set(other.h2I);
    this.h2O.set(other.h2O);
    this.h3I.set(other.h3I);
    this.h3O.set(other.h3O);
    this.ratio.set(other.ratio);
    this.ext = other.ext;
  }

  reset(): void {
    for (const array of [this.h1I, this.h1O, this.h1e, this.h2I, this.h2O, this.h3I, this.h3O, this.ratio]) {
      array.fill(0);
    }
    this.ext = false;
  }
}

/**
 * P-element instance with `lines` conductors. Node order is
 * [in_1..in_n, out_1..out_n]; branches are [ibr1_1..ibr1_n, ibr2_1..ibr2_n]
 * (currents into the line at each input and output terminal). All
 * conductors are referenced to ground, as in ngspice.
 */
export class CplLines implements DeviceModel {
  readonly isNonlinear = false;
  /**
   * ngspice-47 CPL has no DEVtrunc (cplinit.c `.DEVtrunc = NULL`): the line
   * never bounds CKTtrunc, it only lowers CKTmaxStep in CPLload, which
   * {@link truncateTransientStep} reproduces. So the node-voltage LTE must
   * not run on the port nodes on the line's account (#549).
   */
  readonly truncationCoversCharges = true;
  readonly lines: number;
  private readonly committed: CplState;
  private readonly trial: CplState;
  private readonly history: SwecHistory;
  private trialKey: [number, number] = [Number.NaN, -1];
  private commits = 0;
  /** Exact time (s) of the newest history record. */
  private commitTime = 0;
  /** Step of the last evaluated load, from the newest history record. */
  private loadStep = 0;
  private readonly dc1: Float64Array;
  private readonly dc2: Float64Array;
  private readonly inV: Float64Array;
  private readonly outV: Float64Array;
  private readonly inDv: Float64Array;
  private readonly outDv: Float64Array;
  private readonly ff: Float64Array;
  private readonly gg: Float64Array;
  private readonly delayedVoltage: Float64Array;
  private readonly delayedCurrent: Float64Array;
  private readonly maxTaul: number;
  private readonly minTaul: number;
  private maxStep = Infinity;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branches: number[],
    readonly coefficients: CplCoefficients,
    /** Line length used for the DC series resistance R_ii * length (ngspice CPLload MODEDC). */
    readonly length: number,
  ) {
    const n = coefficients.lines;
    this.lines = n;
    this.committed = new CplState(n);
    this.trial = new CplState(n);
    this.history = new SwecHistory(n);
    this.dc1 = new Float64Array(n);
    this.dc2 = new Float64Array(n);
    this.inV = new Float64Array(n);
    this.outV = new Float64Array(n);
    this.inDv = new Float64Array(n);
    this.outDv = new Float64Array(n);
    this.ff = new Float64Array(n);
    this.gg = new Float64Array(n);
    this.delayedVoltage = new Float64Array(n * n);
    this.delayedCurrent = new Float64Array(n * n);
    this.maxTaul = Math.max(...coefficients.taul);
    let minTaul = 123456789.0;
    for (const value of coefficients.taul) if (minTaul > value) minTaul = value;
    this.minTaul = minTaul;
  }

  stamp(ctx: StampContext): void {
    const n = this.lines;
    const gmin = swecGmin(ctx.gmin ?? DEVICE_GMIN);
    for (let m = 0; m < n; m++) {
      const pos = this.nodes[m];
      const neg = this.nodes[n + m];
      addConductance(ctx, pos, pos, gmin);
      addConductance(ctx, neg, neg, gmin);
      addConductance(ctx, neg, pos, gmin);
      addConductance(ctx, pos, neg, gmin);
    }

    if (ctx.dt === 0) {
      this.stampDc(ctx);
      return;
    }

    if (this.minTaul < ctx.dt * 1e12) {
      this.maxStep = Math.min(this.maxStep, maxStepAfterDelay(this.minTaul));
    }
    if (this.history.length === 0) this.setupDc(ctx);
    this.evaluateLoad(ctx.time);

    const { h1, h1C } = this.coefficients;
    const halfStep = 0.5 * this.loadStep;
    for (let m = 0; m < n; m++) {
      const b1 = ctx.numNodes + this.branches[m];
      const b2 = ctx.numNodes + this.branches[n + m];
      ctx.stampG(b1, b1, -1);
      ctx.stampG(b2, b2, -1);
      addConductance(ctx, this.nodes[m], b1, 1);
      addConductance(ctx, this.nodes[n + m], b2, 1);
      for (let p = 0; p < n; p++) {
        const admittance = h1[m * n + p]!.aten + halfStep * h1C[m * n + p];
        addConductance(ctx, b1, this.nodes[p], admittance);
        addConductance(ctx, b2, this.nodes[n + p], admittance);
        addConductance(ctx, b1, this.nodes[n + p], this.delayedVoltage[m * n + p]);
        addConductance(ctx, b2, this.nodes[p], this.delayedVoltage[m * n + p]);
        ctx.stampG(b1, ctx.numNodes + this.branches[n + p], this.delayedCurrent[m * n + p]);
        ctx.stampG(b2, ctx.numNodes + this.branches[p], this.delayedCurrent[m * n + p]);
      }
      ctx.stampB(b1, this.ff[m]);
      ctx.stampB(b2, this.gg[m]);
    }
  }

  /** ngspice CPLload sets CKTmaxStep to 0.9 min(tau) once a step exceeds the shortest modal delay. */
  truncateTransientStep(): number {
    return this.maxStep;
  }

  acceptTransientStep(ctx: StampContext): void {
    if (this.history.length === 0) {
      this.setupDc(ctx);
      return;
    }
    const time = swecTimePs(ctx.time);
    const before = this.history.tailTime();
    if (!(time > before)) return;
    const n = this.lines;
    this.evaluateLoad(ctx.time);
    this.committed.copyFrom(this.trial);
    const previous = this.history.tail();
    const vIn = new Float64Array(n);
    const vOut = new Float64Array(n);
    const iIn = new Float64Array(n);
    const iOut = new Float64Array(n);
    for (let m = 0; m < n; m++) {
      vIn[m] = voltage(ctx, this.nodes[m]);
      vOut[m] = voltage(ctx, this.nodes[n + m]);
      iIn[m] = ctx.getCurrent(this.branches[m]);
      iOut[m] = ctx.getCurrent(this.branches[n + m]);
    }
    const prevIn = Float64Array.from({ length: n }, (_unused, m) => this.history.vIn(previous, m));
    const prevOut = Float64Array.from({ length: n }, (_unused, m) => this.history.vOut(previous, m));
    this.history.push(time, vIn, vOut, iIn, iOut);
    this.commits++;
    this.commitTime = ctx.time;
    const delta = time - before;
    for (let m = 0; m < n; m++) {
      this.inV[m] = vIn[m];
      this.inDv[m] = (vIn[m] - prevIn[m]) / delta;
      this.outV[m] = vOut[m];
      this.outDv[m] = (vOut[m] - prevOut[m]) / delta;
    }
    this.updateConvolution(delta);
    if (this.committed.ext) this.updateDelayedConvolution(delta);
    this.history.trimBefore(time - this.maxTaul);
  }

  resetTransient(): void {
    this.history.clear();
    this.committed.reset();
    this.trial.reset();
    this.trialKey = [Number.NaN, -1];
    this.commits = 0;
    this.commitTime = 0;
    for (const array of [this.dc1, this.dc2, this.inV, this.outV, this.inDv, this.outDv]) array.fill(0);
    this.maxStep = Infinity;
  }

  private stampDc(ctx: StampContext): void {
    const n = this.lines;
    for (let m = 0; m < n; m++) {
      const pos = this.nodes[m];
      const neg = this.nodes[n + m];
      const b1 = ctx.numNodes + this.branches[m];
      const b2 = ctx.numNodes + this.branches[n + m];
      const g = this.coefficients.dcResistance[m] * this.length;
      addConductance(ctx, pos, b1, 1);
      addConductance(ctx, neg, b2, 1);
      ctx.stampG(b1, b1, 1);
      ctx.stampG(b2, b2, 0);
      for (let p = 0; p < n; p++) {
        const b1p = ctx.numNodes + this.branches[p];
        const b2p = ctx.numNodes + this.branches[n + p];
        ctx.stampG(b1, b2p, p === m ? 1 : 0);
        addConductance(ctx, b2, this.nodes[p], p === m ? 1 : 0);
        addConductance(ctx, b2, this.nodes[n + p], p === m ? -1 : 0);
        ctx.stampG(b2, b1p, p === m ? -g : 0);
        // Register the transient pattern before the sparse topology locks.
        addConductance(ctx, b1, this.nodes[p], 0);
        addConductance(ctx, b1, this.nodes[n + p], 0);
      }
    }
  }

  /** ngspice CPLload "dc setup" at the first transient load (CKTrhsOld = operating point). */
  private setupDc(ctx: StampContext): void {
    const n = this.lines;
    const { h1, h2, h3 } = this.coefficients;
    const forbidden = [...h1, ...h2, ...h3].some(entry => entry === null);
    if (forbidden) {
      throw cplError(`instance ${this.name}: forbidden combination of model parameters (ngspice-47 aborts the transient)`);
    }
    for (let m = 0; m < n; m++) {
      this.dc1[m] = voltage(ctx, this.nodes[m]);
      this.dc2[m] = voltage(ctx, this.nodes[n + m]);
    }
    this.inV.set(this.dc1);
    this.outV.set(this.dc2);
    this.inDv.fill(0);
    this.outDv.fill(0);
    this.committed.reset();
    this.history.clear();
    const zeros = new Float64Array(n);
    this.history.push(0, this.dc1, this.dc2, zeros, zeros);
    this.commits++;
    this.commitTime = 0;
    const state = this.committed;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        initialiseTerms(h1[i * n + j]!, state.h1I, state.h1O, (i * n + j) * 3, this.dc1[j], this.dc2[j]);
        for (let l = 0; l < n; l++) {
          const index = ((i * n + j) * n + l) * 3;
          initialiseTerms(h3[(i * n + j) * n + l]!, state.h3I, state.h3O, index, this.dc1[j], this.dc2[j]);
        }
      }
    }
  }

  /**
   * ngspice right_consts on a copy of the committed state (copy_cp(cp2,
   * cp)), with the step measured from the newest history record as in
   * {@link TxlLine}: identical to CKTdelta whenever each accepted step
   * advances the integer-picosecond clock.
   */
  private evaluateLoad(time: number): void {
    const key = this.trialKey;
    if (key[0] === time && key[1] === this.commits) return;
    this.trialKey = [time, this.commits];
    const n = this.lines;
    const coefficients = this.coefficients;
    const trial = this.trial;
    trial.copyFrom(this.committed);
    const h = time - this.commitTime;
    this.loadStep = h;
    const h1 = 0.5 * h;
    const ff = this.ff;
    const gg = this.gg;

    for (let j = 0; j < n; j++) {
      ff[j] = 0;
      gg[j] = 0;
      for (let k = 0; k < n; k++) {
        const tms = coefficients.h1[j * n + k]!;
        const base = (j * n + k) * 3;
        if (tms.ifImg) {
          const e = Math.exp(tms.x[0] * h);
          const ee = Math.exp(tms.x[1] * h);
          const er = ee * Math.cos(tms.x[2] * h);
          const ei = ee * Math.sin(tms.x[2] * h);
          trial.h1e[base] = e;
          trial.h1e[base + 1] = er;
          trial.h1e[base + 2] = ei;
          const ff1 = tms.c[0] * e * h1;
          ff[j] -= trial.h1I[base] * e;
          gg[j] -= trial.h1O[base] * e;
          ff[j] -= ff1 * this.inV[k];
          gg[j] -= ff1 * this.outV[k];
          const a1 = tms.c[1] * er - tms.c[2] * ei;
          let a = trial.h1I[base + 1] * er - trial.h1I[base + 2] * ei;
          ff[j] -= 2.0 * (a1 * h1 * this.inV[k] + a);
          a = trial.h1O[base + 1] * er - trial.h1O[base + 2] * ei;
          gg[j] -= 2.0 * (a1 * h1 * this.outV[k] + a);
        } else {
          let ff1 = 0;
          for (let i = 0; i < 3; i++) {
            const e = Math.exp(tms.x[i] * h);
            trial.h1e[base + i] = e;
            ff1 -= tms.c[i] * e;
            ff[j] -= trial.h1I[base + i] * e;
            gg[j] -= trial.h1O[base + i] * e;
          }
          ff[j] += ff1 * h1 * this.inV[k];
          gg[j] += ff1 * h1 * this.outV[k];
        }
      }
    }

    const t1 = this.history.tailTime();
    const t2 = swecTimePs(time);
    const d = this.history.delayed(t1, t2, coefficients.taul, this.dc1, this.dc2);

    for (let j = 0; j < n; j++) {
      for (const [table, I, O, v1i, v2i, v1o, v2o] of [
        [coefficients.h3, trial.h3I, trial.h3O, d.v1i, d.v2i, d.v1o, d.v2o],
        [coefficients.h2, trial.h2I, trial.h2O, d.i1i, d.i2i, d.i1o, d.i2o],
      ] as const) {
        for (let k = 0; k < n; k++) {
          for (let l = 0; l < n; l++) {
            const tms = table[(j * n + k) * n + l];
            if (!tms) continue;
            const base = ((j * n + k) * n + l) * 3;
            const delayed = l * n + k;
            const x1i = v1i[delayed];
            const x2i = v2i[delayed];
            const x1o = v1o[delayed];
            const x2o = v2o[delayed];
            if (tms.ifImg) {
              updateComplexPair(I, O, base + 1, tms.c, tms.x, 1, h, h1, x1i, x2i, x1o, x2o);
              const e = Math.exp(tms.x[0] * h);
              I[base] = I[base] * e + h1 * tms.c[0] * (x1i * e + x2i);
              O[base] = O[base] * e + h1 * tms.c[0] * (x1o * e + x2o);
              ff[j] += tms.aten * x2o + O[base] + 2.0 * O[base + 1];
              gg[j] += tms.aten * x2i + I[base] + 2.0 * I[base + 1];
            } else {
              for (let i = 0; i < 3; i++) {
                const e = Math.exp(tms.x[i] * h);
                I[base + i] = I[base + i] * e + h1 * tms.c[i] * (x1i * e + x2i);
                O[base + i] = O[base + i] * e + h1 * tms.c[i] * (x1o * e + x2o);
                ff[j] += O[base + i];
                gg[j] += I[base + i];
              }
              ff[j] += tms.aten * x2o;
              gg[j] += tms.aten * x2i;
            }
          }
        }
      }
    }

    this.delayedVoltage.fill(0);
    this.delayedCurrent.fill(0);
    if (d.ext) {
      trial.ext = true;
      for (let q = 0; q < n; q++) {
        const ratio = d.ratio[q];
        // ngspice stores ratio[] on the committed line (cp->ratio) during a load.
        trial.ratio[q] = ratio;
        if (!(ratio > 0)) continue;
        for (let m = 0; m < n; m++) {
          for (let p = 0; p < n; p++) {
            const index = (m * n + p) * n + q;
            const voltageTerms = coefficients.h3[index];
            // Assignment, not accumulation: the last delayed mode wins (ngspice cplload.c).
            if (voltageTerms) {
              this.delayedVoltage[m * n + p] = -ratio * (h1 * coefficients.h3C[index] + voltageTerms.aten);
            }
            const currentTerms = coefficients.h2[index];
            if (currentTerms) {
              this.delayedCurrent[m * n + p] = -ratio * (h1 * coefficients.h2C[index] + currentTerms.aten);
            }
          }
        }
      }
    } else {
      trial.ext = false;
      trial.ratio.set(d.ratio);
    }
  }

  /** ngspice update_cnv: advance the admittance convolutions by `delta` ps. */
  private updateConvolution(delta: number): void {
    const n = this.lines;
    const state = this.committed;
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const tms = this.coefficients.h1[j * n + k];
        if (!tms) continue;
        const base = (j * n + k) * 3;
        const ai = this.inV[k];
        const ao = this.outV[k];
        let bi = this.inDv[k];
        let bo = this.outDv[k];
        if (tms.ifImg) {
          const e = state.h1e[base];
          const t = tms.c[0] / tms.x[0];
          updateComplexHistory(state, tms, base, delta, ai, ao, ai - bi * delta, ao - bo * delta,
            state.h1e[base + 1], state.h1e[base + 2]);
          bi *= t;
          bo *= t;
          state.h1I[base] = (state.h1I[base] - bi * delta) * e + (e - 1.0) * (ai * t + 1.0e12 * bi / tms.x[0]);
          state.h1O[base] = (state.h1O[base] - bo * delta) * e + (e - 1.0) * (ao * t + 1.0e12 * bo / tms.x[0]);
        } else {
          for (let i = 0; i < 3; i++) {
            const e = state.h1e[base + i];
            const t = tms.c[i] / tms.x[i];
            // ngspice multiplies the slopes cumulatively across the three terms.
            bi *= t;
            bo *= t;
            state.h1I[base + i] = (state.h1I[base + i] - bi * delta) * e
              + (e - 1.0) * (ai * t + 1.0e12 * bi / tms.x[i]);
            state.h1O[base + i] = (state.h1O[base + i] - bo * delta) * e
              + (e - 1.0) * (ao * t + 1.0e12 * bo / tms.x[i]);
          }
        }
      }
    }
  }

  /** ngspice update_delayed_cnv: add the in-step part of modal delays shorter than the step. */
  private updateDelayedConvolution(delta: number): void {
    const n = this.lines;
    const h = delta * 0.5e-12;
    const state = this.committed;
    const tail = this.history.tail();
    for (let k = 0; k < n; k++) {
      const ratio = state.ratio[k];
      if (!(ratio > 0)) continue;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const index = (i * n + j) * n + k;
          const base = index * 3;
          const voltageTerms = this.coefficients.h3[index];
          if (!voltageTerms) continue;
          let f = h * ratio * this.history.vIn(tail, j);
          for (let t = 0; t < 3; t++) state.h3I[base + t] += f * voltageTerms.c[t];
          f = h * ratio * this.history.vOut(tail, j);
          for (let t = 0; t < 3; t++) state.h3O[base + t] += f * voltageTerms.c[t];
          const currentTerms = this.coefficients.h2[index]!;
          f = h * ratio * this.history.iIn(tail, j);
          for (let t = 0; t < 3; t++) state.h2I[base + t] += f * currentTerms.c[t];
          f = h * ratio * this.history.iOut(tail, j);
          for (let t = 0; t < 3; t++) state.h2O[base + t] += f * currentTerms.c[t];
        }
      }
    }
  }
}

/** Steady-state convolution of a constant `dcIn` / `dcOut` (ngspice CPLload dc setup). */
function initialiseTerms(
  tms: CplTerms, I: Float64Array, O: Float64Array, base: number, dcIn: number, dcOut: number,
): void {
  if (tms.ifImg) {
    I[base] = -dcIn * tms.c[0] / tms.x[0];
    O[base] = -dcOut * tms.c[0] / tms.x[0];
    const t = tms.x[1] * tms.x[1] + tms.x[2] * tms.x[2];
    const a = (tms.c[1] * tms.x[1] + tms.c[2] * tms.x[2]) / t;
    const b = (tms.c[2] * tms.x[1] - tms.c[1] * tms.x[2]) / t;
    I[base + 1] = -dcIn * a;
    O[base + 1] = -dcOut * a;
    I[base + 2] = -dcIn * b;
    O[base + 2] = -dcOut * b;
    return;
  }
  for (let k = 0; k < 3; k++) {
    I[base + k] = -dcIn * tms.c[k] / tms.x[k];
    O[base + k] = -dcOut * tms.c[k] / tms.x[k];
  }
}

/** ngspice update_cnv_a: trapezoidal advance of a complex admittance pole pair. */
function updateComplexHistory(
  state: CplState,
  tms: CplTerms,
  base: number,
  delta: number,
  ai: number,
  ao: number,
  bi: number,
  bo: number,
  er: number,
  ei: number,
): void {
  const h = delta * 0.5e-12;
  const a1 = tms.c[1] * er - tms.c[2] * ei;
  const b1 = tms.c[1] * ei + tms.c[2] * er;
  let a = state.h1I[base + 1] * er - state.h1I[base + 2] * ei;
  let b = state.h1I[base + 1] * ei + state.h1I[base + 2] * er;
  state.h1I[base + 1] = a + h * (a1 * bi + ai * tms.c[1]);
  state.h1I[base + 2] = b + h * (b1 * bi + ai * tms.c[2]);
  a = state.h1O[base + 1] * er - state.h1O[base + 2] * ei;
  b = state.h1O[base + 1] * ei + state.h1O[base + 2] * er;
  state.h1O[base + 1] = a + h * (a1 * bo + ao * tms.c[1]);
  state.h1O[base + 2] = b + h * (b1 * bo + ao * tms.c[2]);
}

function voltage(ctx: StampContext, node: number): number {
  return node >= 0 ? ctx.getVoltage(node) : 0;
}
