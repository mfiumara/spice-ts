import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { frequencyGrid } from '../../analysis/frequency-grid.js';
import { parse } from '../index.js';
import { ControlScriptError, ControlScriptExitError } from './errors.js';

/**
 * `sp` and `sens` analysis commands inside `.control` (#750), and the
 * S-parameter vectors of a control run readable as `s_1_1` in plot `sp<n>`
 * (#751).
 *
 * Expected numbers were printed by `ngspice -b` 47 (Homebrew build) with
 * `set numdgt=15` on the identical deck, unless a line says otherwise.
 */

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../../../benchmarks/corpus/corpus-f/fixtures/${path}`, import.meta.url), 'utf8');

/** examples/rf/sp/sp3.cir circuit: a CLC pi filter between two 50-ohm ports. */
const ports = `* two-port
V1 in 0 dc 0 ac 1 portnum 1 z0 50
C1 in 0 318.3n
L1 in out 1.592m
C2 out 0 318.3n
V2 out 0 dc 0 ac 0 portnum 2 z0 50`;

/** sens-ac-1.cir circuit. */
const rc = `* rc
i1 0 1 dc=1.27 ac=42mA
r1 1 0 1k
c1 1 0 100p`;

async function echoed(deck: string): Promise<string[]> {
  return (await simulate(deck)).control!.output;
}

describe('sp control command (#750)', () => {
  it('runs the S-parameter analysis of its arguments and records plot sp1', async () => {
    const control = await simulate(`${ports}\n.control\nsp dec 5 1 1e6 0\n.endc\n.end`);
    const dotCard = await simulate(`${ports}\n.sp dec 5 1 1e6 0\n.end`);

    expect(control.control!.runs.map(run => [run.plot, run.analysis])).toEqual([['sp1', 'sp']]);
    const run = control.control!.runs[0].result.sParameters!;
    expect(run.frequencies).toEqual(dotCard.sParameters!.frequencies);
    expect(run.vector('S_2_1')).toEqual(dotCard.sParameters!.vector('S_2_1'));
    // The latest sp run is the top-level field, like every other analysis (#751).
    expect(control.sParameters).toBe(control.control!.runs[0].result.sParameters);
  });

  it('exposes s_i_j, y_i_j and z_i_j in plot sp<n>, case-insensitively, with a frequency scale', async () => {
    const dotCard = (await simulate(`${ports}\n.sp dec 5 1 1e6 0\n.end`)).sParameters!;
    const output = await echoed(`${ports}
.control
set numdgt=17
sp dec 5 1 1e6 0
echo $curplot
let a = real(s_2_1[3])
let b = imag(S_2_1[3])
let c = real(Y_1_2[3])
let d = real(z_1_1[3])
let f = frequency[3]
let n = length(s_1_1)
echo $&a $&b $&c $&d $&f $&n
.endc
.end`);
    expect(output[0]).toBe('sp1');
    const [a, b, c, d, f, n] = output[1].split(/\s+/).map(Number);
    const at = (name: string) => dotCard.vector(name)[3];
    expect(a).toBe(at('S_2_1').real);
    expect(b).toBe(at('S_2_1').imaginary);
    expect(c).toBe(at('Y_1_2').real);
    expect(d).toBe(at('Z_1_1').real);
    expect(f).toBe(dotCard.frequencies[3]);
    expect(n).toBe(dotCard.frequencies.length);
  });

  it('numbers successive sp plots from the shared plot counter', async () => {
    const output = await echoed(`${ports}\n.control\nsp lin 3 1e3 1e4\necho $curplot\nsp lin 4 1e3 1e4\necho $curplot $plots\n.endc\n.end`);
    expect(output).toEqual(['sp1', 'sp2 const sp1 sp2']);
  });

  it('makes the vectors of a deck .sp run readable as s_1_1 (Tschebyschef-LP.cir)', async () => {
    const deck = fixture('examples/rf/sp/Tschebyschef-LP.cir');
    // A replacer function: `$&` in a replacement string would insert the match.
    const result = await simulate(deck.replace(/\.endc/i, () => 'set numdgt=17\nlet m = S11db[0]\necho $curplot $&m\n.endc'));
    const s11 = result.sParameters!.vector('S_1_1')[0];
    const [plot, value] = result.control!.output[0].split(' ');
    expect(plot).toBe('sp1');
    expect(Number(value)).toBeCloseTo(20 * Math.log10(Math.hypot(s11.real, s11.imaginary)), 12);
  });

  it('puts the control-run S-parameters on the top-level result (sp2.cir)', async () => {
    // `.sp` card plus `run`; ngspice then runs the deck's analyses once more after the script.
    const result = await simulate(fixture('examples/rf/sp/sp2.cir'));
    expect(result.control!.runs.map(run => run.plot)).toEqual(['sp1']);
    expect(result.sParameters).toBeDefined();
    expect(result.sParameters!.vectors).toEqual(result.control!.runs[0].result.sParameters!.vectors);
  });

  it('keeps the latest control sp run on the top-level result when the script quits', async () => {
    const result = await simulate(`${ports}\n.control\nsp lin 3 1e3 1e4\nsp lin 4 1e3 1e4\nquit\n.endc\n.end`);
    expect(result.sParameters).toBe(result.control!.runs[1].result.sParameters);
    expect(result.sParameters!.frequencies).toHaveLength(4);
  });

  it('runs sp3.cir from its control block to completion', async () => {
    const result = await simulate(fixture('examples/rf/sp/sp3.cir'));
    expect(result.control!.runs.map(run => run.plot)).toEqual(['sp1']);
    // sp dec 100 1 1e6: 601 points, as ngspice-47 writes them (corpus-f #694 reference).
    expect(result.sParameters!.frequencies).toHaveLength(601);
  });

  it('is accepted at parse time and its arguments are checked like the dot card', () => {
    expect(() => parse(`${ports}\n.control\nsp dec 5 1 1e6\n.endc`)).not.toThrow();
    expect(() => parse(`${ports}\n.control\nsp foo 5 1 1e6\n.endc`)).toThrow(/line 8/);
  });
});

describe('sens control command (#750)', () => {
  it('runs a DC sensitivity into plot sens1 whose vectors are named like ngspice', async () => {
    const output = await echoed(`${rc}\n.control\nset numdgt=15\nsens v(1) dc\necho $curplot\necho $&r1 $&i1\n.endc\n.end`);
    expect(output[0]).toBe('sens1');
    const [r1, i1] = output[1].split(' ').map(Number);
    // ngspice-47: r1 = 1.269998730071224e+00, i1 = 1.000000000041869e+03 (finite differences).
    expect(r1).toBeCloseTo(1.27, 5);
    expect(i1).toBeCloseTo(1000, 3);
  });

  it('runs an AC sensitivity with a LIN sweep, naming the resistance both r1 and r1_ac', async () => {
    const output = await echoed(`${rc}
.control
set numdgt=15
sens v(1) ac lin 1 1e6 1.1e6
echo $curplot
let a = real(r1)
let b = imag(r1)
let c = real(r1_ac)
let f = real(frequency)
let n = length(c1)
echo $&a $&b $&c $&f $&n
.endc
.end`);
    expect(output[0]).toBe('sens1');
    const [a, b, c, f, n] = output[1].split(' ').map(Number);
    // Both are finite differences of d v(1) / d r1 = 42mA / (1 + s 100p 1k)^2, s = j 2 pi 1MHz;
    // ngspice-47 prints 1.306607381769787e-02 - 2.71296816058775e-02 j.
    const s = 2 * Math.PI * 1e6 * 100e-12 * 1e3;
    const square = { re: 1 - s * s, im: 2 * s };
    const norm = square.re ** 2 + square.im ** 2;
    const exact = { re: 42e-3 * square.re / norm, im: -42e-3 * square.im / norm };
    for (const [value, analytic, ngspice] of [
      [a, exact.re, 1.306607381769787e-02], [b, exact.im, -2.71296816058775e-02],
    ]) {
      expect(Math.abs(value - analytic)).toBeLessThan(1e-6 * Math.abs(analytic));
      expect(Math.abs(value - ngspice)).toBeLessThan(2e-6 * Math.abs(ngspice));
    }
    expect(c).toBe(a);
    expect(f).toBe(1e6);
    expect(n).toBe(1);
  });

  it('records the sensitivity result as a control run and as the top-level field', async () => {
    const result = await simulate(`${rc}\n.control\nsens v(1) ac dec 2 1e3 1e4\n.endc\n.end`);
    expect(result.control!.runs.map(run => [run.plot, run.analysis])).toEqual([['sens1', 'sens']]);
    expect(result.sensitivity).toBe(result.control!.runs[0].result.sensitivity);
    expect(result.sensitivity!.mode).toBe('ac');
  });

  it.each([
    ['tests/regression/sens/sens-ac-1.cir', 'INFO: 0 of 3 tests failed'],
    ['tests/regression/sens/sens-ac-2.cir', 'INFO: 0 of 6 tests failed'],
    ['tests/regression/sens/sens-dc-2.cir', 'INFO: 0 of 7 tests failed'],
  ])('passes the ngspice regression deck %s against its golden values', async (path, verdict) => {
    const result = await simulate(fixture(path));
    expect(result.control!.quit).toBe(true);
    expect(result.control!.output).toEqual([verdict]);
    expect(result.control!.runs.map(run => run.plot)).toEqual(['sens1']);
  });

  it('stops sens-dc-1.cir at the multiplier sensitivity spice-ts does not produce', async () => {
    // ngspice-47 also lists i1_m, r1_m and r1_scale; the bounded .sens slice covers primary values only.
    const run = simulate(fixture('tests/regression/sens/sens-dc-1.cir'));
    await expect(run).rejects.toBeInstanceOf(ControlScriptError);
    await expect(run).rejects.toThrow("no such vector 'i1_m' in plot 'sens1'");
    await expect(run).rejects.not.toBeInstanceOf(ControlScriptExitError);
  });
});

describe('.sens LIN and OCT sweeps follow ngspice-47 cktsens.c (#750)', () => {
  const sweep = (variation: 'lin' | 'oct' | 'dec', points: number, startFreq: number, stopFreq: number) =>
    frequencyGrid({ variation, points, startFreq, stopFreq }, 1e-3, 'sens');

  it('counts N LIN points and multiplies by (stop - start) / N, as ngspice-47 inc_freq does', () => {
    // ngspice-47 `sens v(1) ac lin 3 1e6 1.3e6` prints 1e6, 1e11, 1e16.
    expect(sweep('lin', 3, 1e6, 1.3e6)).toEqual([1e6, 1e6 * 1e5, 1e6 * 1e5 * 1e5]);
    expect(sweep('lin', 1, 1e6, 1.1e6)).toEqual([1e6]);
  });

  it('counts OCT points with count_steps (log(stop/start) / M_LOG2E)', () => {
    // ngspice-47 `sens v(1) ac oct 2 1e6 4e6` prints 1e6, 1.414213562373095e6.
    const grid = sweep('oct', 2, 1e6, 4e6);
    expect(grid).toHaveLength(2);
    expect(grid[1]).toBeCloseTo(1.414213562373095e6, 6);
  });

  it('keeps the DEC count', () => {
    expect(sweep('dec', 2, 1e3, 1e4)).toHaveLength(3);
  });

  it('parses .sens ac lin and .sens ac oct dot cards', () => {
    for (const variation of ['lin', 'oct'] as const) {
      expect(parse(`${rc}\n.sens v(1) ac ${variation} 2 1e3 1e4\n.end`).analyses).toEqual([{
        type: 'sens', outputNode: '1', mode: 'ac', variation, points: 2, startFreq: 1e3, stopFreq: 1e4,
      }]);
    }
  });
});
