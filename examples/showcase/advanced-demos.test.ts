import { describe, expect, it } from 'vitest';
import { simulate } from '@spice-ts/core';
import { ADVANCED_SHOWCASE_DEMOS } from './advanced-demos.js';

interface ComplexPoint {
  magnitude: number;
  phase: number;
}

interface CartesianPoint {
  re: number;
  im: number;
}

interface Series {
  grid: readonly number[];
  values: CartesianPoint[];
}

function toCartesian(point: ComplexPoint): CartesianPoint {
  const radians = point.phase * Math.PI / 180;
  return {
    re: point.magnitude * Math.cos(radians),
    im: point.magnitude * Math.sin(radians),
  };
}

function interpolate(series: Series, target: number): CartesianPoint | null {
  const { grid, values } = series;
  if (grid.length === 0 || target < grid[0] || target > grid[grid.length - 1]) return null;
  let upper = grid.findIndex(value => value >= target);
  if (upper < 0) upper = grid.length - 1;
  if (grid[upper] === target || upper === 0) return values[upper] ?? null;
  const lower = upper - 1;
  const fraction = (target - grid[lower]) / (grid[upper] - grid[lower]);
  return {
    re: values[lower].re + (values[upper].re - values[lower].re) * fraction,
    im: values[lower].im + (values[upper].im - values[lower].im) * fraction,
  };
}

function waveformErrors(actual: Series, reference: Series): { max: number; rms: number; points: number } {
  const errors: number[] = [];
  actual.grid.forEach((point, index) => {
    const expected = interpolate(reference, point);
    const value = actual.values[index];
    if (expected && value) errors.push(Math.hypot(value.re - expected.re, value.im - expected.im));
  });
  return {
    max: errors.length > 0 ? Math.max(...errors) : 0,
    rms: errors.length > 0
      ? Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length)
      : 0,
    points: errors.length,
  };
}

describe('correctness-backed advanced showcase demos', () => {
  it('exposes every correctness-backed advanced demo and its plotted signals', () => {
    expect(ADVANCED_SHOWCASE_DEMOS.map(demo => ({ id: demo.id, signals: demo.signals }))).toEqual([
      { id: 'rlc-resonance', signals: ['out'] },
      { id: 'common-source-ac', signals: ['out'] },
      { id: 'passive-notch', signals: ['out'] },
      { id: 'opamp-differentiator', signals: ['in', 'out'] },
      { id: 'bjt-common-emitter', signals: ['in', 'out'] },
      { id: 'full-wave-rectifier', signals: ['in', 'out'] },
    ]);
  });

  it('uses the supported BJT model and a center-tapped full-wave diode topology', () => {
    const bjt = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'bjt-common-emitter');
    const rectifier = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'full-wave-rectifier');

    expect(bjt?.tranNetlist).toMatch(/Q1 out base emitter QMOD/);
    expect(bjt?.tranNetlist).toMatch(/\.model QMOD NPN\(/);
    expect(rectifier?.tranNetlist).toMatch(/D1 in out DMOD/);
    expect(rectifier?.tranNetlist).toMatch(/D2 in_n out DMOD/);
    expect(rectifier?.tranNetlist).toMatch(/V2 0 in_n SIN\(0 5 1k\)/);
  });

  it('uses a passive resonant branch for the notch and the supported VCVS convention for the differentiator', () => {
    const notch = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'passive-notch');
    const differentiator = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'opamp-differentiator');

    expect(notch?.acNetlist).toMatch(/Lnotch out notch 10m/);
    expect(notch?.acNetlist).toMatch(/Cnotch notch 0 100n/);
    expect(differentiator?.tranNetlist).toMatch(/Cdiff in pre 10n/);
    expect(differentiator?.tranNetlist).toMatch(/E1 out 0 0 nm 1e6/);
  });

  it('shows deep notch rejection and bipolar differentiator edge spikes', async () => {
    const notch = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'passive-notch')!;
    const differentiator = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'opamp-differentiator')!;
    const notchResult = await simulate(notch.acNetlist!);
    const differentiatorResult = await simulate(differentiator.tranNetlist!);

    const notchMagnitude = notchResult.ac!.voltage('out').map(point => point.magnitude);
    expect(Math.min(...notchMagnitude)).toBeLessThan(0.01);
    expect(notchMagnitude[0]).toBeGreaterThan(0.5);
    expect(notchMagnitude.at(-1)).toBeGreaterThan(0.5);

    const differentiatorOutput = differentiatorResult.transient!.voltage('out');
    expect(Math.min(...differentiatorOutput)).toBeLessThan(-0.5);
    expect(Math.max(...differentiatorOutput)).toBeGreaterThan(0.5);
  });

  it('shows inverted BJT gain and both rectified input half-cycles', async () => {
    const bjt = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'bjt-common-emitter')!;
    const rectifier = ADVANCED_SHOWCASE_DEMOS.find(demo => demo.id === 'full-wave-rectifier')!;
    const bjtResult = await simulate(bjt.tranNetlist!);
    const rectifierResult = await simulate(rectifier.tranNetlist!);

    const bjtInput = bjtResult.transient!.voltage('in');
    const bjtOutput = bjtResult.transient!.voltage('out');
    const inputMean = bjtInput.reduce((sum, value) => sum + value, 0) / bjtInput.length;
    const outputMean = bjtOutput.reduce((sum, value) => sum + value, 0) / bjtOutput.length;
    const covariance = bjtInput.reduce(
      (sum, value, index) => sum + (value - inputMean) * (bjtOutput[index] - outputMean),
      0,
    );
    expect(covariance).toBeLessThan(0);
    expect(Math.max(...bjtOutput) - Math.min(...bjtOutput)).toBeGreaterThan(
      Math.max(...bjtInput) - Math.min(...bjtInput),
    );

    const rectifiedOutput = rectifierResult.transient!.voltage('out');
    expect(Math.min(...rectifiedOutput)).toBeGreaterThan(-1e-6);
    expect(rectifiedOutput.filter(value => value > 3).length).toBeGreaterThan(100);
  });

  for (const demo of ADVANCED_SHOWCASE_DEMOS) {
    it(`${demo.name} stays aligned with the browser ngspice reference`, async () => {
      const netlist = demo.acNetlist ?? demo.tranNetlist;
      expect(netlist).toBeDefined();
      const spiceTs = await simulate(netlist!, { simulator: 'spice-ts' });
      const ngspice = await simulate(netlist!, { simulator: 'ngspice-wasm' });

      for (const signal of demo.signals) {
        const spiceSeries: Series = demo.tag === '.ac'
          ? { grid: spiceTs.ac!.frequencies, values: spiceTs.ac!.voltage(signal).map(toCartesian) }
          : { grid: spiceTs.transient!.time, values: spiceTs.transient!.voltage(signal).map((re: number) => ({ re, im: 0 })) };
        const ngspiceSeries: Series = demo.tag === '.ac'
          ? { grid: ngspice.ac!.frequencies, values: ngspice.ac!.voltage(signal).map(toCartesian) }
          : { grid: ngspice.transient!.time, values: ngspice.transient!.voltage(signal).map((re: number) => ({ re, im: 0 })) };
        const errors = waveformErrors(spiceSeries, ngspiceSeries);
        expect(errors.points).toBeGreaterThan(0);
        expect(errors.max, `${demo.id} ${signal} max`).toBeLessThanOrEqual(demo.parity.maxAbsoluteError);
        expect(errors.rms, `${demo.id} ${signal} RMS`).toBeLessThanOrEqual(demo.parity.rmsAbsoluteError);
      }
    });
  }
});
