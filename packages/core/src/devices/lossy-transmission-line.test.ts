import { describe, expect, it } from 'vitest';
import { parseTitleless as parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

const lineStep = `V1 source 0 PULSE(0 1 1n 100p 100p 100n 200n)
RS source input 50
O1 input 0 output 0 LMOD
RL output 0 50
.model LMOD LTRA(R=2 L=250n G=0 C=100p LEN=1 STEPLIMIT)
.tran 20p 12n 0 20p
`;

describe('benchmark-bounded lossy LTRA line', () => {
  it('executes a delayed and attenuated transient response', async () => {
    const result = await simulate(parse(lineStep));
    const transient = result.transient!;
    const output = transient.voltage('output');
    const beforeDelay = output.filter((_value, index) => transient.time[index] < 5.5e-9);

    // The bounded ladder has small numerical precursor dispersion before the
    // nominal 5 ns flight time; keep that approximation explicit and bounded.
    expect(Math.max(...beforeDelay.map(Math.abs))).toBeLessThan(0.07);
    expect(output.at(-1)).toBeGreaterThan(0.4);
    expect(output.at(-1)).toBeLessThan(0.55);
    expect(Math.max(...output)).toBeLessThan(0.7);
  });
});