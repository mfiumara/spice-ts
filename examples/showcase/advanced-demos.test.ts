import { describe, expect, it } from 'vitest';
import { simulate } from '@spice-ts/core';
import { ADVANCED_SHOWCASE_DEMOS } from './advanced-demos.js';

interface ComplexPoint {
  magnitude: number;
  phase: number;
}

function toCartesian(point: ComplexPoint): { re: number; im: number } {
  const radians = point.phase * Math.PI / 180;
  return {
    re: point.magnitude * Math.cos(radians),
    im: point.magnitude * Math.sin(radians),
  };
}

function waveformErrors(
  actual: readonly ComplexPoint[],
  reference: readonly ComplexPoint[],
): { max: number; rms: number } {
  expect(actual).toHaveLength(reference.length);
  const errors = actual.map((point, index) => {
    const a = toCartesian(point);
    const b = toCartesian(reference[index]);
    return Math.hypot(a.re - b.re, a.im - b.im);
  });
  return {
    max: Math.max(...errors),
    rms: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
  };
}

describe('correctness-backed advanced showcase demos', () => {
  it('exposes the validated common-source and series-RLC AC demos', () => {
    expect(ADVANCED_SHOWCASE_DEMOS.map(demo => ({ id: demo.id, signals: demo.signals }))).toEqual([
      { id: 'rlc-resonance', signals: ['out'] },
      { id: 'common-source-ac', signals: ['out'] },
    ]);
  });

  for (const demo of ADVANCED_SHOWCASE_DEMOS) {
    it(`${demo.name} stays aligned with the browser ngspice reference`, async () => {
      const spiceTs = await simulate(demo.acNetlist, { simulator: 'spice-ts' });
      const ngspice = await simulate(demo.acNetlist, { simulator: 'ngspice-wasm' });

      expect(spiceTs.ac).toBeDefined();
      expect(ngspice.ac).toBeDefined();
      expect(spiceTs.ac!.frequencies).toHaveLength(ngspice.ac!.frequencies.length);
      for (let index = 0; index < spiceTs.ac!.frequencies.length; index++) {
        const referenceFrequency = ngspice.ac!.frequencies[index];
        expect(Math.abs(spiceTs.ac!.frequencies[index] - referenceFrequency))
          .toBeLessThanOrEqual(Math.max(1, referenceFrequency) * 1e-12);
      }

      for (const signal of demo.signals) {
        const errors = waveformErrors(
          spiceTs.ac!.voltage(signal),
          ngspice.ac!.voltage(signal),
        );
        expect(errors.max).toBeLessThanOrEqual(demo.parity.maxAbsoluteError);
        expect(errors.rms).toBeLessThanOrEqual(demo.parity.rmsAbsoluteError);
      }
    });
  }
});
