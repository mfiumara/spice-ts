import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParseError } from './errors.js';
import { simulate, simulateStream } from './simulate.js';

const ngspiceFixtureRoot = new URL('../../../benchmarks/corpus/ngspice/fixtures/', import.meta.url);

const fixtures = [
  {
    path: 'tests/hfet/inverter.cir',
    sha256: '3fa93266e9036443173bf9416eb67e8ff4c2c24aeefc6ef687f355d8548239e1',
    card: 'Z',
  },
  {
    path: 'tests/mesa/mesosc.cir',
    sha256: '3cd4609cca7874775b7b2cac8cd0124bd2b8c5512064a0550a29de2da4896bcf',
    card: 'B',
  },
] as const;

describe('unsupported devices inside subcircuits', () => {
  it.each(fixtures)(
    'rejects the first unsupported card in unchanged $path instead of reaching a singular solve',
    async ({ path, sha256, card }) => {
      const bytes = readFileSync(new URL(path, ngspiceFixtureRoot));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);

      let error: unknown;
      try {
        await simulate(bytes.toString('utf8'));
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain(`Unsupported device card: '${card}'`);
      expect((error as Error).message).not.toContain('Singular matrix');
    },
  );

  it.each(fixtures)(
    'reports the same unsupported $card boundary through streaming for unchanged $path',
    async ({ path, sha256, card }) => {
      const bytes = readFileSync(new URL(path, ngspiceFixtureRoot));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);

      let error: unknown;
      try {
        for await (const _point of simulateStream(bytes.toString('utf8'))) {
          // The unsupported card is rejected while compiling, before points exist.
        }
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain(`Unsupported device card: '${card}'`);
      expect((error as Error).message).not.toContain('Singular matrix');
    },
  );
});
