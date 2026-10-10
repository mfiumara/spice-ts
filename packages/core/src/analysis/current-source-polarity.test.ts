import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

describe('independent current-source polarity', () => {
  it('matches ngspice 47 positive-to-negative polarity in OP', async () => {
    const result = await simulate(`* current-source polarity OP
I1 out 0 DC 1m
R1 out 0 1k
.op
.end`);

    expect(result.dc!.voltage('out')).toBeCloseTo(-1, 12);
  });

  it('matches ngspice 47 positive-to-negative polarity in a DC sweep', async () => {
    const result = await simulate(`* current-source polarity DC sweep
I1 out 0 DC 0
R1 out 0 1k
.dc I1 -1m 1m 1m
.end`);

    expect([...result.dcSweep!.voltage('out')]).toEqual([1, 0, -1]);
  });

  it('keeps positive-to-negative polarity in transient stamping', async () => {
    const result = await simulate(`* current-source polarity transient
I1 out 0 DC 1m
R1 out 0 1k
.tran 1u 2u
.end`);

    expect(result.transient!.voltage('out').every(value => Math.abs(value + 1) < 1e-9)).toBe(true);
  });

  it('keeps DC bias polarity when an AC source value is declared', async () => {
    const result = await simulate(`* current-source DC bias with AC declaration
I1 out 0 DC 1m AC 0
R1 out 0 1k
.op
.ac lin 1 1k 1k
.end`);

    expect(result.dc!.voltage('out')).toBeCloseTo(-1, 12);
  });
});
