import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { OSCILLATOR_BEHAVIORS } from './oscillator-models.js';
import type { CodeModelCall, ResolvedXspiceParams } from './models.js';

function model(name: string, values: Record<string, number | boolean | number[]>) {
  const params: ResolvedXspiceParams = new Map(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  const factory = OSCILLATOR_BEHAVIORS.get(name as 'sine' | 'triangle' | 'oneshot');
  expect(factory, name).toBeDefined();
  return factory!(params, {
    connections: ['clk', 'cntl_in', 'clear'].map(name => ({ name, direction: 'in' as const, isNull: false, ports: [{ type: 'v' as const }] })),
    netlist: { capacitance: () => 0, inductance: () => 0 },
  });
}
function call(time: number, delta: number, inputs: number[], analysis: 'dc' | 'tran' = 'tran'): CodeModelCall {
  return { time, delta, inputs: Float64Array.from(inputs), outputs: new Float64Array(1), partials: new Float64Array(inputs.length), analysis, init: false, notConverged() {} };
}
const triangleParams = { cntl_array: [0, 1, 2], freq_array: [1, 2, 4], out_low: -2, out_high: 6, duty_cycle: 0.25 };
const pulseParams = { cntl_array: [0, 1], pw_array: [0.2, 0.4], clk_trig: 0.5, pos_edge_trig: true, out_low: -2, out_high: 6, rise_delay: 0.01, rise_time: 0.02, fall_delay: 0.03, fall_time: 0.04, retrig: false };

describe('ngspice triangle and oneshot (#1178)', () => {
  it.each([[-1, 1e-16], [0, 1], [0.5, 1.5], [1.5, 3], [3, 6]])('triangle control %s interpolates/extrapolates to %s Hz', (input, freq) => {
    const b = model('triangle', triangleParams);
    const dc = call(0, 0, [input], 'dc'); b.load(dc); expect(dc.outputs[0]).toBe(-2);
    for (let i = 1; i <= 80; i++) {
      const t = i / (80 * freq);
      const c = call(t, 1 / (80 * freq), [input]); b.load(c);
      const p = i === 80 ? 0 : i / 80;
      const expected = p < 0.25 ? -2 + 8 * p / 0.25 : 6 - 8 * (p - 0.25) / 0.75;
      expect(c.outputs[0]).toBeCloseTo(expected, 10); b.accept?.(c);
    }
  });
  it.each([false, true])('oneshot width interpolation, delays and retrigger=%s', retrig => {
    const b = model('oneshot', { ...pulseParams, retrig });
    let previous = 0;
    const sample = (t: number, clk: number, expected: number, clear = 0) => {
      const c = call(t, t - previous, [clk, 0.5, clear]);
      b.load(c); b.load(c); // repeated Newton loads must not commit history
      expect(c.outputs[0]).toBeCloseTo(expected, 10); b.accept?.(c); previous = t;
    };
    sample(0.1, 1, -2); sample(0.12, 1, 2); sample(0.14, 0, 6);
    sample(0.2, 1, 6);
    sample(0.48, 1, retrig ? 6 : 2);
    sample(0.58, 1, retrig ? 2 : -2);
    sample(0.61, 0, -2); sample(0.7, 1, -2); sample(0.74, 1, 6);
    sample(0.75, 1, -2, 1);
  });
  it('oneshot negative edge, null-equivalent zero control, and reset', () => {
    const b = model('oneshot', { ...pulseParams, pos_edge_trig: false });
    const high = call(0.01, 0.01, [1, 0, 0]); b.load(high); b.accept?.(high);
    const edge = call(0.1, 0.09, [0, 0, 0]); b.load(edge); b.accept?.(edge);
    const middle = call(0.2, 0.1, [0, 0, 0]); b.load(middle); expect(middle.outputs[0]).toBe(6);
    b.reset?.(); b.load(middle); expect(middle.outputs[0]).toBe(-2);
  });
  it('registers both models and returns low DC outputs and zero AC gain', async () => {
    const result = await simulate(['analog4 defaults', 'v1 1 0 dc 0 ac 1',
      'a1 1 2 tri', '.model tri triangle', 'r2 2 0 1k',
      'a2 1 null null 3 one', '.model one oneshot(cntl_array=[0 1] pw_array=[1u 2u])', 'r3 3 0 1k',
      '.op', '.ac lin 1 1 1', '.end'].join('\n'));
    expect(result.dc!.voltage('2')).toBe(-1); expect(result.dc!.voltage('3')).toBe(0);
    expect(result.ac!.voltage('2')[0].magnitude).toBe(0); expect(result.ac!.voltage('3')[0].magnitude).toBe(0);
  });
  it('runs transient stamps with scheduled triangle and oneshot corners', async () => {
    const result = await simulate(['analog4 transient', 'v1 1 0 dc 0',
      'vclk clk 0 PWL(0 0 0.099 0 0.1 1 1.2 1)',
      'a1 1 2 tri', '.model tri triangle(cntl_array=[0 1] freq_array=[1 1] duty_cycle=0.25 out_low=-2 out_high=6)', 'r2 2 0 1k',
      'a2 clk null null 3 one', '.model one oneshot(cntl_array=[0 1] pw_array=[0.2 0.4] rise_delay=0.01 rise_time=0.02 fall_delay=0.03 fall_time=0.04 out_low=-2 out_high=6)', 'r3 3 0 1k',
      '.tran 0.01 1.2', '.end'].join('\n'));
    const tran = result.transient!;
    const tri = tran.voltage('2');
    for (let i = 0; i < tran.time.length; i++) {
      const p = tran.time[i] % 1;
      const expected = p < 0.25 ? -2 + 8 * p / 0.25 : 6 - 8 * (p - 0.25) / 0.75;
      expect(tri[i]).toBeCloseTo(expected, 9);
    }
    expect(tran.time.some(t => Math.abs(t - 0.25) < 1e-10)).toBe(true);
    const pulse = tran.voltage('3');
    expect(pulse[tran.time.findIndex(t => t >= 0.2)]).toBe(6);
    expect(pulse[tran.time.findIndex(t => t >= 0.8)]).toBe(-2);
  });
});
