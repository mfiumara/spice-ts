import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTitleless as parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

const classicFixture = readFileSync(new URL(
  '../../../../benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir',
  import.meta.url,
));

const lineStep = `V1 source 0 PULSE(0 1 1n 100p 100p 100n 200n)
RS source input 50
O1 input 0 output 0 LMOD
RL output 0 50
.model LMOD LTRA(R=2 L=250n G=0 C=100p LEN=1 STEPLIMIT)
.tran 20p 12n 0 20p
`;

describe('benchmark-bounded lossy LTRA line', () => {
  it('executes the unchanged classic 24-inch lossy-line fixture', async () => {
    expect(createHash('sha256').update(classicFixture).digest('hex'))
      .toBe('53e333e9629c3e3c4e839c4b72c9a512a220dec4baf0536e36626f290d240cd6');

    const result = await simulate(classicFixture.toString('utf8'));

    expect(result.transient?.time.length).toBeGreaterThan(1);
    expect(result.transient?.time.at(-1)).toBeCloseTo(60e-9, 15);
  }, 15_000);

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