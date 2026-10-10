import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

const fixtureBytes = readFileSync(new URL(
  '../../../benchmarks/corpus/classic/fixtures/spice3f5/rca3040.cir',
  import.meta.url,
));

describe('RCA3040 BJT convergence', () => {
  it('runs the unchanged classic fixture through DC, AC, and transient analyses', async () => {
    expect(fixtureBytes).toHaveLength(1023);
    expect(createHash('sha256').update(fixtureBytes).digest('hex'))
      .toBe('5024b28b797b53f35d838e1fefeecae059302c4b0106485ff711c9306eedfad1');

    const result = await simulate(fixtureBytes.toString('utf8'));

    expect(result.dcSweep?.sweepValues).toHaveLength(101);
    expect(result.ac?.frequencies).toHaveLength(101);
    expect(result.transient?.time.at(-1)).toBeCloseTo(200e-9, 15);
    expect(result.convergence?.dc.failure).toBeNull();
    expect(result.convergence?.transient.failure).toBeNull();
  });
});
