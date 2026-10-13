import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/index.js';
import { simulate } from '../../simulate.js';
import type { CodeModelCall } from './models.js';
import { sTransferBehavior } from './s-xfer.js';

const deck = (analysis: string, params = 'num_coeff=[1] den_coeff=[1 1.414214 1] denormalized_freq=628', source = 'dc 1 ac 1') =>
  ['s_xfer contract', `v1 in 0 ${source}`, 'a1 in out filter', `.model filter s_xfer(${params})`, 'r1 out 0 1k', analysis, '.end'].join('\n');

describe('bounded ngspice-47 s_xfer', () => {
  it('uses reversed integrator ICs at DC, not the DC Laplace gain', async () => {
    const result = await simulate(deck('.op', 'num_coeff=[2 3] den_coeff=[2 4 6] int_ic=[5 7] gain=3'));
    expect(result.dc!.voltage('out')).toBeCloseTo(31, 10);
  });
  it('defaults omitted ICs to zero', async () => {
    expect((await simulate(deck('.op'))).dc!.voltage('out')).toBe(0);
  });
  it('normalizes descending coefficients and frequency in AC', async () => {
    const result = await simulate(deck('.ac lin 1 100 100'));
    const value = result.ac!.voltage('out')[0];
    const w = 2 * Math.PI * 100 / 628;
    const re = 1 - w * w;
    const im = 1.414214 * w;
    expect(value.magnitude).toBeCloseTo(1 / Math.hypot(re, im), 10);
    expect(value.phase).toBeCloseTo(-Math.atan2(im, re) * 180 / Math.PI, 10);
  });
  it('runs deterministic transients across repeated simulations', async () => {
    const netlist = deck('.tran 10u 1m', 'num_coeff=[1] den_coeff=[1 1] denormalized_freq=1000', 'dc 1');
    const first = await simulate(netlist);
    const second = await simulate(netlist);
    const a = first.transient!.voltage('out');
    expect(a.at(-1)).toBeGreaterThan(0.6);
    expect(a.at(-1)).toBeLessThan(0.65);
    expect(second.transient!.voltage('out')).toEqual(a);
  });
  it('does not commit rejected trials and resets accepted integrator history', () => {
    const behavior = sTransferBehavior({ numerator: [1], denominator: [1, 1], initial: [0], gain: 1, offset: 0 });
    const call: CodeModelCall = {
      analysis: 'dc', init: true, time: 0, delta: 0,
      inputs: new Float64Array([1]), outputs: new Float64Array(1), partials: new Float64Array(1),
      notConverged() {},
    };
    behavior.accept!(call);
    const trial = (time: number, delta: number) => {
      const next = { ...call, analysis: 'tran' as const, init: false, time, delta };
      behavior.load(next);
      return next;
    };
    trial(0.1, 0.1);
    expect(call.outputs[0]).toBeCloseTo(0.1, 12);
    trial(1, 1); // rejected: no accept call
    const accepted = trial(0.2, 0.2);
    expect(call.outputs[0]).toBeCloseTo(0.2, 12);
    behavior.accept!(accepted);
    trial(0.3, 0.1);
    expect(call.outputs[0]).toBeCloseTo(0.28, 12);
    behavior.reset!();
    trial(0.1, 0.1);
    expect(call.outputs[0]).toBeCloseTo(0.1, 12);
  });
  it('supports differential current sensing and a differential voltage output in AC', async () => {
    const result = await simulate([
      'current input', 'i1 in 0 dc 0 ac 1', 'a1 %id(in 0) %vd(out 0) f',
      '.model f s_xfer(num_coeff=[1] den_coeff=[2 4] gain=3)',
      'r1 out 0 1k', '.ac lin 1 1 1', '.end',
    ].join('\n'));
    const value = result.ac!.voltage('out')[0];
    expect(value.magnitude).toBeCloseTo(3 / Math.hypot(4, 4 * Math.PI), 10);
    expect(value.phase).toBeCloseTo(180 - Math.atan2(4 * Math.PI, 4) * 180 / Math.PI, 10);
  });
  it('stamps current outputs with the ngspice sign in AC', async () => {
    const result = await simulate([
      'current output', 'v1 in 0 dc 0 ac 1', 'a1 %vd(in 0) %id(out 0) f',
      '.model f s_xfer(num_coeff=[1] den_coeff=[1 1])',
      'r1 out 0 1k', '.ac lin 1 1 1', '.end',
    ].join('\n'));
    const value = result.ac!.voltage('out')[0];
    expect(value.magnitude).toBeCloseTo(1000 / Math.hypot(1, 2 * Math.PI), 6);
    expect(value.phase).toBeCloseTo(180 - Math.atan2(2 * Math.PI, 1) * 180 / Math.PI, 10);
  });
  it('rejects missing coefficients and port types not allowed by ifspec', () => {
    expect(() => parse(deck('.op', 'num_coeff=[1]')).compile()).toThrow("'den_coeff'");
    expect(() => parse(deck('.op', 'den_coeff=[1 1]')).compile()).toThrow("'num_coeff'");
    expect(() => parse(deck('.op').replace('a1 in', 'a1 %vnam v1')).compile()).toThrow('Port type vnam is invalid');
  });
  it.each([
    ['num_coeff=[1] den_coeff=[1 1 1 1]', 'order'],
    ['num_coeff=[1 1 1] den_coeff=[1 1 1]', 'strictly proper'],
    ['num_coeff=[1] den_coeff=[0 1 1]', 'leading'],
    ['num_coeff=[1] den_coeff=[1 1 1] int_ic=[0]', 'int_ic'],
    ['num_coeff=[1] den_coeff=[1 1] denormalized_freq=0', 'positive'],
  ])('rejects unsupported or invalid parameters %s', (params, error) => {
    expect(() => parse(deck('.op', params)).compile()).toThrow(error);
  });
  it.each(['.noise v(out) v1 dec 2 1 10', '.tf v(out) v1', '.pz in 0 out 0 vol pz'])('rejects unsupported analysis %s', analysis => {
    expect(() => parse(deck(analysis)).compile()).toThrow('s_xfer');
  });
});
