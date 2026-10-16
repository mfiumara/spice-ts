import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { astate } from './astate-model.js';
import type { CodeModelCall } from './models.js';

function call(input: number, time: number, analysis: CodeModelCall['analysis'] = 'tran'): CodeModelCall {
  return { inputs: Float64Array.of(input), outputs: new Float64Array(1), partials: new Float64Array(1),
    time, delta: 1, analysis, init: false, notConverged() {} };
}

describe('XSPICE astate accepted-point history (#1222)', () => {
  it.each([0, 1, 2, 3])('delays stepped input by %i accepted points, not Newton loads or rejected trials', depth => {
    const model = astate(new Map([['astate_no', [depth]]]));
    const dc = call(2, 0, 'dc');
    model.load(dc);
    expect(dc.outputs[0]).toBe(2);
    model.accept?.(dc);
    const history = [2, 0, 0];
    for (let time = 1; time <= 7; time++) {
      model.load(call(999, time + 0.5)); // rejected future trial
      const c = call(time < 3 ? 2 : 5, time);
      model.load(c); model.load(c);
      expect(c.outputs[0]).toBe(depth === 0 ? c.inputs[0] : history[depth - 1]);
      expect(c.partials[0]).toBe(depth === 0 ? 1 : 0);
      model.accept?.(c);
      history.unshift(c.inputs[0]); history.pop();
    }
    model.reset?.();
    const restarted = call(9, 1); model.load(restarted);
    expect(restarted.outputs[0]).toBe(depth === 0 ? 9 : 0);
  });

  it('registers default delay and DC passthrough', async () => {
    const result = await simulate('astate DC\nv1 in 0 dc 2 ac 1\na1 in out state\n.model state astate\nr1 out 0 1k\n.op\n.ac lin 1 1 1\n.end');
    expect(result.dc!.voltage('out')).toBe(2);
    expect(result.ac!.voltage('out')[0].magnitude).toBe(0);
  });

  it('uses accepted solver points without introducing artificial node LTE', async () => {
    const result = await simulate('astate steps\nv1 in 0 PWL(0 0 1u 0 2u 5 10u 5)\na1 in out state\n.model state astate(astate_no=2)\nr1 out 0 1k\n.tran 0.1u 10u\n.end');
    const tran = result.transient!;
    const input = tran.voltage('in');
    const output = tran.voltage('out');
    expect(tran.time.length).toBeLessThan(150);
    for (let i = 2; i < tran.time.length; i++) expect(output[i]).toBeCloseTo(input[i - 2], 12);
  });

  it.each(['astate.cir', 'astate_pulse.cir'])('runs unchanged corpus-f %s', async file => {
    const deck = readFileSync(new URL(`../../../../../benchmarks/corpus/corpus-f/fixtures/examples/xspice/various/${file}`, import.meta.url), 'utf8');
    const result = await simulate(deck);
    expect(result.transient!.time.length).toBeGreaterThan(100);
    const output = result.transient!.voltage(file === 'astate.cir' ? 'out' : 'iout');
    expect(Array.from(output).every(Number.isFinite)).toBe(true);
    expect(Math.max(...output) - Math.min(...output)).toBeGreaterThan(0.5);
  });
});
