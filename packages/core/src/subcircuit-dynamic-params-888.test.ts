import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// Same-byte ngspice-47 OP references, pinned source a80f6e3e95d51534905b1f23410a951802666656.
// Full raw outputs, deck hashes and commands live in the scoped before/after receipts.
const fixtures = new URL('../../../benchmarks/dynamic-numparam-fix-888/', import.meta.url);
interface ReferenceCase { id: string; referenceValues: Record<string, number> }
const cases = (JSON.parse(readFileSync(new URL('before.json', fixtures), 'utf8')) as {
  rows: ReferenceCase[];
}).rows;

describe('dynamic caller parameters with lexical definitions/models (#888, ngspice-47)', () => {
  it.each(cases)('$id matches the fresh same-byte OP reference', async ({ id, referenceValues }) => {
    const deck = readFileSync(new URL(`decks/${id}.cir`, fixtures), 'utf8');
    const result = await simulate(deck);
    expect(result.dc).toBeDefined();
    for (const [name, reference] of Object.entries(referenceValues)) {
      const match = /^([vi])\(([^)]+)\)$/.exec(name)!;
      const actual = match[1] === 'v' ? result.dc!.voltage(match[2]) : result.dc!.current(match[2]);
      // One shared tolerance, unchanged from provisional diagnosis. No per-case tuning.
      expect(Math.abs(actual - reference)).toBeLessThanOrEqual(Math.max(1e-12, Math.abs(reference) * 1e-6));
    }
  });
});
