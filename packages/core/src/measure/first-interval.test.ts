import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { complexVector, realVector, type ControlVector } from '../parser/control/vector.js';
import { getMeasure2, type MeasurePlot } from './measure2.js';

/**
 * Issue #811 / ngspice ticket #574: ngspice-47 never reports a WHEN crossing
 * that lies between the first and the second accepted point of a plot (it
 * counts it, but only measures crossings from the third point on), so a
 * `.dc v1 0 1 0.05` sweep cannot find v(1)=0.05. spice-ts deliberately
 * diverges and returns the interpolated crossing.
 */
const firstStepDeck = [
  'ngspice bug 574',
  'v1 1 0 dc 0',
  'r1 1 0 1k',
  '.dc v1 0 1 0.05',
  '.measure dc test find i(v1) when v(1)=0.05',
  '.end',
].join('\n');

function relativeError(actual: number | undefined, expected: number): number {
  return Math.abs((actual ?? NaN) - expected) / Math.abs(expected);
}

function plotOf(type: string, scaleName: string, scale: number[], vectors: Record<string, number[] | { re: number[]; im: number[] }>): MeasurePlot {
  const scaleVector = realVector(scaleName, scale);
  const map = new Map<string, ControlVector>([[scaleName, scaleVector]]);
  for (const [name, data] of Object.entries(vectors)) {
    map.set(name, Array.isArray(data) ? realVector(name, data, scaleVector) : complexVector(name, data.re, data.im, scaleVector));
  }
  return { type, scale: scaleVector, vector: name => map.get(name.toLowerCase()) };
}

describe('.meas WHEN crossings in the first interval of the plot (#811, ngspice #574)', () => {
  it('finds a crossing exactly on the first .dc sweep increment (the #574 deck)', async () => {
    const result = await simulate(firstStepDeck);
    const test = result.measurements?.find(m => m.name === 'test');
    expect(test, JSON.stringify(test)).toMatchObject({ status: 'ok' });
    expect(relativeError(test?.value, -5e-5)).toBeLessThan(1e-9);
  });

  it('finds .dc crossings strictly inside the first increment, for FIND and WHEN', async () => {
    const result = await simulate(firstStepDeck.replace(
      '.measure dc test find i(v1) when v(1)=0.05',
      '.measure dc ifind find i(v1) when v(1)=0.03\n.measure dc vwhen when v(1)=0.03\n.measure dc vrise when v(1)=0.03 rise=1\n.measure dc vcross when v(1)=0.03 cross=1\n.measure dc vlast when v(1)=0.03 cross=last',
    ));
    const byName = new Map((result.measurements ?? []).map(m => [m.name, m]));
    expect(relativeError(byName.get('ifind')?.value, -3e-5)).toBeLessThan(1e-9);
    for (const name of ['vwhen', 'vrise', 'vcross', 'vlast']) {
      expect(byName.get(name)?.status, name).toBe('ok');
      expect(relativeError(byName.get(name)?.value, 0.03), name).toBeLessThan(1e-9);
    }
  });

  it('still fails with the ngspice error text when the crossing lies outside the sweep', async () => {
    for (const level of ['1.5', '-0.01']) {
      const result = await simulate(firstStepDeck.replace('v(1)=0.05', `v(1)=${level}`));
      expect(result.measurements?.[0], level).toMatchObject({
        name: 'test', status: 'failed', error: 'measure  test  find(AT) : out of interval',
      });
    }
  });

  it('applies to .tran: a falling crossing between the first two time points', () => {
    const plot = plotOf('tran', 'time', [0, 1e-3, 2e-3, 3e-3], { 'v(1)': [1, 0, 0, 1], 'i(v1)': [-1e-3, 0, 0, -1e-3] });
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=0.25'], plot)).toEqual({ ok: true, value: expect.closeTo(0.75e-3, 15) });
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=0.25', 'fall=1'], plot)).toEqual({ ok: true, value: expect.closeTo(0.75e-3, 15) });
    // The first counted crossing is the fall, so rise=1 is the later one.
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=0.25', 'rise=1'], plot)).toEqual({ ok: true, value: expect.closeTo(2.25e-3, 15) });
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=0.25', 'cross=2'], plot)).toEqual({ ok: true, value: expect.closeTo(2.25e-3, 15) });
    expect(getMeasure2(['tran', 'x', 'find', 'i(v1)', 'when', 'v(1)=0.5'], plot)).toEqual({ ok: true, value: expect.closeTo(-0.5e-3, 15) });
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=2'], plot)).toEqual({ ok: false, error: 'measure  x  when(WHEN) : out of interval' });
  });

  it('applies to .tran after TD: the first interval starts at the first point past TD', () => {
    const plot = plotOf('tran', 'time', [0, 1, 2, 3], { 'v(1)': [0, 0, 1, 1] });
    expect(getMeasure2(['tran', 'x', 'when', 'v(1)=0.5', 'td=1'], plot)).toEqual({ ok: true, value: 1.5 });
  });

  it('applies to .ac: a crossing between the first two frequencies', () => {
    const plot = plotOf('ac', 'frequency', [10, 100, 1000], { 'v(2)': { re: [1, 0.5, 0.1], im: [0, 0, 0] } });
    expect(getMeasure2(['ac', 'f3', 'when', 'v(2)=0.75'], plot)).toEqual({ ok: true, value: 55 });
    expect(getMeasure2(['ac', 'f3', 'when', 'vm(2)=0.5'], plot)).toEqual({ ok: true, value: 100 });
  });
});
