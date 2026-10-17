import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

const fixture = readFileSync(resolve(
  process.cwd(),
  '../../benchmarks/corpus/ngspice/fixtures/tests/vbic/CEamp.cir',
));

// ngspice-47 `ngspice -b CEamp.cir` on the unchanged fixture (print precision).
// Phase is ngspice ph() in radians.
const NGSPICE_AC = [
  { frequency: 1e5, db: 32.67930, phase: 2.901458e-02 },
  { frequency: 1e6, db: 32.68292, phase: -3.14714e-03 },
  { frequency: 1e7, db: 32.66773, phase: -6.07397e-02 },
  { frequency: 1e8, db: 31.36424, phase: -5.52598e-01 },
  { frequency: 1e9, db: 17.05102, phase: -1.55838 },
  { frequency: 1e10, db: -4.32220, phase: -2.92736 },
];
const NGSPICE_POLES = [
  { real: -1.86198e4, imaginary: 0 },
  { real: -1.05484e9, imaginary: 0 },
  { real: -5.92006e10, imaginary: 0 },
  { real: -7.24619e10, imaginary: 4.728303e10 },
  { real: -7.24619e10, imaginary: -4.72830e10 },
  { real: -5.42221e11, imaginary: 0 },
  { real: -1.16914e12, imaginary: 0 },
];
const NGSPICE_ZEROS = [
  { real: -8.81718e10, imaginary: 1.565009e11 },
  { real: -8.81718e10, imaginary: -1.565009e11 },
  { real: -6.47546e10, imaginary: 0 },
  { real: 9.447173e10, imaginary: 0 },
  { real: -2.99053e11, imaginary: 0 },
  { real: -1.32050e12, imaginary: 0 },
];

type Root = { real: number; imaginary: number };

function sortRoots(roots: readonly Root[]): Root[] {
  // Conjugates tie on magnitude; ngspice prints their halves with different
  // rounding, so magnitudes within 1e-6 relative count as a tie.
  return [...roots].sort((a, b) => {
    const left = Math.hypot(a.real, a.imaginary);
    const right = Math.hypot(b.real, b.imaginary);
    if (Math.abs(left - right) > 1e-6 * Math.max(left, right)) return left - right;
    return b.imaginary - a.imaginary;
  });
}

function expectRootsNear(actual: readonly Root[], expected: readonly Root[]): void {
  expect(actual).toHaveLength(expected.length);
  const sorted = sortRoots(actual);
  sortRoots(expected).forEach((root, index) => {
    const distance = Math.hypot(sorted[index].real - root.real, sorted[index].imaginary - root.imaginary);
    // 1e-3 relative: well above ngspice's 6-significant-digit print precision.
    expect(distance / Math.hypot(root.real, root.imaginary)).toBeLessThan(1e-3);
  });
}

describe('bounded VBIC small-signal AC and pole-zero (ngspice vbicacld/vbicpzld)', () => {
  it('runs the unchanged vbic-common-emitter-ac fixture against ngspice-47 AC and PZ results', async () => {
    expect(createHash('sha256').update(fixture).digest('hex'))
      .toBe('088d1ebede86588ff8b823ba45219006bfeec34939af69e10c176e23d8a020ab');

    const result = await simulate(fixture.toString('utf8'));

    const ac = result.ac!;
    expect(ac.frequencies).toHaveLength(501);
    const current = ac.current('Vmeas');
    for (const reference of NGSPICE_AC) {
      const index = ac.frequencies.findIndex(frequency =>
        Math.abs(frequency / reference.frequency - 1) < 1e-9);
      expect(index).toBeGreaterThanOrEqual(0);
      const db = 20 * Math.log10(current[index].magnitude);
      const phase = current[index].phase * Math.PI / 180;
      expect(Math.abs(db - reference.db)).toBeLessThan(1e-3);
      expect(Math.abs(phase - reference.phase)).toBeLessThan(1e-4);
    }

    // Dominant pole to 1e-4; the full pole/zero set is pinned below (#451).
    const poleZero = result.poleZero!;
    const dominant = sortRoots(poleZero.poles)[0];
    expect(Math.abs(dominant.real / NGSPICE_POLES[0].real - 1)).toBeLessThan(1e-4);
    expect(dominant.imaginary).toBe(0);
  });

  it('matches every ngspice-47 pole and zero of vbic-common-emitter-ac (#451)', async () => {
    const result = await simulate(fixture.toString('utf8'));
    const poleZero = result.poleZero!;
    expectRootsNear(poleZero.poles, NGSPICE_POLES);
    expectRootsNear(poleZero.zeros, NGSPICE_ZEROS);
  });

  it('compiles transient analysis with charge and excess-phase states', () => {
    const compile = () => parse(`unsupported VBIC transient analysis
      VBE b 0 0.7
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4 CJE=1p TD=1p)
      .tran 1n 10n
    `).compile();
    expect(compile).not.toThrow();
  });

  it('accepts bounded noise analysis', () => {
    const compile = () => parse(`unsupported VBIC noise analysis
      VBE b 0 DC 0.7 AC 1
      RC c 0 1k
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .noise v(c) VBE dec 10 1 1meg
    `).compile();
    expect(compile).not.toThrow();
  });

  it('rejects VBIC charge parameters outside the bounded subset with a typed error', () => {
    const compile = () => parse(`unsupported VBIC charge parameter
      VBE b 0 DC 0.7 AC 1
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4 CBEO=1f)
      .ac dec 10 1 1meg
    `).compile();
    expect(compile).toThrow(InvalidCircuitError);
    expect(compile).toThrow("Unsupported bounded VBIC DC model parameter: 'CBEO'");
  });
});
