import { describe, expect, it } from 'vitest';
import { NgspiceRandom, almostEqualUlps, circularConvolution } from './transient-noise.js';

/** Values computed through log() may differ from the C library in the last place or two. */
function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(Math.abs(actual[index] - value)).toBeLessThanOrEqual(4e-15 * Math.abs(value)));
}

/*
 * Golden values printed by the verbatim ngspice-47 C sources maths/misc/randnumb.c and
 * frontend/trannoise/wallace.c (srand/rand from macOS libSystem), compiled with clang on
 * macOS arm64: initw() with getpid() replaced by 1, then srand(5) + TausSeed().
 */
describe('ngspice-47 random-number stack', () => {
  it('reproduces the BSD/macOS libc rand() sequence', () => {
    const random = new NgspiceRandom();
    random.srand(1);
    expect([random.rand(), random.rand(), random.rand()]).toEqual([16807, 282475249, 1622650073]);
    random.srand(5);
    expect([random.rand(), random.rand(), random.rand()]).toEqual([84035, 1412376245, 1670799424]);
  });

  it('reproduces the Wallace GaussWa variates of initw(), across a pool refill', () => {
    const random = new NgspiceRandom();
    expectClose(Array.from({ length: 5 }, () => random.gaussWa()), [
      -1.6354997665401751, -0.21221250348377782, -0.60707144608779784, 0.13073781232472664, -1.3692099412077114,
    ]);
    for (let i = 0; i < 8200; i++) random.gaussWa();
    expectClose(Array.from({ length: 3 }, () => random.gaussWa()), [
      1.7235967323088179, -0.11129497122132853, 0.48642118623801212,
    ]);
  });

  it('tracks the ngspice Wallace pool over a million variates, including its variance drift', () => {
    // C harness: rms 1.005265483479068 and last variate 0.4356193629566445 after 1e6 GaussWa.
    const random = new NgspiceRandom();
    let sumSquares = 0;
    let last = 0;
    for (let i = 0; i < 1_000_000; i++) {
      last = random.gaussWa();
      sumSquares += last * last;
    }
    expect(Math.abs(Math.sqrt(sumSquares / 1e6) - 1.005265483479068)).toBeLessThan(1e-12);
    expect(Math.abs(last - 0.4356193629566445)).toBeLessThan(1e-11);
  });

  it('reproduces CombLCGTaus and drand bit for bit, and gauss0, exprand, poisson and drand after srand(5); TausSeed()', () => {
    const random = new NgspiceRandom();
    for (let i = 0; i < 5 + 8200 + 3; i++) random.gaussWa();
    random.seed(5);
    expect(Array.from({ length: 4 }, () => random.uniform())).toEqual([
      0.2251101802103225, 0.59541179030202418, 0.38349486188963117, 0.90497812954709078,
    ]);
    expectClose(Array.from({ length: 3 }, () => random.gauss0()), [
      0.36437434109166389, 0.089323289158928135, -0.9240887052086737,
    ]);
    expectClose([random.exprand(2), random.exprand(2)], [3.7940090411828034, 1.6599383293707553]);
    expect([random.poisson(3), random.poisson(3)]).toEqual([5, 4]);
    expect(random.drand()).toBe(-0.9893812257796526);
  });

  it('computes the circular convolution of FFTW f_alpha', () => {
    const a = Float64Array.from([1, 0.5, 0.375, 0.3125, 0.2734375]);
    const b = Float64Array.from([0.3, -1.2, 0.7, 2.1, -0.4]);
    const direct = Array.from({ length: a.length }, (_, k) => {
      let sum = 0;
      for (let j = 0; j < a.length; j++) sum += a[j] * b[(k - j + a.length) % a.length];
      return sum;
    });
    const result = circularConvolution(a, b);
    direct.forEach((value, k) => expect(result[k]).toBeCloseTo(value, 14));
  });

  it('compares doubles in units in the last place like ngspice AlmostEqualUlps', () => {
    expect(almostEqualUlps(1e-5, 1e-5, 3)).toBe(true);
    const next = 1e-5 + 2 * Number.EPSILON * 1e-5;
    expect(almostEqualUlps(1e-5, next, 3)).toBe(true);
    expect(almostEqualUlps(2e-5, 2e-5 - 1e-16, 3)).toBe(false);
    expect(almostEqualUlps(-0, 0, 3)).toBe(true);
  });
});
