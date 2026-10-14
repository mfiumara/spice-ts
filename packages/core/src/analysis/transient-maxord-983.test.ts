import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

const RC = `MAXORD regression
V1 in 0 PULSE(0 1 0 1n 1n 1m 2m)
R1 in out 1k
C1 out 0 1n
.tran 20n 1u
`;

const pump = readFileSync(new URL('../../../../benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/pump.cir', import.meta.url), 'utf8');

describe('ngspice MAXORD order cap (#983)', () => {
  it('admits the original corpus-k MOS charge pump', () => {
    expect(() => parse(pump)).not.toThrow();
  });

  it.each(['', 'timeint '])('uses backward Euler for %sMAXORD=1 with either METHOD', async prefix => {
    const euler = (await simulate(RC, { integrationMethod: 'euler' })).transient!;
    for (const method of ['trap', 'gear']) {
      const result = (await simulate(`${RC}.options ${prefix}method=${method} maxord=1\n.end`)).transient!;
      expect(Array.from(result.time)).toEqual(Array.from(euler.time));
      expect(result.voltage('out')).toEqual(euler.voltage('out'));
    }
  });

  it.each(['trap', 'gear'] as const)('retains %s order two for MAXORD=2', async method => {
    const expected = (await simulate(RC, { integrationMethod: method === 'trap' ? 'trapezoidal' : 'gear2' })).transient!;
    const result = (await simulate(`${RC}.options method=${method} maxord=2\n.end`)).transient!;
    expect(Array.from(result.time)).toEqual(Array.from(expected.time));
    expect(result.voltage('out')).toEqual(expected.voltage('out'));
  });

  it.each([
    '.options maxord=1 method=gear',
    '.options maxord=1\n.options method=gear',
    '.options method=gear\n.options maxord=1',
    '.options maxord=2\n.options maxord=1 method=trap',
    '.options maxord=0 method=trap',
  ])('keeps the cap independent of METHOD ordering: %s', async options => {
    const expected = (await simulate(RC, { integrationMethod: 'euler' })).transient!;
    const result = (await simulate(`${RC}${options}\n.end`)).transient!;
    expect(result.voltage('out')).toEqual(expected.voltage('out'));
  });

  it('restores order two after a later MAXORD=2', async () => {
    const expected = (await simulate(RC)).transient!;
    const result = (await simulate(`${RC}.options maxord=1\n.options maxord=2\n.end`)).transient!;
    expect(result.voltage('out')).toEqual(expected.voltage('out'));
  });
});
