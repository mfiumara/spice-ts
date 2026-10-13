import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

function valueAtOrAfter(time: number[], values: number[], target: number): number {
  const index = time.findIndex(point => point >= target);
  if (index < 0) throw new Error(`No transient sample at ${target}`);
  return values[index];
}

const fixture = (sourceResistance: number, loadResistance: number): string => `Lossless line step response
VSTEP source 0 PULSE(0 1 1n 100p 100p 100n 200n)
RS source input ${sourceResistance}
T1 input 0 output 0 Z0=50 TD=5n
RL output 0 ${loadResistance}
.tran 50p 20n 0 50p
.end
`;

/**
 * ngspice-47 `ngspice -b -r` points of the mismatched (25 ohm source, 100 ohm
 * load) fixture, which ngspice writes at 414 timepoints: the first load step,
 * the source return and the second load step (#791).
 */
const NGSPICE_MISMATCHED_POINTS = 414;
const NGSPICE_MISMATCHED: ReadonlyArray<{ time: number; node: string; value: number }> = [
  { time: 6.024999999999984e-9, node: 'output', value: 0.2222222222220827 },
  { time: 6.074999999999984e-9, node: 'output', value: 0.6666666666665237 },
  { time: 1.102500000000001e-8, node: 'input', value: 0.7037037037037044 },
  { time: 1.107500000000001e-8, node: 'input', value: 0.7777777777777789 },
  { time: 1.602500000000005e-8, node: 'output', value: 0.8641975308641655 },
  { time: 1.607500000000005e-8, node: 'output', value: 0.8148148148147826 },
];

describe('bounded lossless transmission line transient execution', () => {
  it('commits only accepted history and stays zero before source edge plus TD', async () => {
    // The input capacitor's charge truncation rejects a trial step on the
    // source edge; a rejected trial must not enter the line's history.
    const result = await simulate(parse(fixture(50, 50).replace('.tran', 'CI input 0 10p\n.tran')));
    const transient = result.transient!;
    const output = transient.voltage('output');
    const beforeArrival = output.filter((_value, index) => transient.time[index] < 6e-9);

    expect(result.convergence!.transient.rejectedSteps).toBeGreaterThan(0);
    expect(Math.max(...beforeArrival.map(Math.abs))).toBe(0);
    expect(valueAtOrAfter(transient.time, output, 10e-9)).toBeCloseTo(0.5, 3);
  });

  it('steps and interpolates like ngspice-47 TRA: no TD breakpoint, no node-voltage truncation (#791)', async () => {
    const result = await simulate(parse(fixture(25, 100)));
    const transient = result.transient!;

    expect(transient.time.length).toBe(NGSPICE_MISMATCHED_POINTS);
    expect(transient.time.some(time => Math.abs(time - 5e-9) < 1e-15)).toBe(false);
    for (const point of NGSPICE_MISMATCHED) {
      const index = transient.time.findIndex(time => Math.abs(time - point.time) < 1e-18);
      expect(index, `spice-ts has ngspice-47's point ${point.time}`).toBeGreaterThan(0);
      expect(Math.abs(transient.voltage(point.node)[index] - point.value)).toBeLessThan(1e-9);
    }
  });

  it('propagates a matched step by TD without a reflection', async () => {
    const result = await simulate(parse(fixture(50, 50)));
    const transient = result.transient!;
    const input = transient.voltage('input');
    const output = transient.voltage('output');

    expect(valueAtOrAfter(transient.time, input, 1.2e-9)).toBeCloseTo(0.5, 2);
    expect(valueAtOrAfter(transient.time, output, 5.9e-9)).toBeCloseTo(0, 2);
    expect(valueAtOrAfter(transient.time, output, 6.2e-9)).toBeCloseTo(0.5, 2);
    expect(valueAtOrAfter(transient.time, input, 11.2e-9)).toBeCloseTo(0.5, 2);
  });

  it('replays load and source reflections for a mismatched line', async () => {
    const result = await simulate(parse(fixture(25, 100)));
    const transient = result.transient!;
    const input = transient.voltage('input');
    const output = transient.voltage('output');

    // Initial wave: 50 / (25 + 50) = 2/3. Load reflection coefficient = 1/3.
    expect(valueAtOrAfter(transient.time, input, 1.2e-9)).toBeCloseTo(2 / 3, 2);
    expect(valueAtOrAfter(transient.time, output, 6.2e-9)).toBeCloseTo(8 / 9, 2);
    // The load reflection returns after 2*TD; source coefficient is -1/3.
    expect(valueAtOrAfter(transient.time, input, 11.2e-9)).toBeCloseTo(22 / 27, 2);
    expect(valueAtOrAfter(transient.time, output, 16.2e-9)).toBeCloseTo(64 / 81, 2);
  });
});
