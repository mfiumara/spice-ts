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

  it('matches ngspice 47 current-source AC magnitude and phase', async () => {
    const result = await simulate(`* current-source polarity AC
I1 out 0 DC 0 AC 1m
R1 out 0 1k
.ac lin 1 1k 1k
.end`);
    const output = result.ac!.voltage('out')[0];

    expect(output.magnitude).toBeCloseTo(1, 12);
    expect(Math.abs(output.phase)).toBeCloseTo(180, 12);
  });
});
