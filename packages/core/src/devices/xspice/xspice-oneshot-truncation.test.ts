import { expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

it('does not apply artificial node-voltage LTE to oneshot edges (#1211)', async () => {
  // cm_oneshot stores clock and corner times, not integrated charge. Its
  // prescribed finite ramps must not trigger the node-voltage LTE predictor.
  const result = await simulate(`oneshot edge truncation
vclk clk 0 PWL(0 0 0.1 0 0.11 1 1 1)
a1 clk null null o one
.model one oneshot(cntl_array=[0 1] pw_array=[0.2 0.2] rise_delay=0.001 rise_time=0.002 fall_delay=0.001 fall_time=0.003 out_low=-2 out_high=6)
r1 o 0 1k
.tran 0.01 0.6
.end`);
  expect(result.convergence!.transient.lteRetries).toBe(0);
  const tran = result.transient!;
  const start = tran.time.findIndex((time, i) => time > 0.1 && tran.voltage('clk')[i] > 0.5);
  expect(start).toBeGreaterThan(0);
  const t1 = tran.time[start] + 0.001;
  const t2 = t1 + 0.002;
  const t3 = t2 + 0.2 + 0.001;
  const t4 = t3 + 0.003;
  for (const corner of [t1, t2, t3, t4]) {
    expect(tran.time.some(time => Math.abs(time - corner) < 1e-10)).toBe(true);
  }
  const output = tran.voltage('o');
  for (let i = 0; i < tran.time.length; i++) {
    const time = tran.time[i];
    const expected = time < t1 ? -2 : time < t2 ? -2 + 8 * (time - t1) / 0.002
      : time < t3 ? 6 : time < t4 ? 6 - 8 * (time - t3) / 0.003 : -2;
    expect(output[i]).toBeCloseTo(expected, 8);
  }
});
