import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { OSCILLATOR_BEHAVIORS } from './oscillator-models.js';
import { XSPICE_CODE_MODEL_SPECS } from './spec.js';
import { resolveXspiceParams } from './connections.js';
import { zener } from './zener.js';
import type { CodeModelCall } from './models.js';

const squareParams = new Map(Object.entries({ cntl_array: [0, 1, 2], freq_array: [1, 2, 4], out_low: [-2], out_high: [6], duty_cycle: [0.25], rise_time: [0.02], fall_time: [0.04] }));
function call(time: number, delta: number, input: number, analysis: 'dc' | 'tran' = 'tran'): CodeModelCall {
  return { time, delta, inputs: Float64Array.of(input), outputs: new Float64Array(1), partials: new Float64Array(1), analysis, init: false, notConverged() {} };
}

describe('XSPICE square (#1188)', () => {
  it.each([[0, 1], [0.5, 1.5], [1.5, 3], [3, 6]])('control %s gives %s Hz with finite edges and high duty cycle', (input, frequency) => {
    const factory = OSCILLATOR_BEHAVIORS.get('square');
    expect(factory).toBeDefined();
    const b = factory!(squareParams, { connections: [], netlist: { capacitance: () => 0, inductance: () => 0 } });
    const dc = call(0, 0, input, 'dc'); b.load(dc); expect(dc.outputs[0]).toBe(-2);
    let previous = 0;
    for (const t of [0.5 / frequency, 0.75 / frequency, 0.75 / frequency + 0.01, 0.75 / frequency + 0.02, 0.95 / frequency, 1 / frequency, 1 / frequency + 0.02, 1 / frequency + 0.04]) {
      const c = call(t, t - previous, input);
      b.load(c); b.load(c);
      const expected = t <= 0.75 / frequency ? -2 : t < 0.75 / frequency + 0.02 ? 2 : t <= 1 / frequency ? 6 : t < 1 / frequency + 0.04 ? 2 : -2;
      expect(c.outputs[0]).toBeCloseTo(expected, 9);
      expect(c.partials[0]).toBe(0); b.accept?.(c); previous = t;
    }
    b.reset?.(); b.load(dc); expect(dc.outputs[0]).toBe(-2);
  });
  it('registers square and stamps low DC and zero AC gain', async () => {
    const r = await simulate('square\nv1 c 0 dc 0 ac 1\na1 c o sq\n.model sq square(cntl_array=[0 1] freq_array=[1 2])\nr1 o 0 1k\n.op\n.ac lin 1 1 1\n.end');
    expect(r.dc!.voltage('o')).toBe(-1);
    expect(r.ac!.voltage('o')[0].magnitude).toBe(0);
  });
  it('schedules transient edges over multiple periods', async () => {
    const r = await simulate('square\nv1 c 0 0\na1 c o sq\n.model sq square(cntl_array=[0 1] freq_array=[1 1] out_low=-2 out_high=6 duty_cycle=0.25 rise_time=0.02 fall_time=0.04)\nr1 o 0 1k\n.tran 0.01 2.2\n.end');
    const tran = r.transient!;
    for (const t of [0.75, 0.77, 1, 1.04, 1.75, 1.77, 2, 2.04]) {
      expect(tran.time.some(time => Math.abs(time - t) < 1e-10)).toBe(true);
    }
    const output = tran.voltage('o');
    for (let i = 0; i < tran.time.length; i++) {
      const time = tran.time[i];
      const p = time % 1;
      const expected = time >= 1 && p < 0.04 ? 6 - 8 * p / 0.04 : p <= 0.75 ? -2 : p < 0.77 ? -2 + 8 * (p - 0.75) / 0.02 : 6;
      expect(output[i]).toBeCloseTo(expected, 8);
    }
  });
});

describe('XSPICE zener (#1188)', () => {
  it.each([
    [0, 0],
    [0.026 * Math.log(2), 1e-12 + 1e-6 / 9 * 0.026 * Math.log(2)],
    [-1, -1.1111219303527714e-7],
    [-9, -0.02000100000182006],
  ])('default characteristic at %s V', async (v, current) => {
    const r = await simulate(`zener\nv1 z 0 ${v}\na1 (z 0) zd\n.model zd zener(v_breakdown=9)\n.op\n.end`);
    expect(r.dc!.current('v1')).toBeCloseTo(-current, 10);
  });
  it('uses custom forward emission and leakage parameters', async () => {
    const r = await simulate(`zener\nv1 z 0 ${0.052 * Math.log(3)}\na1 (z 0) zd\n.model zd zener(v_breakdown=5 i_breakdown=0.01 r_breakdown=2 i_rev=2u i_sat=2p n_forward=2)\n.op\n.end`);
    expect(r.dc!.current('v1')).toBeCloseTo(-(4e-12 + 2e-6 / 5 * 0.052 * Math.log(3)), 12);
  });
  it('uses breakdown current and resistance at the specified knee', () => {
    const b = zener(new Map<string, (number | boolean)[]>(Object.entries({ v_breakdown: [5], i_breakdown: [0.01], r_breakdown: [2], i_rev: [2e-6], i_sat: [2e-12], n_forward: [2], limit_switch: [false] })));
    const c = call(0, 0, -5, 'dc'); b.load(c);
    expect(c.outputs[0]).toBeCloseTo(-0.010002, 10);
    expect(c.partials[0]).toBeCloseTo(0.5 + 2e-6 / 5, 12);
  });
  it('requires v_breakdown', () => {
    const spec = XSPICE_CODE_MODEL_SPECS.get('zener');
    expect(spec).toBeDefined();
    expect(() => resolveXspiceParams('a1', { name: 'zd', codeModel: 'zener', params: new Map(), warnings: [], raw: '' }, spec!, [])).toThrow();
  });
  it.each([9, 0.01])('analytic partials agree with finite differences in all regions, breakdown=%s', breakdown => {
    const params = new Map<string, (number | boolean)[]>(Object.entries({ v_breakdown: [breakdown], i_breakdown: [0.02], r_breakdown: [1], i_rev: [1e-6], i_sat: [1e-12], n_forward: [1], limit_switch: [false] }));
    const b = zener(params);
    for (const v of breakdown === 9 ? [-9, -8.5, -1, -0.154723039, 0, 0.1] : [-0.01, -0.001, 0, 0.001, 0.1]) {
      const c = call(0, 0, v, 'dc'); b.load(c);
      const plus = call(0, 0, v + 1e-8, 'dc'); b.load(plus);
      const minus = call(0, 0, v - 1e-8, 'dc'); b.load(minus);
      const numerical = (plus.outputs[0] - minus.outputs[0]) / 2e-8;
      expect(Math.abs(c.partials[0] - numerical) / c.partials[0]).toBeLessThan(1e-6);
    }
  });
  it('limits Newton voltages without changing the converged characteristic', async () => {
    const deck = (limit: boolean) => `zener\nv1 in 0 10\nr1 in z 100\na1 (0 z) zd\n.model zd zener(v_breakdown=9 limit_switch=${limit})\n.options reltol=1e-9 abstol=1e-14 vntol=1e-12\n.op\n.ac lin 1 1 1\n.end`;
    const limited = await simulate(deck(true));
    const unlimited = await simulate(deck(false));
    expect(limited.dc!.voltage('z')).toBeCloseTo(unlimited.dc!.voltage('z'), 7);
  });
});
