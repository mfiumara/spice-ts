import { describe, expect, it } from 'vitest';
import { NgspiceRandom, almostEqualUlps, fAlphaFftwFilter } from './transient-noise.js';

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

  // Golden values: the verbatim ngspice-47 f_alpha FFTW branch, built against
  // libfftw3 3.3.11 (benchmarks/trnoise-501/f-alpha-ref.c) and fed the same
  // white sequence. They cover odd and even lengths, radix-2 and Bluestein.
  const white = [0.3, -1.2, 0.7, 2.1, -0.4, 1.5, -0.9, 0.25, -2.2, 0.8, 1.1, -0.6];
  const fAlphaGolden: Array<[number, number, number, number[]]> = [
    [5, 1, 1, [0.89805593969335062, 0.9600031187465895, 0.68395018850484812, -0.61081502523140385, 1.7602120282866154]],
    [8, 1, 1.7, [
      1.8364733061136476, 1.8321763310201251, 2.0492968251888821, 1.8012102514028043,
      1.2962598409475685, 1.5255262799966491, 2.1891384330443349, 1.9100944040130388,
    ]],
    [11, 0.5, 1, [
      0.44818691162056207, 0.36436401757947101, 0.82470440673168288, -0.017751705746000098,
      0.41286301352843929, 0.19123025310292555, 0.27087878253018294, 0.37493599572155689,
      1.2762644428439212, -0.37016795696427002, 0.017133383393569682,
    ]],
    [12, 2, 0.5, [
      0.97710352698340985, 0.24176872386409443, 2.6639338217489423, -1.4497292447750387,
      0.49522807309986544, 2.0885470809917241, -2.6717646765266641, 1.7249370511568696,
      2.4539820115406563, 2.2281225126827162, -3.6677868392771096, 0.82387578210906709,
    ]],
  ];

  it.each(fAlphaGolden)('matches ngspice-47 FFTW f_alpha for n=%i q=%f alpha=%f', (n, q, alpha, expected) => {
    const h = new Float64Array(n);
    const w = new Float64Array(n);
    h[0] = 1;
    w[0] = q * white[0];
    for (let i = 1; i < n; i++) {
      h[i] = h[i - 1] * (alpha / 2 + (i - 1)) / i;
      w[i] = q * white[i];
    }
    const result = fAlphaFftwFilter(h, w);
    expect(result).toHaveLength(n);
    expected.forEach((value, k) => expect(Math.abs(result[k] - value)).toBeLessThan(1e-13));
  });

  it('keeps the ngspice-47 product indexing instead of a circular convolution', () => {
    // ngspice-47 multiplies the interleaved r2c spectra with stride 1, so its
    // output is not h (*) w; the n=5 golden row differs from the true circular
    // convolution by more than 1.
    const [n, q, alpha, expected] = fAlphaGolden[0];
    const h = new Float64Array(n);
    h[0] = 1;
    for (let i = 1; i < n; i++) h[i] = h[i - 1] * (alpha / 2 + (i - 1)) / i;
    const circular = Array.from({ length: n }, (_, k) => {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += h[j] * q * white[(k - j + n) % n];
      return sum;
    });
    expect(Math.max(...circular.map((value, k) => Math.abs(value - expected[k])))).toBeGreaterThan(1);
  });

  it('compares doubles in units in the last place like ngspice AlmostEqualUlps', () => {
    expect(almostEqualUlps(1e-5, 1e-5, 3)).toBe(true);
    const next = 1e-5 + 2 * Number.EPSILON * 1e-5;
    expect(almostEqualUlps(1e-5, next, 3)).toBe(true);
    expect(almostEqualUlps(2e-5, 2e-5 - 1e-16, 3)).toBe(false);
    expect(almostEqualUlps(-0, 0, 3)).toBe(true);
  });
});
