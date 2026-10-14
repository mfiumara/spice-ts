import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type Trial = { name: string; sha256: string; own: Record<string, number>; native: Record<string, number>; exitCode: number; diagnostics: string };
const receipt = JSON.parse(readFileSync('benchmarks/results/issue-1049/rootcause.json', 'utf8')) as { trials: Trial[] };
const trial = (name: string) => { const found = receipt.trials.find(row => row.name === name); assert(found, name); return found; };
const near = (actual: number, expected: number, tolerance: number) => assert(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test('all 20 diagnostic trials retain finite points, native success and no vendor echoes', () => {
  assert.equal(receipt.trials.length, 20);
  assert.equal(new Set(receipt.trials.map(row => row.name)).size, 20);
  for (const row of receipt.trials) {
    assert.equal(row.exitCode, 0);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert(Object.keys(row.own).length && Object.keys(row.native).length);
    assert(Object.values(row.own).every(Number.isFinite));
    assert(Object.values(row.native).every(Number.isFinite));
    assert(!/(?:^|\n)\s*(?:\.model\b|\+)/i.test(row.diagnostics));
  }
});

test('linear option probe proves native narrowing above signed int max, not diode or MOS error', () => {
  for (const name of ['2147483647', '2147483648', '3G', '1T']) near(trial(`linear-${name}`).native['i(vbias)'], -5 / 2147483647, 1e-23);
  near(trial('linear-1G').native['i(vbias)'], -5e-9, 1e-23);
  near(trial('linear-1T').own['i(vbias)'], -5e-12, 1e-26);
  for (const engine of ['own', 'native'] as const) {
    near(trial('linear-1000000000000.5')[engine]['i(vbias)'], -5 / 1000000000000.5, 1e-26);
    near(trial('linear-explicit-resistor')[engine]['i(vbias)'], -5e-12, 1e-26);
  }
});

test('full original loss remains published; separately matched shunt experiments explain it', () => {
  const original = trial('full-1T');
  near(original.own['i(v159)'], -0.0013554713473383079, 1e-15);
  near(original.native['i(v159)'], -0.001237320859729758, 1e-15);
  near(original.own['v(net-_q37-s_)'], -0.0016983367337954761, 1e-12);
  near(original.native['v(net-_q37-s_)'], -0.1043817443873431, 1e-12);
  const capped = trial('full-2147483647');
  near(capped.own['i(v159)'], capped.native['i(v159)'], 1e-13);
  near(capped.own['v(net-_q37-s_)'], capped.native['v(net-_q37-s_)'], 1e-7);
  const physical = trial('full-1000000000000.5');
  near(physical.own['i(v159)'], physical.native['i(v159)'], 1e-12);
  near(physical.own['v(net-_q37-s_)'], physical.native['v(net-_q37-s_)'], 3e-7);
});

test('prior native disable KCL residual disappears with measured native shunt', () => {
  const prior = JSON.parse(readFileSync('benchmarks/results/issue-1049/receipt.json', 'utf8'));
  for (const [point, disable, prefix] of [
    [prior.disable.native.point, 'disa', ''],
    [prior.baseline.native.point, 'unconnected-_u68-_dis-pad8_', 'xu68.'],
  ] as const) {
    const value = point[`v(${disable})`];
    const resistor = (value - point[`v(${prefix}10)`]) / 5625;
    assert(Math.abs(resistor + value / 1e12) > 9e-10);
    near(resistor + value / 2147483647, 0, 1e-18);
  }
});
