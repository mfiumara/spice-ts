import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import type { TransientResult } from '../results.js';

let result: TransientResult;
beforeAll(async () => {
  const deck = readFileSync(new URL(
    '../../../../benchmarks/corpus/corpus-m/fixtures/xyce/Netlists/MOSFET_ParamAliases/invert6.cir',
    import.meta.url,
  ), 'utf8');
  result = (await simulate(deck)).transient!;
});

it('executes invert6 and captures the real pulse-corner loss (#1083)', () => {
  const index = Array.from(result.time).findIndex(time => Math.abs(time - 24.01e-6) < 1e-16);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(result.voltage('vout')[index]).toBeCloseTo(2.6045200148098373, 7);
});

// Diagnosis-only RED: no simulator fix or corpus tolerance change in this PR.
it.fails('matches the ngspice-47 invert6 output at the first >50mV divergence (#1083)', () => {
  const time = 7.503635195073706e-6;
  // Literal ngspice-47 original-byte raw samples bracketing `time`.
  // Linear interpolation is diagnostic only; the corpus thresholds are unchanged.
  const left = { time: 7.503476087126555e-6, voltage: 0.1982015417437147 };
  const right = { time: 7.504238043563278e-6, voltage: 1.558072029153652 };
  const reference = left.voltage + (right.voltage - left.voltage)
    * (time - left.time) / (right.time - left.time);
  let i = 1;
  while (result.time[i] < time) i++;
  const voltage = result.voltage('vout');
  const actual = voltage[i - 1] + (voltage[i] - voltage[i - 1])
    * (time - result.time[i - 1]) / (result.time[i] - result.time[i - 1]);
  expect(Math.abs(actual - reference)).toBeLessThan(0.05);
});

it.fails('matches ngspice-47 at the shared 24.01us pulse corner without interpolation (#1083)', () => {
  const index = Array.from(result.time).findIndex(time => Math.abs(time - 24.01e-6) < 1e-16);
  // Actual ngspice-47 raw point at 0.00002401 s, not an interpolated reference.
  expect(Math.abs(result.voltage('vout')[index] - 1.793502756361089)).toBeLessThan(0.05);
});
