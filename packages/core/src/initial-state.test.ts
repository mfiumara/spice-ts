import { describe, expect, it } from 'vitest';
import { parse, simulate } from './index.js';

describe('initial-state semantics', () => {
  it('parses .ic and .nodeset into distinct typed node state', () => {
    const compiled = parse(`
      V1 in 0 DC 1
      R1 in out 1k
      R2 out 0 1k
      .ic V(out)=3 V(in) = 2
      .nodeset V(out)=0.25
      .tran 1u 2u UIC
    `).compile();

    expect(compiled.initialConditions).toEqual([
      { node: 'out', value: 3 },
      { node: 'in', value: 2 },
    ]);
    expect(compiled.nodeSets).toEqual([{ node: 'out', value: 0.25 }]);
    expect(compiled.analyses).toContainEqual({
      type: 'tran', timestep: 1e-6, stopTime: 2e-6, useInitialConditions: true,
    });
  });

  it('uses .ic only as a DC initial guess when UIC is absent', async () => {
    const result = await simulate(`
      V1 out 0 DC 1
      R1 out 0 1k
      .ic V(out)=3
      .tran 1u 2u
    `);

    expect(result.transient?.time[0]).toBe(0);
    expect(result.transient?.voltage('out')[0]).toBeCloseTo(1, 9);
  });

  it('uses .nodeset as a Newton initial guess without forcing the operating point', async () => {
    const result = await simulate(`
      V1 in 0 DC 1
      R1 in out 1k
      R2 out 0 1k
      .nodeset V(out)=9
      .op
    `);

    expect(result.dc?.voltage('out')).toBeCloseTo(0.5, 9);
  });

  it('skips the operating point and applies .ic at t=0 with UIC', async () => {
    const result = await simulate(`
      R1 out 0 1k
      C1 out 0 1u
      .ic V(out)=3
      .tran 1u 2u UIC
    `);

    expect(result.transient?.time[0]).toBe(0);
    expect(result.transient?.voltage('out')[0]).toBeCloseTo(3, 9);
    expect(result.transient?.voltage('out').at(-1)).toBeLessThan(3);
  });
});
