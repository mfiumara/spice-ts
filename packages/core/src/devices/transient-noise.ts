/**
 * ngspice-47 transient noise and random sources (`TRNOISE`, `TRRANDOM`) for
 * independent V and I sources.
 *
 * Ported from ngspice-47:
 * - maths/misc/randnumb.c: combined Tausworthe/LCG uniform generator
 *   (CombLCGTaus), TausSeed, drand, gauss0, exprand, poisson;
 * - frontend/trannoise/wallace.c: Wallace normal generator (initw, NewWa,
 *   GaussWa) used for white and 1/f noise;
 * - frontend/trannoise/1-f-code.c: Kasdin 1/f^alpha noise (f_alpha, FFTW
 *   path, including its stride-1 spectral product), trnoise_state_gen/init,
 *   trrandom_state_init;
 * - include/ngspice/1-f-code.h: trnoise_state_get, trrandom_state_get;
 * - spicelib/devices/{vsrc,isrc}/{load,acct}.c: TRNOISE/TRRANDOM evaluation
 *   and breakpoint scheduling.
 *
 * Seeding. ngspice-47 seeds TausSeed from the C library `rand()` after
 * `srand(seed)`. At startup it calls `initw()`, which seeds with
 * `srand(getpid())` and fills the Wallace pool from that stream; `.option
 * seed=N` later re-seeds the uniform streams only. The ngspice-47 executable is
 * therefore not reproducible run to run for white and 1/f noise (its Gaussian
 * pool depends on the process id), while RTS and TRRANDOM draws are
 * reproducible once `.option seed` is given. spice-ts emulates the BSD/macOS
 * libc `rand()` (Park-Miller minimal standard), seeds the Wallace pool as if
 * the process id were 1, and applies `.option seed=N` exactly like ngspice:
 * spice-ts runs are always reproducible, and with `.option seed` its RTS and
 * TRRANDOM draws are the ones ngspice-47 makes on macOS.
 */
import type { TransientBreakpointSink } from './device.js';
import type { TransientNoiseSource, TransientRandomSource } from '../types.js';
import { InvalidCircuitError } from '../errors.js';

/** BSD/macOS libc `rand()`/`srand()` (RAND_MAX = 2^31 - 1, Park-Miller minimal standard). */
const RAND_MAX = 0x7fffffff;
/** ngspice-47 wallace.c POOLSIZE. */
const POOL_SIZE = 4096;
/** ngspice-47 wallace.c LPOOLSIZE. */
const LOG2_POOL_SIZE = 12;
/** ngspice-47 wallace.c NOTRANS. */
const POOL_TRANSFORMS = 3;
/** Process id spice-ts uses in place of ngspice's `srand(getpid())` in `initw()`. */
export const WALLACE_PROCESS_SEED = 1;

/**
 * Tolerance of the TRNOISE/TRRANDOM accept windows (ngspice CKTminBreak). It
 * equals the spice-ts transient breakpoint tolerance; spice-ts lands on every
 * breakpoint, so these windows only absorb rounding.
 */
const SOURCE_MIN_BREAK = 1e-14;

/**
 * The ngspice-47 random-number stack (one per simulation, as ngspice keeps one
 * per process): uniform, Gaussian, exponential and Poisson variates, and the
 * Wallace Gaussian pool.
 */
export class NgspiceRandom {
  private randState = 1;
  /** CombState1..CombState8 of randnumb.c. */
  private readonly comb = new Uint32Array([129, 130, 131, 132, 133, 135, 137, 138]);
  /** gauss0 caches its second variate in these statics. */
  private gaussCached = false;
  private gaussCache = 0;
  private pool1 = new Float64Array(POOL_SIZE);
  private pool2 = new Float64Array(POOL_SIZE);
  private variateUsed = 0;
  private scaleGauss = 1;
  private chi1 = 0;
  private chi2 = 0;
  private newPools = 0;

  /**
   * @param seed - `.option seed` value; absent leaves the streams of the
   *   process-id stand-in {@link WALLACE_PROCESS_SEED} (ngspice without a seed).
   */
  constructor(seed?: number) {
    this.initWallace(WALLACE_PROCESS_SEED);
    if (seed !== undefined) this.seed(seed);
  }

  /** ngspice `com_sseed`/`.option seed=N`: `srand(N); TausSeed()`. */
  seed(seed: number): void {
    this.srand(seed);
    this.tausSeed();
  }

  /** libc `srand`. */
  srand(seed: number): void {
    this.randState = seed >>> 0;
  }

  /** libc `rand` on BSD/macOS. */
  rand(): number {
    let x = this.randState;
    if (x === 0) x = 123459876;
    const hi = Math.trunc(x / 127773);
    const lo = x % 127773;
    x = 16807 * lo - 2836 * hi;
    if (x < 0) x += 0x7fffffff;
    this.randState = x;
    return x;
  }

  private tausSeed(): void {
    for (let index = 0; index < 8; index++) {
      this.comb[index] = Math.trunc((this.rand() / RAND_MAX) * 32638) + 129;
    }
  }

  private static taus(state: Uint32Array, index: number, c1: number, c2: number, c3: number, mask: number): number {
    const s = state[index];
    const b = (((s << c1) ^ s) >>> c2);
    state[index] = (((s & mask) << c3) ^ b) >>> 0;
    return state[index];
  }

  private static lcg(state: Uint32Array, index: number): number {
    state[index] = (Math.imul(1664525, state[index]) + 1013904223) >>> 0;
    return state[index];
  }

  /** Uniform variate in [0, 1[ (CombLCGTaus). */
  uniform(): number {
    const c = this.comb;
    return 2.3283064365387e-10 * ((
      NgspiceRandom.taus(c, 0, 13, 19, 12, 0xfffffffe)
      ^ NgspiceRandom.taus(c, 1, 2, 25, 4, 0xfffffff8)
      ^ NgspiceRandom.taus(c, 2, 3, 11, 17, 0xfffffff0)
      ^ NgspiceRandom.lcg(c, 3)
    ) >>> 0);
  }

  /** Unsigned 32-bit variate (CombLCGTausInt, and its identical CombLCGTausInt2). */
  uniformInt(): number {
    const c = this.comb;
    return (
      NgspiceRandom.taus(c, 4, 13, 19, 12, 0xfffffffe)
      ^ NgspiceRandom.taus(c, 5, 2, 25, 4, 0xfffffff8)
      ^ NgspiceRandom.taus(c, 6, 3, 11, 17, 0xfffffff0)
      ^ NgspiceRandom.lcg(c, 7)
    ) >>> 0;
  }

  /** Uniform variate in [-1, 1[ (drand). */
  drand(): number {
    return 2 * this.uniform() - 1;
  }

  /** Polar Box-Muller normal variate, two per pass (gauss0). */
  gauss0(): number {
    if (this.gaussCached) {
      this.gaussCached = false;
      return this.gaussCache;
    }
    let v1: number;
    let v2: number;
    let r: number;
    do {
      v1 = 2 * this.uniform() - 1;
      v2 = 2 * this.uniform() - 1;
      r = v1 * v1 + v2 * v2;
    } while (r >= 1);
    const fac = Math.sqrt(-2 * Math.log(r) / r);
    this.gaussCache = v1 * fac;
    this.gaussCached = true;
    return v2 * fac;
  }

  /** Exponentially distributed variate with the given mean (exprand). */
  exprand(mean: number): number {
    return -Math.log(this.uniform()) * mean;
  }

  /** Poisson distributed integer (poisson). */
  poisson(lambda: number): number {
    const maxK = 1000;
    const p = this.uniform();
    let probability = Math.exp(-lambda);
    let sum = probability;
    if (sum >= p) return 0;
    let k = 1;
    for (; k < maxK; ++k) {
      probability *= lambda / k;
      sum += probability;
      if (sum >= p) break;
    }
    return k;
  }

  private polarGauss(pool: Float64Array, index: number): void {
    let x1: number;
    let x2: number;
    let w: number;
    do {
      x1 = this.drand();
      x2 = this.drand();
      w = x1 * x1 + x2 * x2;
    } while (w > 1 || w < 0.25);
    w = Math.sqrt((-2 * Math.log(w)) / w);
    pool[index] = x1 * w;
    pool[index + 1] = x2 * w;
  }

  /** ngspice `initw()` with `getpid()` replaced by `processSeed`. */
  private initWallace(processSeed: number): void {
    this.srand(processSeed);
    this.tausSeed();
    this.scaleGauss = 1;
    this.newPools = 1;
    const n = POOL_SIZE;
    const pool1 = this.pool1;
    for (let i = 0; i < n >> 1; i++) this.polarGauss(pool1, i << 1);
    let totalSquare = 0;
    for (let i = 0; i < n; i++) totalSquare += pool1[i] * pool1[i];
    const norm = Math.sqrt(n / totalSquare);
    for (let i = 0; i < n; i++) pool1[i] *= norm;
    this.chi1 = Math.sqrt(Math.sqrt(1 - 1 / n));
    this.chi2 = Math.sqrt(1 - this.chi1 * this.chi1);
    this.scaleGauss = this.chi1 + this.chi2 * this.scaleGauss * pool1[n - 2];
    this.variateUsed = n - 2;
    // initw draws the (unused) random pool read addresses from the integer stream.
    for (let i = 0; i < 2 * (n + POOL_TRANSFORMS); i++) this.uniformInt();
  }

  /** Normally distributed variate from the Wallace pool (the GaussWa macro). */
  gaussWa(): number {
    this.variateUsed = (this.variateUsed - 1) >>> 0;
    return this.variateUsed !== 0 ? this.pool1[this.variateUsed] * this.scaleGauss : this.newWallacePool();
  }

  /** ngspice `NewWa()` (simplified Wallace transform), including its reuse of `jj`. */
  private newWallacePool(): number {
    const n = POOL_SIZE;
    const pool1 = this.pool1;
    const pool2 = this.pool2;
    const firstValue = this.scaleGauss * pool1[0];
    const lastValue = pool1[n - 1];
    const m = n >> 2;
    for (let pass = 0; pass < POOL_TRANSFORMS; pass++) {
      const mm = m << 1;
      const mmm = mm + m;
      for (let j = 0; j < m; j++) {
        const bl1 = pool1[j];
        const bl2 = pool1[j + m];
        const bl3 = pool1[j + mm];
        const bl4 = pool1[j + mmm];
        const sum = (bl1 + bl2 + bl3 + bl4) * 0.5;
        const jj = j << 2;
        pool2[jj] = bl1 - sum;
        pool2[jj + 1] = bl2 - sum;
        pool2[jj + 2] = sum - bl3;
        pool2[jj + 3] = sum - bl4;
      }
      let jj = (this.uniformInt() >>> (31 - LOG2_POOL_SIZE)) & (n - 1);
      for (let j = 0; j < m; j++) {
        const bl1 = pool2[j ^ jj];
        const bl2 = pool2[(j + m) ^ jj];
        const bl3 = pool2[(j + mm) ^ jj];
        const bl4 = pool2[(j + mmm) ^ jj];
        const sum = (bl1 + bl2 + bl3 + bl4) * 0.5;
        // ngspice reuses `jj` as the write index, so later reads use j<<2 of
        // the previous iteration as their shuffle.
        jj = j << 2;
        pool1[jj] = bl1 - sum;
        pool1[jj + 1] = bl2 - sum;
        pool1[jj + 2] = sum - bl3;
        pool1[jj + 3] = sum - bl4;
      }
    }
    if (!(this.newPools & 0xffff)) {
      let totalSquare = 0;
      for (let i = 0; i < n; i++) totalSquare += pool1[i] * pool1[i];
      const norm = Math.sqrt(n / totalSquare);
      for (let i = 0; i < n; i++) pool1[i] *= norm;
    }
    this.variateUsed = n - 1;
    this.newPools = (this.newPools + 1) >>> 0;
    this.scaleGauss = this.chi1 + this.chi2 * this.scaleGauss * lastValue;
    return firstValue;
  }
}

/**
 * Kasdin 1/f^alpha noise as the ngspice-47 FFTW build computes it (1-f-code.c
 * f_alpha, HAVE_LIBFFTW3 branch): `nPoints` samples of white noise with
 * deviation `q` filtered by the fractional-integration coefficients h_k.
 */
export function fAlpha(nPoints: number, q: number, alpha: number, random: NgspiceRandom): Float64Array {
  const ha = alpha / 2;
  const h = new Float64Array(nPoints);
  const w = new Float64Array(nPoints);
  h[0] = 1;
  w[0] = q * random.gaussWa();
  for (let i = 1; i < nPoints; i++) {
    h[i] = h[i - 1] * (ha + (i - 1)) / i;
    w[i] = q * random.gaussWa();
  }
  return fAlphaFftwFilter(h, w);
}

/**
 * The spectral product of ngspice-47 f_alpha (FFTW build), ported verbatim.
 *
 * ngspice transforms h and w in place with `fftw_plan_dft_r2c_1d(n)`, which
 * leaves the n/2+1 complex bins interleaved (re, im, re, im, ...) in each
 * double array, then forms
 *
 *     out[i] = (hfa[i]*wfa[i] - hfa[i+1]*wfa[i+1], hfa[i]*wfa[i+1] + hfa[i+1]*wfa[i])
 *
 * for i = 0..n/2. The intended complex product would index 2i and 2i+1; the
 * stride-1 indexing mixes real and imaginary parts of neighbouring bins, so the
 * result is not the circular convolution of h and w: with the same spectral
 * slope it carries more power than the true Kasdin filter (about 1.6x the
 * per-octave power at alpha = 1 and 2.7x at alpha = 1.7, see
 * benchmarks/trnoise-501). spice-ts keeps the ngspice-47 indexing for parity; `fftw_plan_dft_c2r_1d` then reads the
 * product as a Hermitian half spectrum (the imaginary parts of the DC and,
 * for even n, Nyquist bins are ignored) and the result is divided by n.
 */
export function fAlphaFftwFilter(h: Float64Array, w: Float64Array): Float64Array {
  const n = h.length;
  const half = n >> 1;
  const hfa = realForwardInterleaved(h);
  const wfa = realForwardInterleaved(w);
  const outRe = new Float64Array(half + 1);
  const outIm = new Float64Array(half + 1);
  for (let i = 0; i < half + 1; i++) {
    outRe[i] = hfa[i] * wfa[i] - hfa[i + 1] * wfa[i + 1];
    outIm[i] = hfa[i] * wfa[i + 1] + hfa[i + 1] * wfa[i];
  }
  // fftw_plan_dft_c2r_1d: unnormalised inverse DFT of the Hermitian extension.
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re[0] = outRe[0];
  for (let k = 1; k < half + 1; k++) {
    re[k] = outRe[k];
    im[k] = outIm[k];
    re[n - k] = outRe[k];
    im[n - k] = -outIm[k];
  }
  if ((n & 1) === 0 && n > 0) {
    re[half] = outRe[half];
    im[half] = 0;
  }
  dft(re, im, true);
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) result[i] = re[i] / n;
  return result;
}

/**
 * `fftw_plan_dft_r2c_1d(n, x, (fftw_complex *)x)` on an n+2 double buffer:
 * bins 0..n/2 of the forward DFT, interleaved as re, im; the tail stays zero.
 */
function realForwardInterleaved(x: Float64Array): Float64Array {
  const n = x.length;
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  dft(re, im, false);
  const buffer = new Float64Array(n + 2);
  for (let k = 0; k <= n >> 1; k++) {
    buffer[2 * k] = re[k];
    buffer[2 * k + 1] = im[k];
  }
  return buffer;
}

/**
 * In-place unnormalised complex DFT of any length (forward sign -1, inverse
 * +1): radix-2 for powers of two, Bluestein's chirp-z algorithm otherwise.
 */
function dft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) === 0) {
    fft(re, im, inverse);
    return;
  }
  let size = 1;
  while (size < 2 * n - 1) size <<= 1;
  const sign = inverse ? 1 : -1;
  // chirp_k = exp(sign * i*pi*k^2/n); k^2 is reduced mod 2n to keep the angle exact.
  const chirpRe = new Float64Array(n);
  const chirpIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const angle = sign * Math.PI * ((k * k) % (2 * n)) / n;
    chirpRe[k] = Math.cos(angle);
    chirpIm[k] = Math.sin(angle);
  }
  const aRe = new Float64Array(size);
  const aIm = new Float64Array(size);
  for (let k = 0; k < n; k++) {
    aRe[k] = re[k] * chirpRe[k] - im[k] * chirpIm[k];
    aIm[k] = re[k] * chirpIm[k] + im[k] * chirpRe[k];
  }
  const bRe = new Float64Array(size);
  const bIm = new Float64Array(size);
  bRe[0] = chirpRe[0];
  bIm[0] = -chirpIm[0];
  for (let k = 1; k < n; k++) {
    bRe[k] = bRe[size - k] = chirpRe[k];
    bIm[k] = bIm[size - k] = -chirpIm[k];
  }
  fft(aRe, aIm, false);
  fft(bRe, bIm, false);
  for (let k = 0; k < size; k++) {
    const r = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = r;
  }
  fft(aRe, aIm, true);
  for (let k = 0; k < n; k++) {
    const cRe = aRe[k] / size;
    const cIm = aIm[k] / size;
    re[k] = cRe * chirpRe[k] - cIm * chirpIm[k];
    im[k] = cRe * chirpIm[k] + cIm * chirpRe[k];
  }
}

/** In-place iterative radix-2 complex FFT; `inverse` omits the 1/N scaling. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / length;
    const half = length >> 1;
    for (let start = 0; start < n; start += length) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const i = start + k;
        const j = i + half;
        const xr = re[j] * wr - im[j] * wi;
        const xi = re[j] * wi + im[j] * wr;
        re[j] = re[i] - xr; im[j] = im[i] - xi;
        re[i] += xr; im[i] += xi;
      }
    }
  }
}

/** ngspice AlmostEqualUlps on IEEE doubles. */
export function almostEqualUlps(a: number, b: number, maxUlps: number): boolean {
  if (a === b) return true;
  const view = new DataView(new ArrayBuffer(8));
  const ordered = (value: number): bigint => {
    view.setFloat64(0, value);
    const bits = view.getBigInt64(0);
    return bits < 0n ? -0x8000000000000000n - bits : bits;
  };
  const difference = ordered(a) - ordered(b);
  return (difference < 0n ? -difference : difference) <= BigInt(maxUlps);
}

/**
 * Whether an ISRC accept at `time` is at the sample (or RTS) time `target`.
 *
 * ngspice-47 isrcacct.c tests AlmostEqualUlps(target, time, 3). When another
 * source's breakpoint lies within CKTminBreak of the sample time, ngspice
 * merges the two and accepts the other time; that is then more than 3 ULPs
 * away and the current source stops advancing for the rest of the run
 * (simple-noise.cir: ngspice holds i3 TRRANDOM at one value, std 0.008 instead
 * of 1). spice-ts also accepts times within its breakpoint tolerance, so a
 * merged sample time keeps the source on its TS grid.
 */
function isrcSamplePoint(target: number, time: number): boolean {
  return almostEqualUlps(target, time, 3) || Math.abs(target - time) <= SOURCE_MIN_BREAK;
}

/** Which ngspice source device a noise source belongs to (their accept code differs). */
export type NoiseSourceKind = 'V' | 'I';

/** One TRNOISE source's state (ngspice `struct trnoise_state` plus VSRC/ISRC break bookkeeping). */
class TransientNoiseState {
  private values = new Float64Array(64);
  private top = 0;
  private oneOverF: Float64Array | undefined;
  private timeZero = false;
  private breakTime = -1;
  rtsCaptureTime = 0;
  rtsEmissionTime = 0;
  stopTime: number | undefined;

  constructor(readonly name: string, readonly params: TransientNoiseSource, private readonly random: NgspiceRandom) {
    if (params.rtsAmplitude > 0) this.drawRts(0);
  }

  private drawRts(start: number): void {
    this.rtsCaptureTime = start + this.random.exprand(this.params.rtsCaptureTime);
    this.rtsEmissionTime = this.rtsCaptureTime + this.random.exprand(this.params.rtsEmissionTime);
  }

  resetTransient(): void {
    this.breakTime = -1;
  }

  private push(value: number): void {
    if (this.top >= this.values.length) {
      const grown = new Float64Array(this.values.length * 2);
      grown.set(this.values);
      this.values = grown;
    }
    this.values[this.top++] = value;
  }

  private generate(): void {
    const { ts, alpha, oneOverFAmplitude, amplitude } = this.params;
    if (this.top === 0) {
      if (alpha > 0 && oneOverFAmplitude > 0) {
        if (this.stopTime === undefined) {
          throw new InvalidCircuitError(`TRNOISE source '${this.name}' needs a transient stop time for 1/f noise`);
        }
        // ngspice: (size_t)(CKTfinalTime / TS) + 10 start-up steps.
        const steps = Math.trunc(this.stopTime / ts) + 10;
        this.oneOverF = fAlpha(steps, oneOverFAmplitude, alpha, this.random);
      }
      this.push(0);
      return;
    }
    let ra1 = 0;
    let ra2 = 0;
    if (amplitude !== 0) {
      ra1 = amplitude * this.random.gaussWa();
      ra2 = amplitude * this.random.gaussWa();
    }
    const oneOverF = this.oneOverF;
    if (oneOverF) {
      if (this.top + 1 >= oneOverF.length) {
        throw new InvalidCircuitError(`TRNOISE source '${this.name}': 1/f noise data exhausted`);
      }
      ra1 += oneOverF[this.top] - oneOverF[0];
      ra2 += oneOverF[this.top + 1] - oneOverF[0];
    }
    this.push(ra1);
    this.push(ra2);
  }

  private sample(index: number): number {
    while (index >= this.top) this.generate();
    return this.values[index];
  }

  /** vsrcload.c/isrcload.c TRNOISE value, without the DC term. */
  value(time: number): number {
    const { ts, rtsAmplitude } = this.params;
    // ngspice resets the sample sequence on the jump from time 0 to time > 0.
    if (time === 0) this.timeZero = true;
    else if (this.timeZero) {
      this.top = 0;
      this.oneOverF = undefined;
      this.timeZero = false;
    }
    let value = 0;
    if (ts !== 0 && time !== 0) {
      const n1 = Math.floor(time / ts);
      const v1 = this.sample(n1);
      const v2 = this.sample(n1 + 1);
      value = v1 + (v2 - v1) * (time / ts - n1);
    }
    if (rtsAmplitude > 0 && time >= this.rtsCaptureTime) value += rtsAmplitude;
    return value;
  }

  /** vsrcacct.c (kind V) or isrcacct.c (kind I) TRNOISE accept. */
  accept(kind: NoiseSourceKind, time: number, breakpoints: (time: number) => void): void {
    const { ts, rtsAmplitude, rtsCaptureTime, rtsEmissionTime } = this.params;
    if (ts === 0 && rtsAmplitude === 0) return;
    if (kind === 'V') {
      // ngspice subtracts CKTminBreak from VSRCbreak_time after each schedule;
      // spice-ts schedules exact multiples of TS and keeps that slack in the test.
      if (ts > 0 && time >= this.breakTime - SOURCE_MIN_BREAK) {
        this.breakTime = this.breakTime < 0 ? ts : this.breakTime + ts;
        breakpoints(this.breakTime);
      }
      if (rtsAmplitude <= 0) return;
      if (time === 0) {
        this.drawRts(0);
        breakpoints(this.rtsCaptureTime);
        return;
      }
      if (time >= this.rtsCaptureTime - SOURCE_MIN_BREAK && time <= this.rtsCaptureTime + SOURCE_MIN_BREAK) {
        breakpoints(this.rtsEmissionTime);
      }
      if (time >= this.rtsEmissionTime - SOURCE_MIN_BREAK) {
        this.drawRts(time);
        breakpoints(this.rtsCaptureTime);
      }
      return;
    }
    // isrcacct.c acts only when the accepted time is n*TS (or an RTS time)
    // within 3 ULPs; see isrcSamplePoint for the breakpoint-tolerance window.
    if (ts > 0) {
      const n = Math.floor(time / ts + 0.5);
      if (isrcSamplePoint(n * ts, time)) breakpoints((n + 1) * ts);
    }
    if (rtsAmplitude > 0) {
      if (time === 0) {
        this.rtsCaptureTime = this.random.exprand(rtsCaptureTime);
        this.rtsEmissionTime = this.rtsCaptureTime + this.random.exprand(rtsEmissionTime);
        breakpoints(this.rtsCaptureTime);
      }
      if (isrcSamplePoint(this.rtsCaptureTime, time)) breakpoints(this.rtsEmissionTime);
      if (isrcSamplePoint(this.rtsEmissionTime, time)) {
        this.drawRts(time);
        breakpoints(this.rtsCaptureTime);
      }
    }
  }
}

/** One TRRANDOM source's state (ngspice `struct trrandom_state`). */
class TransientRandomState {
  private current: number;
  private breakTime = -1;
  /** Last ISRC sample index drawn. */
  private lastIndex = -1;

  constructor(readonly params: TransientRandomSource, private readonly random: NgspiceRandom) {
    this.current = params.param2;
  }

  resetTransient(): void {
    this.breakTime = -1;
    this.lastIndex = -1;
  }

  /** The value held since the last accepted draw, without the DC term. */
  value(): number {
    return this.current;
  }

  private draw(): number {
    const { distribution, param1, param2 } = this.params;
    switch (distribution) {
      case 1: return param1 * this.random.drand() + param2;
      case 2: return param1 * this.random.gauss0() + param2;
      case 3: return this.random.exprand(param1) + param2;
      case 4: return this.random.poisson(param1) + param2;
      default: return 0;
    }
  }

  accept(kind: NoiseSourceKind, time: number, breakpoints: (time: number) => void): void {
    const { ts, td } = this.params;
    if (kind === 'V') {
      if (time === 0 && td > 0) {
        breakpoints(td);
        this.breakTime = td;
        return;
      }
      if (time >= this.breakTime - SOURCE_MIN_BREAK) {
        this.breakTime = this.breakTime < 0 ? ts : this.breakTime + ts;
        breakpoints(this.breakTime);
        this.current = this.draw();
      }
      return;
    }
    const delayed = time - td;
    if (delayed < 0) return;
    const n = Math.floor(delayed / ts + 0.5);
    // One draw per sample index, even if two accepted times fall in the window.
    if (n > this.lastIndex && isrcSamplePoint(n * ts, delayed)) {
      this.lastIndex = n;
      breakpoints((n + 1) * ts + td);
      this.current = this.draw();
    }
  }
}

type NoiseState = TransientNoiseState | TransientRandomState;

interface RegisteredSource {
  kind: NoiseSourceKind;
  state: NoiseState;
}

/**
 * The noise sources of one compiled circuit and their shared random stream.
 *
 * ngspice draws from one process-wide stream. Its CKTaccept visits device
 * types in DEVices order (isrc before vsrc) and each type's instances in
 * reverse netlist order (CKTcrtElt prepends); the per-source accept hooks of
 * spice-ts run in netlist order, so the first hook of an accepted timepoint
 * runs every source's accept in ngspice's order.
 */
export class TransientNoiseContext {
  readonly random: NgspiceRandom;
  private readonly sources: RegisteredSource[] = [];
  private acceptOrder: RegisteredSource[] | undefined;
  private acceptsThisPoint = 0;
  /** Breakpoints created while accepting t=0, before the transient breakpoint queue exists. */
  private pendingBreakpoints: number[] = [];
  private stopTime: number | undefined;

  constructor(seed?: number) {
    this.random = new NgspiceRandom(seed);
  }

  /** Register a source (in netlist order); TRNOISE RTS draws its first capture/emission times here. */
  register(kind: NoiseSourceKind, name: string, waveform: TransientNoiseSource | TransientRandomSource): NoiseHandle {
    const state = waveform.type === 'trnoise'
      ? new TransientNoiseState(name, waveform, this.random)
      : new TransientRandomState(waveform, this.random);
    const source = { kind, state };
    this.sources.push(source);
    this.acceptOrder = undefined;
    return new NoiseHandle(this, state);
  }

  /** Accept hook of one source; the first call of each timepoint accepts all sources. */
  accept(time: number, sink: TransientBreakpointSink | undefined): void {
    if (this.acceptsThisPoint === 0) {
      this.acceptOrder ??= [
        ...this.sources.filter(source => source.kind === 'I').reverse(),
        ...this.sources.filter(source => source.kind === 'V').reverse(),
      ];
      const schedule = (breakpoint: number): void => {
        if (time === 0) this.pendingBreakpoints.push(breakpoint);
        sink?.schedule(breakpoint);
      };
      for (const source of this.acceptOrder) source.state.accept(source.kind, time, schedule);
    }
    this.acceptsThisPoint = (this.acceptsThisPoint + 1) % this.sources.length;
  }

  /** The t=0 breakpoints, reported once to the breakpoint collection that follows the initial accept. */
  takeInitialBreakpoints(stopTime: number): number[] {
    this.setStopTime(stopTime);
    const pending = this.pendingBreakpoints;
    this.pendingBreakpoints = [];
    return pending;
  }

  setStopTime(stopTime: number): void {
    this.stopTime = stopTime;
    for (const source of this.sources) {
      if (source.state instanceof TransientNoiseState) source.state.stopTime = stopTime;
    }
  }

  resetTransient(): void {
    this.acceptsThisPoint = 0;
    this.pendingBreakpoints = [];
    for (const source of this.sources) source.state.resetTransient();
  }
}

/** A source's view of its noise state. */
export class NoiseHandle {
  constructor(private readonly context: TransientNoiseContext, private readonly state: NoiseState) {}

  /** Source value at `time` without the DC term. */
  value(time: number): number {
    return this.state instanceof TransientNoiseState ? this.state.value(time) : this.state.value();
  }

  accept(time: number, sink: TransientBreakpointSink | undefined): void {
    this.context.accept(time, sink);
  }

  /** Initial breakpoints owned by the shared context: only the first source reports them. */
  breakpoints(stopTime: number): number[] {
    return this.context.takeInitialBreakpoints(stopTime);
  }

  resetTransient(): void {
    this.context.resetTransient();
  }
}
