import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Circuit, parse, simulate } from './index.js';

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

  it('preserves the summary interval when serializing a parsed circuit', () => {
    const circuit = parse('V1 in 0 AC 1\nR1 in 0 1k\n.noise v(in) V1 dec 3 100 10k 2');

    expect(circuit.toNetlist()).toContain('.noise v(in) V1 dec 3 100 10000 2');
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects an invalid programmatic summary interval of %s',
    pointsPerSummary => {
      const circuit = new Circuit();

      expect(() => circuit.addAnalysis('noise', {
        outputNode: 'out',
        inputSource: 'V1',
        variation: 'dec',
        points: 3,
        startFreq: 100,
        stopFreq: 10_000,
        pointsPerSummary,
      })).toThrow('Invalid .noise points_per_summary; expected a positive integer');
    },
  );

  it.each([
    ['0', /Invalid \.noise points_per_summary/],
    ['-1', /Invalid \.noise points_per_summary/],
    ['1.5', /Invalid \.noise points_per_summary/],
    ['not-a-number', /Cannot parse number: 'not-a-number'/],
    ['1 2', /Unsupported \.noise form/],
  ])('rejects malformed trailing field %s explicitly', (suffix, expected) => {
    expect(() => parse(`V1 in 0 AC 1\nR1 in 0 1k\n.noise v(in) V1 dec 3 100 10k ${suffix}`))
      .toThrow(expected);
  });
});
