import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { parse } from '../index.js';
import { ControlScriptError } from './errors.js';
import { ngspiceLinearInterpolate, realDft } from './spectrum.js';

/**
 * `linearize`, `fft` and `psd` control commands (#752).
 *
 * Every expected number was printed by `ngspice -b` 47 (Homebrew build, linked
 * against FFTW3) with `set numdgt=15` on the identical deck. The PWL source is
 * piecewise linear and both simulators place a time point on every corner, so
 * the linearized vectors (and every spectrum computed from them) do not depend
 * on the transient time-step sequence: they test the commands, not the solver.
 */

const pwl = `* linearize fft psd probe
v1 1 0 pwl(0 0 1.23u 1 3.7u -0.5 6u 0.8 10u 0.2)
r1 1 0 1k
.tran 0.1u 10u`;

/** Run `control`, then echo each expression with 17 significant digits; returns the echoed values. */
async function probe(control: string, expressions: string[]): Promise<{ values: number[]; output: string[] }> {
  const lets = expressions.map((expression, index) => `let probe${index} = ${expression}\necho $&probe${index}`);
  const deck = `${pwl}\n.control\nset numdgt=17\n${control}\n${lets.join('\n')}\n.endc\n.end`;
  const result = await simulate(deck);
  const output = result.control!.output;
  return { values: output.slice(-expressions.length).map(Number), output };
}

function expectClose(actual: number[], expected: number[], relative: number, absolute = 0): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    const tolerance = Math.max(absolute, relative * Math.abs(expected[index]));
    expect(Math.abs(value - expected[index]), `value ${index}: ${value} vs ${expected[index]}`).toBeLessThanOrEqual(tolerance);
  });
}

describe('linearize (#752)', () => {
  it('re-interpolates the transient plot onto tstart..tstop by the .tran step (ngspice-47)', async () => {
    const { values, output } = await probe('run\nlinearize\necho $curplot', [
      'length(time)', 'time[3]', 'v(1)[3]', 'v(1)[13]', 'v(1)[37]', 'v(1)[100]',
    ]);
    expect(output[0]).toBe('tran2');
    expectClose(values, [101, 3e-7, 2.439024390243902e-01, 9.574898785425119e-01, -4.99999999999998e-01, 2e-1], 1e-13);
  });

  it('honours np= (even length past tstop) and a lin-tstep vector (ngspice-47)', async () => {
    const np = await probe('run\nlinearize np=100 v(1)', ['length(time)', 'time[99]', 'v(1)[99]']);
    expectClose(np.values, [100, 9.900000000000010e-06, 2.149999999999985e-01], 1e-13);

    const step = await probe('run\nlet lin-tstep = 0.25u\nlinearize v(1)', ['length(time)', 'time[39]', 'v(1)[5]', 'v(1)[39]']);
    expectClose(step.values, [41, 9.749999999999996e-06, 9.878542510121463e-01, 2.374999999999985e-01], 1e-13);
  });

  it('rejects a non-transient plot and an unknown vector', async () => {
    await expect(simulate(`${pwl}\n.control\nop\nlinearize\n.endc`)).rejects.toThrow(ControlScriptError);
    await expect(simulate(`${pwl}\n.control\nop\nlinearize\n.endc`)).rejects.toThrow('plot must be a transient analysis');
    await expect(simulate(`${pwl}\n.control\nrun\nlinearize v(9)\n.endc`)).rejects.toThrow('no such vector v(9)');
  });
});

describe('fft (#752)', () => {
  it('creates an sp plot of single-sided amplitudes with the default hanning window (ngspice-47)', async () => {
    const { values, output } = await probe('run\nlinearize\nfft v(1)\necho $curplot', [
      'length(frequency)', 'frequency[1]', 'frequency[50]',
      'real(v(1)[0])', 'imag(v(1)[0])', 'real(v(1)[1])', 'imag(v(1)[1])', 'real(v(1)[7])', 'imag(v(1)[7])',
      'real(v(1)[50])', 'imag(v(1)[50])', 'mag(v(1))[1]',
    ]);
    expect(output[0]).toBe('sp2');
    expectClose(values.slice(0, 3), [51, 9.900990099009889e+04, 4.950495049504945e+06], 1e-13);
    expectClose(values.slice(3), [
      2.857409546661293e-01, 0, -1.82997146397671e-01, 3.748611588005381e-01, 3.360187968185921e-02, -2.05640811196077e-02,
      2.928674303985841e-04, 1.542035063284446e-03, Math.hypot(-1.82997146397671e-01, 3.748611588005381e-01),
    ], 1e-11, 1e-15);
  });

  it.each([
    ['blackman', '', -9.11983165296041e-02, 2.886092015831989e-01],
    ['none', '', -1.56365286274177e-01, 3.806768366207552e-02],
    ['gaussian', 'set specwindoworder=4', -9.80557601179185e-02, 3.912671377490935e-01],
    ['hamming', '', -1.13800674895264e-01, 2.011855942588531e-01],
  ])('applies specwindow=%s (ngspice-47)', async (window, extra, re, im) => {
    const { values } = await probe(`set specwindow=${window}\n${extra}\nrun\nlinearize\nfft v(1)`, [
      'real(v(1)[3])', 'imag(v(1)[3])',
    ]);
    expectClose(values, [re, im], 1e-11);
  });

  it('halves the Nyquist bin of an even-length record (ngspice-47)', async () => {
    const { values } = await probe('run\nlinearize np=100 v(1)\nfft v(1)', [
      'length(frequency)', 'frequency[50]', 'real(v(1)[50])', 'imag(v(1)[50])', 'real(v(1)[49])', 'imag(v(1)[49])',
    ]);
    expectClose(values, [
      51, 4.999999999999994e+06, 8.631738141181789e-04, 0, -1.14582895459878e-03, 4.181995379973147e-04,
    ], 1e-10, 1e-16);
  });

  it('numbers plots from the shared counter like ngspice-47', async () => {
    const { output } = await probe(
      'run\nlinearize\nfft v(1)\nsetplot tran2\nfft v(1)\nsetplot tran1\nlinearize\npsd 3 v(1)\necho $plots',
      [],
    );
    expect(output.at(-1)).toBe('const tran1 tran2 sp2 sp3 tran3 sp4');
  });

  it('rejects a non-time scale and an unknown window', async () => {
    await expect(simulate(`${pwl}\n.control\nrun\nlinearize\nfft v(1)\nfft v(1)\n.endc`))
      .rejects.toThrow('fft needs real time scale');
    await expect(simulate(`${pwl}\n.control\nset specwindow=kaiser\nrun\nfft v(1)\n.endc`))
      .rejects.toThrow('unknown window type kaiser');
  });
});

describe('psd (#752)', () => {
  it('produces a smoothed V^2/Hz spectrum (ngspice-47)', async () => {
    const { values, output } = await probe('run\nlinearize\npsd 3 v(1)\necho $curplot', [
      'length(frequency)', 'frequency[1]',
      'real(v(1)[0])', 'real(v(1)[1])', 'real(v(1)[2])', 'real(v(1)[25])', 'real(v(1)[49])', 'real(v(1)[50])', 'imag(v(1)[25])',
    ]);
    expect(output[0]).toBe('sp2');
    expectClose(values.slice(0, 2), [51, 9.999999999999988e+04], 1e-13);
    expectClose(values.slice(2), [
      8.253587132103183e-07, 1.035970905333960e-06, 8.678058221130915e-07, 3.363747034990895e-11,
      5.385558429592711e-12, 1.230465733166094e-11, 0,
    ], 1e-9, 1e-25);
  });

  it('treats the first word as the averaging width and handles width 1 (ngspice-47)', async () => {
    const { values } = await probe('run\nlet lin-tstep = 0.25u\nlinearize v(1)\npsd 1 v(1)', [
      'length(frequency)', 'real(v(1)[0])', 'real(v(1)[1])', 'real(v(1)[20])',
    ]);
    expectClose(values, [21, 8.296260548894419e-07, 9.480869798889739e-07, 2.511486524944333e-10], 1e-9);
  });
});

describe('noi-sc-tr.cir (#752)', () => {
  it('accepts the unmodified corpus-f deck, whose script runs linearize, fft and psd', () => {
    // The full 100 us run takes ~20 s; it is exercised end to end outside the unit suite (PR #752 evidence).
    const deck = readFileSync(
      new URL('../../../../../benchmarks/corpus/corpus-f/fixtures/examples/transient-noise/noi-sc-tr.cir', import.meta.url),
      'utf8',
    );
    expect(() => parse(deck)).not.toThrow();
  });
});

describe('spectrum kernels (#752)', () => {
  const naive = (input: number[]): { re: number[]; im: number[] } => {
    const n = input.length;
    const re: number[] = [];
    const im: number[] = [];
    for (let k = 0; k <= Math.floor(n / 2); k++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        sr += input[j] * Math.cos((2 * Math.PI * j * k) / n);
        si -= input[j] * Math.sin((2 * Math.PI * j * k) / n);
      }
      re.push(sr);
      im.push(si);
    }
    return { re, im };
  };

  it.each([1, 2, 7, 64, 101, 1000, 1023])('matches a direct DFT for length %i', length => {
    const input = Array.from({ length }, (_, j) => Math.sin(0.37 * j) + 0.25 * Math.cos(1.9 * j * j) + 0.1);
    const fast = realDft(input);
    const slow = naive(input);
    const scale = input.reduce((sum, value) => sum + Math.abs(value), 0);
    expect(fast.re).toHaveLength(slow.re.length);
    slow.re.forEach((value, k) => {
      expect(Math.abs(fast.re[k] - value)).toBeLessThan(1e-12 * scale);
      expect(Math.abs(fast.im[k] - slow.im[k])).toBeLessThan(1e-12 * scale);
    });
  });

  it('interpolates linearly, extrapolates before the first point and keeps the last value', () => {
    const values = ngspiceLinearInterpolate([1, 3, 2], [1, 2, 4], [0, 1.5, 3, 4])!;
    expect(Array.from(values)).toEqual([-1, 2, 2.5, 2]);
    // A vertical edge (repeated time point): grid points up to the edge take the left segment.
    const edge = ngspiceLinearInterpolate([0, 0, 1, 1], [0, 1, 1, 2], [0, 0.5, 1, 1.5, 2])!;
    expect(Array.from(edge)).toEqual([0, 0, 0, 1, 1]);
    // Grid points past the last old point stay 0 except the final one (interpolate.c).
    expect(Array.from(ngspiceLinearInterpolate([1, 2], [0, 1], [0, 1, 2, 3])!)).toEqual([1, 2, 0, 2]);
  });
});
