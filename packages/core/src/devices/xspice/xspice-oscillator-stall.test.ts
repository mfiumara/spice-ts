import { expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

it.each([
  ['triangle', 2, 10000, ''],
  ['square', 10, 7000, 'rise_time=1u fall_time=2u'],
])('finishes a ramp-controlled %s transient without a timestep stall (#1210)', async (model, end, frequency, edges) => {
  const result = await simulate(`ramp-controlled oscillator
v1 c 0 PWL(0 0 2m ${end})
a1 c o osc
.model osc ${model}(cntl_array=[-1 0 10 20] freq_array=[500 500 ${frequency} ${frequency}] duty_cycle=0.5 out_low=-1 out_high=1 ${edges})
r1 o 0 10k
.tran 10u 2m
.end`);
  const tran = result.transient!;
  expect(tran.time.at(-1)).toBe(0.002);
  expect(tran.time.length).toBeLessThan(10000);
  expect(Array.from(tran.voltage('o')).every(Number.isFinite)).toBe(true);
});
