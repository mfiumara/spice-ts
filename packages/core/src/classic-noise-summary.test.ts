import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, simulate } from './index.js';

const fixtureRoot = new URL('../../../benchmarks/corpus/classic/fixtures/spice3f5/', import.meta.url);

const fixtures = [
  ['bjtnoise.cir', 183, '183a30585cee976f2990857df941ca500aea2755a1e4ecf946c14699f09b36fc'],
  ['resnoise.cir', 329, '241ea1ce167a449e91b1cf29904f5c9513338cff31c2c0beb72a845482048661'],
] as const;

describe('classic .noise summary-point field', () => {
  it.each(fixtures)(
    'runs the unchanged %s fixture and preserves its summary interval',
    async (name, expectedBytes, expectedSha256) => {
      const fixture = readFileSync(new URL(name, fixtureRoot));

      expect(fixture.byteLength).toBe(expectedBytes);
      expect(createHash('sha256').update(fixture).digest('hex')).toBe(expectedSha256);
      expect(parse(fixture.toString('utf8')).analyses).toContainEqual(expect.objectContaining({
        type: 'noise',
        pointsPerSummary: 1,
      }));

      const noise = (await simulate(fixture.toString('utf8'))).noise;
      expect(noise).toBeDefined();
      expect(noise!.frequencies).toHaveLength(41);
    },
  );
});
