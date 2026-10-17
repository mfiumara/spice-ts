import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Byte-identical ngspice regression decks; provenance: benchmarks/SOURCES.md.
describe('ngspice behavioral expression regression decks (#1196)', () => {
  it.each([['parser/bxpressn-1', 155], ['func/func-1', 15]] as const)(
    '%s matches its ngspice golden node voltages', async (fixture, count) => {
      const deck = readFileSync(new URL(
        `../../../../benchmarks/corpus/corpus-f/fixtures/tests/regression/${fixture}.cir`, import.meta.url,
      ), 'utf8');
      const result = await simulate(deck);
      for (let n = 1001; n < 1001 + count; n++) {
        expect(result.dc!.voltage(`n${n}_t`), `test ${n}`).toBeCloseTo(result.dc!.voltage(`n${n}_g`), 8);
      }
    },
  );
});
