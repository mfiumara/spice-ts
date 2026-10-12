import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #654: ngspice-47 builds `.dc` sweep values by repeated `+= step` (dctrcurv.c) and
 * `.ac` frequencies by repeated `*= ratio` / `+= delta` (acan.c), so grid points carry the
 * accumulated rounding (e.g. `.dc v1 -1 2 0.01` ends on 2.000000000000002). The fixture holds the
 * raw scale vectors from ngspice-47 binary rawfiles for the same netlists.
 */
interface SweepCase {
  netlist: string;
  sweep?: number[];
  secondary?: number[];
  frequency?: number[];
}

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/ngspice47-sweep-scales.json', import.meta.url), 'utf8',
)) as { cases: Record<string, SweepCase> };

const cases = Object.entries(fixture.cases);
const deck = (netlist: string) => `t\n${netlist}\n.end`;

describe('ngspice-47 sweep scale accumulation (#654)', () => {
  it('reproduces the issue repro values bit-exactly', async () => {
    const dc = (await simulate(deck('V1 a 0 0\nR1 a 0 1k\n.dc v1 -1 2 0.01'))).dcSweep!;
    expect(dc.sweepValues[100]).toBe(7.528699885739343e-16);
    expect(dc.sweepValues[300]).toBe(2.000000000000002);

    const ac = (await simulate(deck('V1 a 0 ac 1\nR1 a b 1k\nC1 b 0 1u\n.ac dec 50 100 100k'))).ac!;
    expect(ac.frequencies[100]).toBe(10000.000000000078);
    expect(ac.frequencies).toHaveLength(151);
  });

  it.each(cases.filter(([name]) => name.startsWith('dc ')))(
    '.%s matches the ngspice-47 sweep scale', async (_name, expected) => {
      const result = (await simulate(deck(expected.netlist))).dcSweep!;
      expect([...result.sweepValues]).toEqual(expected.sweep);
      if (expected.secondary !== undefined) {
        expect([...result.secondarySweepValues!]).toEqual(expected.secondary);
      }
    },
  );

  it.each(cases.filter(([name]) => name.startsWith('ac ')))(
    '.%s matches the ngspice-47 frequency scale', async (_name, expected) => {
      const frequencies = (await simulate(deck(expected.netlist))).ac!.frequencies;
      expect(frequencies).toHaveLength(expected.frequency!.length);
      // acan.c computes the ratio with libm exp/log; allow 1 ULP for a differing libm.
      frequencies.forEach((frequency, index) => {
        const reference = expected.frequency![index]!;
        expect(Math.abs(frequency - reference)).toBeLessThanOrEqual(ulp(reference));
      });
    },
  );
});

function ulp(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude === 0) return Number.MIN_VALUE;
  return 2 ** (Math.floor(Math.log2(magnitude)) - 52);
}
