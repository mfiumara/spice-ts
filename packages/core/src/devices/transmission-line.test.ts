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

describe('bounded lossless transmission line transient execution', () => {
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
