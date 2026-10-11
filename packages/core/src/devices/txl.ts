import { InvalidCircuitError } from '../errors.js';
import { DEVICE_GMIN, type DeviceModel, type StampContext } from './device.js';
import {
  SwecHistory,
  addConductance,
  maxStepAfterDelay,
  swecGmin,
  swecTimePs,
} from './swec-history.js';

/**
 * ngspice-47 TXL (Y-element) single lossy transmission line.
 *
 * A literal port of ngspice-47 `src/spicelib/devices/txl` (txlsetup.c and
 * txlload.c, Charles Hough 1992): the characteristic admittance and the
 * propagation function are fitted with third-order Pade approximants whose
 * poles are convolved recursively with the delayed port history. Every
 * numerical quirk of the reference is kept on purpose (integer-picosecond
 * history timestamps, the cumulative slope factor in `update_cnv_txl`, the
 * lossless short-cut below R/L = 5e5), because parity with ngspice is the
 * acceptance criterion, not a cleaner transmission-line model.
 */

/** Pade/recursive-convolution coefficients computed by ngspice ReadTxL. */
export interface TxlCoefficients {
  /** ngspice `lsl`: R/L < 5e5 and G < 1e-2, simulated as a lossless line. */
  readonly lossless: boolean;
  /** ngspice `ifImg`: the propagation function has a complex pole pair. */
  readonly ifImg: boolean;
  /** One-way delay in picoseconds (ngspice `taul`). */
  readonly taul: number;
  readonly sqtCdL: number;
  readonly h1C: number;
  readonly h2Aten: number;
  readonly h3Aten: number;
  /** Characteristic-admittance poles: residues and poles (3 terms). */
  readonly h1c: Float64Array;
  readonly h1x: Float64Array;
  /** Propagation-function poles (3 terms). */
  readonly h2c: Float64Array;
  readonly h2x: Float64Array;
  /** Delayed-admittance poles (6 terms). */
  readonly h3c: Float64Array;
  readonly h3x: Float64Array;
}

/** Thrown where ngspice-47 aborts TXL setup (controlled_exit) or rejects the model. */
function txlError(message: string): InvalidCircuitError {
  return new InvalidCircuitError(`TXL: ${message}`);
}

const ABS = (value: number): number => (value >= 0 ? value : -value);

/** Gaussian_Elimination1/2 of txlsetup.c on a 3x4 augmented system, in place. */
function gaussianElimination(A: number[][], epsilon: number): void {
  const dim = 3;
  for (let i = 0; i < dim; i++) {
    let imax = i;
    let max = ABS(A[i][i]);
    for (let j = i + 1; j < dim; j++) {
      if (ABS(A[j][i]) > max) {
        imax = j;
        max = ABS(A[j][i]);
      }
    }
    if (!(max >= epsilon)) {
      throw txlError('Gaussian elimination fails during setup of TXL; check the model parameters');
    }
    if (imax !== i) {
      for (let k = i; k <= dim; k++) {
        const swap = A[i][k];
        A[i][k] = A[imax][k];
        A[imax][k] = swap;
      }
    }
    let f = 1 / A[i][i];
    A[i][i] = 1;
    for (let j = i + 1; j <= dim; j++) A[i][j] *= f;
    for (let j = 0; j < dim; j++) {
      if (i === j) continue;
      f = A[j][i];
      A[j][i] = 0;
      for (let k = i + 1; k <= dim; k++) A[j][k] -= f * A[i][k];
    }
  }
}

function eval2(a: number, b: number, c: number, x: number): number {
  return a * x * x + b * x + c;
}

function root3(a1: number, a2: number, a3: number, x: number): number {
  const t1 = x * x * x + a1 * x * x + a2 * x + a3;
  const t2 = 3 * x * x + 2 * a1 * x + a2;
  return x - t1 / t2;
}

/** Real root of x^3 + a1 x^2 + a2 x + a3 (Cardano start, bounded Newton polish). */
function firstCubicRoot(a1: number, a2: number, a3: number): number {
  const q = (a1 * a1 - 3 * a2) / 9;
  const p = (2 * a1 * a1 * a1 - 9 * a1 * a2 + 27 * a3) / 54;
  let t = q * q * q - p * p;
  let x: number;
  if (t >= 0) {
    t = Math.acos(p / (q * Math.sqrt(q)));
    x = -2 * Math.sqrt(q) * Math.cos(t / 3) - a1 / 3;
  } else if (p > 0) {
    t = Math.pow(Math.sqrt(-t) + p, 1 / 3);
    x = -(t + q / t) - a1 / 3;
  } else if (p === 0) {
    x = -a1 / 3;
  } else {
    t = Math.pow(Math.sqrt(-t) - p, 1 / 3);
    x = (t + q / t) - a1 / 3;
  }
  const backup = x;
  let iterations = 0;
  for (t = root3(a1, a2, a3, x); ABS(t - x) > 5.0e-4; t = root3(a1, a2, a3, x)) {
    if (++iterations === 32) {
      x = backup;
      break;
    }
    x = t;
  }
  return x;
}

/** ngspice `mac`: Maclaurin coefficients of sqrt((1 + a z) / (1 + b z)). */
function maclaurin(a: number, b: number): [number, number, number, number, number] {
  const y1 = 0.5 * (a - b);
  const y2 = 0.5 * (3 * b * b - 2 * a * b - a * a) * y1 / (a - b);
  const y3 = ((3 * b * b + a * a) * y1 * y1 + 0.5 * (3 * b * b
    - 2 * a * b - a * a) * y2) / (a - b);
  const y4 = ((3 * b * b - 3 * a * a) * y1 * y1 * y1 + (9 * b * b
    + 3 * a * a) * y1 * y2 + 0.5 * (3 * b * b - 2 * a * b
    - a * a) * y3) / (a - b);
  const y5 = (12 * a * a * y1 * y1 * y1 * y1 + y1 * y1 * y2 * (
    18 * b * b - 18 * a * a) + (9 * b * b + 3 * a * a)
    * (y2 * y2 + y1 * y3) + (3 * b * b + a * a) * y1 * y3
    + 0.5 * (3 * b * b - 2 * a * b - a * a) * y4) / (a - b);
  return [y1, y2 / 2, y3 / 6, y4 / 24, y5 / 120];
}

interface MutableCoefficients {
  ifImg: boolean;
  taul: number;
  sqtCdL: number;
  h2Aten: number;
  h3Aten: number;
  h1c: Float64Array;
  h1x: Float64Array;
  h2c: Float64Array;
  h2x: Float64Array;
  h3c: Float64Array;
  h3x: Float64Array;
}

/** ngspice `y_pade`: Pade approximation of the characteristic admittance Y(s). */
function yPade(R: number, L: number, G: number, C: number, h: MutableCoefficients): void {
  const sqtCdL = Math.sqrt(C / L);
  const RdL = R / L;
  const GdC = G / C;
  const [b1, b2, b3, b4, b5] = maclaurin(GdC, RdL);
  const A = [
    [1 - Math.sqrt(GdC / RdL), b1, b2, -b3],
    [b1, b2, b3, -b4],
    [b2, b3, b4, -b5],
  ];
  gaussianElimination(A, 1.0e-16);
  const p3 = A[0][3];
  const p2 = A[1][3];
  const p1 = A[2][3];
  const q1 = p1 + b1;
  const q2 = b1 * p1 + p2 + b2;
  const q3 = p3 * Math.sqrt(GdC / RdL);

  // find_roots: the characteristic admittance must have three real poles.
  const x1 = firstCubicRoot(p1, p2, p3);
  const d1 = p1 + x1;
  const d2 = -p3 / x1;
  let t = d1 * d1 - 4 * d2;
  if (t < 0) throw txlError('two imaginary roots in the characteristic admittance');
  t *= 1.0e-18;
  t = Math.sqrt(t) * 1.0e9;
  const x2 = d1 >= 0 ? -0.5 * (d1 + t) : -0.5 * (d1 - t);
  const x3 = d2 / x2;

  h.sqtCdL = sqtCdL;
  const poles = [x1, x2, x3];
  for (let i = 0; i < 3; i++) {
    h.h1x[i] = poles[i];
    h.h1c[i] = eval2(q1 - p1, q2 - p2, q3 - p3, poles[i]) / eval2(3, 2 * p1, p2, poles[i]);
  }
}

function getComplexResidue(
  eq1: number, eq2: number, eq3: number, ep1: number, ep2: number, a: number, b: number,
): [number, number] {
  let d = (3 * (a * a - b * b) + 2 * ep1 * a + ep2) * (3 * (a * a - b * b) + 2 * ep1 * a + ep2);
  d += (6 * a * b + 2 * ep1 * b) * (6 * a * b + 2 * ep1 * b);
  let n = -(eq1 * (a * a - b * b) + eq2 * a + eq3) * (6 * a * b + 2 * ep1 * b);
  n += (2 * eq1 * a * b + eq2 * b) * (3 * (a * a - b * b) + 2 * ep1 * a + ep2);
  const ci = n / d;
  n = (3 * (a * a - b * b) + 2 * ep1 * a + ep2) * (eq1 * (a * a - b * b) + eq2 * a + eq3);
  n += (6 * a * b + 2 * ep1 * b) * (2 * eq1 * a * b + eq2 * b);
  return [n / d, ci];
}

/** ngspice `exp_pade` + `pade`: Pade approximation of the propagation function. */
function expPade(R: number, L: number, G: number, C: number, l: number, h: MutableCoefficients): void {
  const tau = Math.sqrt(L * C);
  const RdL = R / L;
  const GdC = G / C;
  const RG = R * G;
  const a = RdL;
  const b = GdC;
  const t = tau;
  const y1 = 0.5 * (a + b);
  const y2 = a * b - y1 * y1;
  const y3 = -3 * y1 * y2;
  const y4 = -3 * y2 * y2 - 4 * y1 * y3;
  const y5 = -5 * y1 * y4 - 10 * y2 * y3;
  const y6 = -10 * y3 * y3 - 15 * y2 * y4 - 6 * y1 * y5;
  const a0 = y1 * t * l;
  const series = [
    0,
    -(y2 * t * t / 2 * l),
    -(y3 * t * t * t / 6 * l),
    -(y4 * t * t * t * t / 24 * l),
    -(y5 * t * t * t * t * t / 120 * l),
    -(y6 * t * t * t * t * t * t / 720 * l),
  ];

  const bb = [1, series[1], 0, 0, 0, 0];
  for (let i = 2; i <= 5; i++) {
    bb[i] = 0;
    for (let j = 1; j <= i; j++) bb[i] += j * series[j] * bb[i - j];
    bb[i] = bb[i] / i;
  }
  const lossFactor = Math.exp(a0 - l * Math.sqrt(RG));
  const AA = [
    [1 - lossFactor, bb[1], bb[2], -bb[3]],
    [bb[1], bb[2], bb[3], -bb[4]],
    [bb[2], bb[3], bb[4], -bb[5]],
  ];
  gaussianElimination(AA, 1.0e-28);
  let ep3 = AA[0][3];
  let ep2 = AA[1][3];
  let ep1 = AA[2][3];
  let eq1 = ep1 + bb[1];
  let eq2 = bb[1] * ep1 + ep2 + bb[2];
  let eq3 = ep3 * lossFactor;
  ep3 = ep3 / (tau * tau * tau);
  ep2 = ep2 / (tau * tau);
  ep1 = ep1 / tau;
  eq3 = eq3 / (tau * tau * tau);
  eq2 = eq2 / (tau * tau);
  eq1 = eq1 / tau;

  // exp_find_roots
  const ex1 = firstCubicRoot(ep1, ep2, ep3);
  const d1 = ep1 + ex1;
  const d2 = -ep3 / ex1;
  let disc = d1 * d1 - 4 * d2;
  let ex2: number;
  let ex3: number;
  if (disc < 0) {
    h.ifImg = true;
    ex3 = 0.5 * Math.sqrt(-disc);
    ex2 = -0.5 * d1;
  } else {
    h.ifImg = false;
    disc *= 1.0e-16;
    disc = Math.sqrt(disc) * 1.0e8;
    ex2 = d1 >= 0 ? -0.5 * (d1 + disc) : -0.5 * (d1 - disc);
    ex3 = d2 / ex2;
  }

  const ec1 = eval2(eq1 - ep1, eq2 - ep2, eq3 - ep3, ex1) / eval2(3, 2 * ep1, ep2, ex1);
  let ec2: number;
  let ec3: number;
  if (h.ifImg) {
    [ec2, ec3] = getComplexResidue(eq1 - ep1, eq2 - ep2, eq3 - ep3, ep1, ep2, ex2, ex3);
  } else {
    ec2 = eval2(eq1 - ep1, eq2 - ep2, eq3 - ep3, ex2) / eval2(3, 2 * ep1, ep2, ex2);
    ec3 = eval2(eq1 - ep1, eq2 - ep2, eq3 - ep3, ex3) / eval2(3, 2 * ep1, ep2, ex3);
  }

  h.taul = tau * l;
  h.h2Aten = Math.exp(-a0);
  h.h2c.set([ec1, ec2, ec3]);
  h.h2x.set([ex1, ex2, ex3]);
}

function divComplex(ar: number, ai: number, br: number, bi: number): [number, number] {
  let cr = ar * br + ai * bi;
  let ci = -ar * bi + ai * br;
  cr = cr / (br * br + bi * bi);
  ci = ci / (br * br + bi * bi);
  return [cr, ci];
}

/** ngspice `get_h3`: partial fractions of the delayed admittance Y(s) e^{-sT}. */
function getH3(h: MutableCoefficients): void {
  h.h3Aten = h.h2Aten * h.sqtCdL;
  const [xx1, xx2, xx3] = h.h1x;
  const [xx4, xx5, xx6] = h.h2x;
  h.h3x.set([xx1, xx2, xx3, xx4, xx5, xx6]);
  const [cc1, cc2, cc3] = h.h1c;
  const [cc4, cc5, cc6] = h.h2c;
  if (h.ifImg) {
    h.h3c[0] = cc1 + cc1 * (cc4 / (xx1 - xx4)
      + 2.0 * (cc5 * xx1 - xx6 * cc6 - xx5 * cc5) / (xx1 * xx1 - 2.0 * xx5 * xx1 + xx5 * xx5 + xx6 * xx6));
    h.h3c[1] = cc2 + cc2 * (cc4 / (xx2 - xx4)
      + 2.0 * (cc5 * xx2 - xx6 * cc6 - xx5 * cc5) / (xx2 * xx2 - 2.0 * xx5 * xx2 + xx5 * xx5 + xx6 * xx6));
    h.h3c[2] = cc3 + cc3 * (cc4 / (xx3 - xx4)
      + 2.0 * (cc5 * xx3 - xx6 * cc6 - xx5 * cc5) / (xx3 * xx3 - 2.0 * xx5 * xx3 + xx5 * xx5 + xx6 * xx6));
    h.h3c[3] = cc4 + cc4 * (cc1 / (xx4 - xx1) + cc2 / (xx4 - xx2) + cc3 / (xx4 - xx3));
    h.h3c[4] = cc5;
    h.h3c[5] = cc6;
    for (const [cc, xx] of [[cc1, xx1], [cc2, xx2], [cc3, xx3]] as const) {
      const [r, i] = divComplex(cc5, cc6, xx5 - xx, xx6);
      h.h3c[4] += r * cc;
      h.h3c[5] += i * cc;
    }
  } else {
    h.h3c[0] = cc1 + cc1 * (cc4 / (xx1 - xx4) + cc5 / (xx1 - xx5) + cc6 / (xx1 - xx6));
    h.h3c[1] = cc2 + cc2 * (cc4 / (xx2 - xx4) + cc5 / (xx2 - xx5) + cc6 / (xx2 - xx6));
    h.h3c[2] = cc3 + cc3 * (cc4 / (xx3 - xx4) + cc5 / (xx3 - xx5) + cc6 / (xx3 - xx6));
    h.h3c[3] = cc4 + cc4 * (cc1 / (xx4 - xx1) + cc2 / (xx4 - xx2) + cc3 / (xx4 - xx3));
    h.h3c[4] = cc5 + cc5 * (cc1 / (xx5 - xx1) + cc2 / (xx5 - xx2) + cc3 / (xx5 - xx3));
    h.h3c[5] = cc6 + cc6 * (cc1 / (xx6 - xx1) + cc2 / (xx6 - xx2) + cc3 / (xx6 - xx3));
  }
}

/**
 * ngspice ReadTxL: coefficients for a line with per-length R, L, G, C and
 * total length `length` (ngspice clamps L to at least 1e-12).
 */
export function computeTxlCoefficients(
  R: number, inductance: number, G: number, C: number, length: number,
): TxlCoefficients {
  const L = Math.max(inductance, 1e-12);
  if (length === 0) throw txlError('transmission line of zero length');
  const h: MutableCoefficients = {
    ifImg: false,
    taul: 0,
    sqtCdL: 0,
    h2Aten: 0,
    h3Aten: 0,
    h1c: new Float64Array(3),
    h1x: new Float64Array(3),
    h2c: new Float64Array(3),
    h2x: new Float64Array(3),
    h3c: new Float64Array(6),
    h3x: new Float64Array(6),
  };
  if (R / L < 5.0e5 && G < 1.0e-2) {
    const sqtCdL = Math.sqrt(C / L);
    return {
      lossless: true,
      ifImg: false,
      taul: Math.sqrt(C * L) * length * 1.0e12,
      sqtCdL,
      h1C: 0,
      h2Aten: 1,
      h3Aten: sqtCdL,
      h1c: h.h1c, h1x: h.h1x, h2c: h.h2c, h2x: h.h2x, h3c: h.h3c, h3x: h.h3x,
    };
  }

  // main_pade
  yPade(R, L, G, C, h);
  expPade(R, L, G, C, length, h);
  getH3(h);
  h.taul *= 1.0e12;
  // update_h1C_c
  let h1C = 0;
  for (let i = 0; i < 3; i++) {
    h.h1c[i] *= h.sqtCdL;
    h1C += h.h1c[i];
  }
  for (let i = 0; i < 3; i++) h.h2c[i] *= h.h2Aten;
  for (let i = 0; i < 6; i++) h.h3c[i] *= h.h3Aten;

  const coefficients: TxlCoefficients = { lossless: false, h1C, ...h };
  const finite = [coefficients.taul, coefficients.sqtCdL, coefficients.h1C, coefficients.h2Aten,
    coefficients.h3Aten, ...h.h1c, ...h.h1x, ...h.h2c, ...h.h2x, ...h.h3c, ...h.h3x];
  if (!finite.every(Number.isFinite)) {
    throw txlError('the Pade approximation of this R/L/G/C line is not finite');
  }
  return coefficients;
}

/** Convolution state that ngspice keeps per line (TERM.cnv_i / cnv_o, h1e, ext, ratio). */
class TxlState {
  /** cnv_i / cnv_o for h1 (0..2), h2 (3..5), h3 (6..11). */
  readonly cnvI = new Float64Array(12);
  readonly cnvO = new Float64Array(12);
  readonly h1e = new Float64Array(3);
  ext = false;
  ratio = 0;

  copyFrom(other: TxlState): void {
    this.cnvI.set(other.cnvI);
    this.cnvO.set(other.cnvO);
    this.h1e.set(other.h1e);
    this.ext = other.ext;
    this.ratio = other.ratio;
  }

  reset(): void {
    this.cnvI.fill(0);
    this.cnvO.fill(0);
    this.h1e.fill(0);
    this.ext = false;
    this.ratio = 0;
  }
}

const H2 = 3;
const H3 = 6;

/** Matrix and right-hand side of one transient load (ngspice TXLload). */
interface TxlLoad {
  /** Step from the last committed history point (ngspice CKTdelta). */
  h: number;
  ff: number;
  gg: number;
  /** ibr1/neg and ibr2/pos coupling (ngspice TXLibr1NegPtr). */
  delayedVoltage: number;
  /** ibr1/ibr2 coupling (ngspice TXLibr1Ibr2Ptr). */
  delayedCurrent: number;
}

/**
 * Y-element instance. Branch 1 is the current into the line at the first
 * port, branch 2 the current into the line at the second port (ngspice
 * `branch1` / `branch2`). Both ports are referenced to ground, as in ngspice:
 * the reference nodes of the Y card are ignored.
 */
export class TxlLine implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;
  private readonly committed = new TxlState();
  private readonly trial = new TxlState();
  private readonly history = new SwecHistory(1);
  private trialKey: [number, number] = [Number.NaN, -1];
  private readonly load: TxlLoad = { h: 0, ff: 0, gg: 0, delayedVoltage: 0, delayedCurrent: 0 };
  private commits = 0;
  /** Exact time (s) of the newest history record. */
  private commitTime = 0;
  private dc1 = 0;
  private dc2 = 0;
  private inV = 0;
  private outV = 0;
  private inDv = 0;
  private outDv = 0;
  private maxStep = Infinity;
  private readonly taul: Float64Array;
  private readonly dcIn = new Float64Array(1);
  private readonly dcOut = new Float64Array(1);

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branch1: number,
    readonly branch2: number,
    readonly coefficients: TxlCoefficients,
    /** DC series resistance R * length (ngspice TXLload MODEDC). */
    readonly dcResistance: number,
  ) {
    this.branches = [branch1, branch2];
    this.taul = Float64Array.of(coefficients.taul);
  }

  stamp(ctx: StampContext): void {
    const [pos, neg] = this.nodes;
    const b1 = ctx.numNodes + this.branch1;
    const b2 = ctx.numNodes + this.branch2;
    const gmin = swecGmin(ctx.gmin ?? DEVICE_GMIN);
    addConductance(ctx, pos, pos, gmin);
    addConductance(ctx, neg, neg, gmin);
    addConductance(ctx, neg, pos, gmin);
    addConductance(ctx, pos, neg, gmin);

    if (ctx.dt === 0) {
      addConductance(ctx, pos, b1, 1);
      addConductance(ctx, neg, b2, 1);
      ctx.stampG(b1, b1, 1);
      ctx.stampG(b1, b2, 1);
      addConductance(ctx, b2, pos, 1);
      addConductance(ctx, b2, neg, -1);
      ctx.stampG(b2, b1, -this.dcResistance);
      // Register the transient pattern before the sparse topology locks.
      ctx.stampG(b2, b2, 0);
      addConductance(ctx, b1, pos, 0);
      addConductance(ctx, b1, neg, 0);
      return;
    }

    const coefficients = this.coefficients;
    if (!coefficients.lossless && ctx.dt * 1e12 > coefficients.taul) {
      this.maxStep = Math.min(this.maxStep, maxStepAfterDelay(coefficients.taul));
    }
    if (this.history.length === 0) this.setupDc(ctx);
    this.evaluateLoad(ctx.time);

    const admittance = coefficients.sqtCdL + 0.5 * this.load.h * coefficients.h1C;
    ctx.stampG(b1, b1, -1);
    ctx.stampG(b2, b2, -1);
    addConductance(ctx, pos, b1, 1);
    addConductance(ctx, neg, b2, 1);
    addConductance(ctx, b1, pos, admittance);
    addConductance(ctx, b2, neg, admittance);
    addConductance(ctx, b1, neg, this.load.delayedVoltage);
    addConductance(ctx, b2, pos, this.load.delayedVoltage);
    ctx.stampG(b1, b2, this.load.delayedCurrent);
    ctx.stampG(b2, b1, this.load.delayedCurrent);
    ctx.stampB(b1, this.load.ff);
    ctx.stampB(b2, this.load.gg);
  }

  /** ngspice TXLload sets CKTmaxStep to 0.9 tau once a step exceeds a lossy line's delay. */
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
    const [pos, neg] = this.nodes;
    // ngspice: copy_tx(tx, tx2) then add_new_vi_txl at the next load.
    this.evaluateLoad(ctx.time);
    this.committed.copyFrom(this.trial);
    const previousIn = this.history.vIn(this.history.tail(), 0);
    const previousOut = this.history.vOut(this.history.tail(), 0);
    this.history.push(
      time,
      [voltage(ctx, pos)],
      [voltage(ctx, neg)],
      [ctx.getCurrent(this.branch1)],
      [ctx.getCurrent(this.branch2)],
    );
    this.commits++;
    this.commitTime = ctx.time;
    const delta = time - before;
    this.inV = voltage(ctx, pos);
    this.inDv = (this.inV - previousIn) / delta;
    this.outV = voltage(ctx, neg);
    this.outDv = (this.outV - previousOut) / delta;
    if (this.coefficients.lossless) {
      this.history.trimBefore(time - this.coefficients.taul);
      return;
    }
    this.updateConvolution(delta);
    if (this.committed.ext) this.updateDelayedConvolution(delta);
    this.history.trimBefore(time - this.coefficients.taul);
  }

  resetTransient(): void {
    this.history.clear();
    this.committed.reset();
    this.trial.reset();
    this.trialKey = [Number.NaN, -1];
    this.commits = 0;
    this.commitTime = 0;
    this.dc1 = 0;
    this.dc2 = 0;
    this.inV = 0;
    this.outV = 0;
    this.inDv = 0;
    this.outDv = 0;
    this.maxStep = Infinity;
  }

  /** ngspice TXLload "dc setup" at the first transient load (CKTrhsOld = operating point). */
  private setupDc(ctx: StampContext): void {
    const [pos, neg] = this.nodes;
    this.dc1 = voltage(ctx, pos);
    this.dc2 = voltage(ctx, neg);
    this.inV = this.dc1;
    this.outV = this.dc2;
    this.inDv = 0;
    this.outDv = 0;
    this.committed.reset();
    this.history.clear();
    this.history.push(0, [this.dc1], [this.dc2], [ctx.getCurrent(this.branch1)], [ctx.getCurrent(this.branch2)]);
    this.commits++;
    this.commitTime = 0;
    if (this.coefficients.lossless) return;
    const { h1c, h1x, h3c, h3x } = this.coefficients;
    const { cnvI, cnvO } = this.committed;
    for (let i = 0; i < 3; i++) {
      cnvI[i] = -this.dc1 * h1c[i] / h1x[i];
      cnvO[i] = -this.dc2 * h1c[i] / h1x[i];
    }
    for (let i = 0; i < 6; i++) {
      cnvI[H3 + i] = -this.dc1 * h3c[i] / h3x[i];
      cnvO[H3 + i] = -this.dc2 * h3c[i] / h3x[i];
    }
  }

  /**
   * ngspice right_consts_txl on a copy of the committed state (copy_tx(tx2,
   * tx)). The step `h` is measured from the last committed history point.
   * That equals ngspice's CKTdelta whenever every accepted step advances the
   * integer-picosecond clock; when a sub-picosecond step leaves the clock
   * unchanged ngspice drops that step's convolution update, whereas here the
   * next committed step integrates over the whole span.
   */
  private evaluateLoad(time: number): void {
    const key = this.trialKey;
    if (key[0] === time && key[1] === this.commits) return;
    this.trialKey = [time, this.commits];
    const trial = this.trial;
    trial.copyFrom(this.committed);
    const coefficients = this.coefficients;
    const h = time - this.commitTime;
    this.load.h = h;
    const h1 = 0.5 * h;
    const t1 = this.history.tailTime();
    const t2 = swecTimePs(time);
    let ff = 0;
    let gg = 0;
    const { cnvI, cnvO } = trial;

    if (!coefficients.lossless) {
      let ff1 = 0;
      for (let i = 0; i < 3; i++) {
        const e = Math.exp(coefficients.h1x[i] * h);
        trial.h1e[i] = e;
        ff1 -= coefficients.h1c[i] * e;
        ff -= cnvI[i] * e;
        gg -= cnvO[i] * e;
      }
      ff += ff1 * h1 * this.inV;
      gg += ff1 * h1 * this.outV;
    }

    this.dcIn[0] = this.dc1;
    this.dcOut[0] = this.dc2;
    const delayed = this.history.delayed(t1, t2, this.taul, this.dcIn, this.dcOut);
    const v1i = delayed.v1i[0];
    const v2i = delayed.v2i[0];
    const i1i = delayed.i1i[0];
    const i2i = delayed.i2i[0];
    const v1o = delayed.v1o[0];
    const v2o = delayed.v2o[0];
    const i1o = delayed.i1o[0];
    const i2o = delayed.i2o[0];

    if (coefficients.lossless) {
      ff = coefficients.h3Aten * v2o + coefficients.h2Aten * i2o;
      gg = coefficients.h3Aten * v2i + coefficients.h2Aten * i2i;
    } else if (coefficients.ifImg) {
      for (let i = 0; i < 4; i++) {
        const e = Math.exp(coefficients.h3x[i] * h);
        const c = coefficients.h3c[i];
        cnvI[H3 + i] = cnvI[H3 + i] * e + h1 * c * (v1i * e + v2i);
        cnvO[H3 + i] = cnvO[H3 + i] * e + h1 * c * (v1o * e + v2o);
      }
      updateComplexPair(cnvI, cnvO, H3 + 4, coefficients.h3c, coefficients.h3x, 4, h, h1,
        v1i, v2i, v1o, v2o);
      ff += coefficients.h3Aten * v2o;
      gg += coefficients.h3Aten * v2i;
      for (let i = 0; i < 5; i++) {
        ff += cnvO[H3 + i];
        gg += cnvI[H3 + i];
      }
      ff += cnvO[H3 + 4];
      gg += cnvI[H3 + 4];

      const e = Math.exp(coefficients.h2x[0] * h);
      const c = coefficients.h2c[0];
      cnvI[H2] = cnvI[H2] * e + h1 * c * (i1i * e + i2i);
      cnvO[H2] = cnvO[H2] * e + h1 * c * (i1o * e + i2o);
      updateComplexPair(cnvI, cnvO, H2 + 1, coefficients.h2c, coefficients.h2x, 1, h, h1,
        i1i, i2i, i1o, i2o);
      ff += coefficients.h2Aten * i2o + cnvO[H2] + 2.0 * cnvO[H2 + 1];
      gg += coefficients.h2Aten * i2i + cnvI[H2] + 2.0 * cnvI[H2 + 1];
    } else {
      for (let i = 0; i < 6; i++) {
        const e = Math.exp(coefficients.h3x[i] * h);
        const c = coefficients.h3c[i];
        cnvI[H3 + i] = cnvI[H3 + i] * e + h1 * c * (v1i * e + v2i);
        cnvO[H3 + i] = cnvO[H3 + i] * e + h1 * c * (v1o * e + v2o);
      }
      ff += coefficients.h3Aten * v2o;
      gg += coefficients.h3Aten * v2i;
      for (let i = 0; i < 6; i++) {
        ff += cnvO[H3 + i];
        gg += cnvI[H3 + i];
      }
      for (let i = 0; i < 3; i++) {
        const e = Math.exp(coefficients.h2x[i] * h);
        const c = coefficients.h2c[i];
        cnvI[H2 + i] = cnvI[H2 + i] * e + h1 * c * (i1i * e + i2i);
        cnvO[H2 + i] = cnvO[H2 + i] * e + h1 * c * (i1o * e + i2o);
      }
      ff += coefficients.h2Aten * i2o;
      gg += coefficients.h2Aten * i2i;
      for (let i = 0; i < 3; i++) {
        ff += cnvO[H2 + i];
        gg += cnvI[H2 + i];
      }
    }

    const load = this.load;
    load.ff = ff;
    load.gg = gg;
    load.delayedVoltage = 0;
    load.delayedCurrent = 0;
    const ratio = delayed.ratio[0];
    if (delayed.ext) {
      if (coefficients.lossless) {
        load.delayedVoltage = -ratio * coefficients.h3Aten;
        load.delayedCurrent = -ratio * coefficients.h2Aten;
      } else {
        trial.ext = true;
        trial.ratio = ratio;
        if (ratio > 0) {
          let h3Sum = 0;
          for (let i = 0; i < 6; i++) h3Sum += coefficients.h3c[i];
          let h2Sum = 0;
          for (let i = 0; i < 3; i++) h2Sum += coefficients.h2c[i];
          load.delayedVoltage = -ratio * (h1 * h3Sum + coefficients.h3Aten);
          load.delayedCurrent = -ratio * (h1 * h2Sum + coefficients.h2Aten);
        }
      }
    } else if (!coefficients.lossless) {
      trial.ext = false;
    }
  }

  /** ngspice update_cnv_txl: advance the h1 (admittance) convolutions by `delta` ps. */
  private updateConvolution(delta: number): void {
    const { h1c, h1x } = this.coefficients;
    const { cnvI, cnvO, h1e } = this.committed;
    const ai = this.inV;
    const ao = this.outV;
    let bi = this.inDv;
    let bo = this.outDv;
    for (let i = 0; i < 3; i++) {
      const e = h1e[i];
      const t = h1c[i] / h1x[i];
      // ngspice multiplies the slopes cumulatively across the three terms.
      bi *= t;
      bo *= t;
      cnvI[i] = (cnvI[i] - bi * delta) * e + (e - 1.0) * (ai * t + 1.0e12 * bi / h1x[i]);
      cnvO[i] = (cnvO[i] - bo * delta) * e + (e - 1.0) * (ao * t + 1.0e12 * bo / h1x[i]);
    }
  }

  /** ngspice update_delayed_cnv_txl: add the in-step part of a delay shorter than the step. */
  private updateDelayedConvolution(delta: number): void {
    const h = delta * 0.5e-12;
    const ratio = this.committed.ratio;
    if (!(ratio > 0)) return;
    const tail = this.history.tail();
    const { h2c, h3c } = this.coefficients;
    const { cnvI, cnvO } = this.committed;
    let f = h * ratio * this.history.vIn(tail, 0);
    for (let i = 0; i < 6; i++) cnvI[H3 + i] += f * h3c[i];
    f = h * ratio * this.history.vOut(tail, 0);
    for (let i = 0; i < 6; i++) cnvO[H3 + i] += f * h3c[i];
    f = h * ratio * this.history.iIn(tail, 0);
    for (let i = 0; i < 3; i++) cnvI[H2 + i] += f * h2c[i];
    f = h * ratio * this.history.iOut(tail, 0);
    for (let i = 0; i < 3; i++) cnvO[H2 + i] += f * h2c[i];
  }
}

/**
 * Advance a complex-conjugate pole pair stored as (real, imaginary) terms at
 * `offset` / `offset + 1` (ngspice expC + multC sequence in right_consts).
 */
export function updateComplexPair(
  cnvI: Float64Array,
  cnvO: Float64Array,
  offset: number,
  c: Float64Array,
  x: Float64Array,
  index: number,
  h: number,
  h1: number,
  v1i: number,
  v2i: number,
  v1o: number,
  v2o: number,
): void {
  const e = Math.exp(x[index] * h);
  const er = e * Math.cos(x[index + 1] * h);
  const ei = e * Math.sin(x[index + 1] * h);
  const a2 = h1 * c[index];
  const b2 = h1 * c[index + 1];

  let a = cnvI[offset];
  let b = cnvI[offset + 1];
  let tp = a * er - b * ei;
  b = a * ei + b * er;
  a = tp;
  let br = v1i * er + v2i;
  let bim = v1i * ei;
  tp = a2 * br - b2 * bim;
  let b1 = a2 * bim + b2 * br;
  cnvI[offset] = a + tp;
  cnvI[offset + 1] = b + b1;

  a = cnvO[offset];
  b = cnvO[offset + 1];
  tp = a * er - b * ei;
  b = a * ei + b * er;
  a = tp;
  br = v1o * er + v2o;
  bim = v1o * ei;
  tp = a2 * br - b2 * bim;
  b1 = a2 * bim + b2 * br;
  cnvO[offset] = a + tp;
  cnvO[offset + 1] = b + b1;
}

function voltage(ctx: StampContext, node: number): number {
  return node >= 0 ? ctx.getVoltage(node) : 0;
}
