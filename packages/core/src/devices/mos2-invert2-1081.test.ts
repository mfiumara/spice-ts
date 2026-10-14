import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { MOS2 } from './mos2.js';

const base = new URL('../../../../benchmarks/', import.meta.url);
interface Series { grid: number[]; signals: Record<string, { re: number }[]> }
const reference = JSON.parse(gunzipSync(readFileSync(new URL('mos2-invert2-1081/before-waveforms.json.gz', base))).toString()) as Array<{ id: string; ng: { analyses: Array<{ series: Series }> } }>;
const deck = (alternate: boolean) => readFileSync(new URL(`corpus/corpus-m/fixtures/xyce/Netlists/MOSFET_ParamAliases/invert2${alternate ? '_alt' : ''}.cir`, base), 'utf8');
function interpolate(series: Series, name: string, at: number): number {
  let i = 1;
  while (i < series.grid.length - 1 && series.grid[i] < at) i++;
  const f = (at - series.grid[i - 1]) / (series.grid[i] - series.grid[i - 1]);
  return series.signals[name][i - 1].re * (1 - f) + series.signals[name][i].re * f;
}

describe('MOS2 invert2 aliases (#1081)', () => {
  it('resolves UO/VTO and U0/VT0 to identical MOS2 model and instance quantities', () => {
    const devices = (alternate: boolean) => parse(deck(alternate)).compile().devices.filter((d): d is MOS2 => d instanceof MOS2);
    const normal = devices(false), alternate = devices(true);
    expect(normal).toHaveLength(2);
    expect(alternate).toHaveLength(2);
    normal.forEach((device, i) => {
      expect(alternate[i].model).toEqual(device.model);
      expect(alternate[i].instance).toEqual(device.instance);
    });
  });
  it.each([false, true])('matches native default-deck output within the uniform 1%% voltage-peak gate (alternate=%s)', async alternate => {
    const result = (await simulate(deck(alternate))).transient!;
    const series = reference.find(r => r.id === (alternate ? 'm-20' : 'm-19'))!.ng.analyses[0].series;
    const native = series.signals['v(vout)'].map(v => v.re);
    const peak = Math.max(...native.map(Math.abs));
    const error = Math.max(...Array.from(result.time, (time, i) => Math.abs(result.voltage('vout')[i] - interpolate(series, 'v(vout)', time))));
    expect(error / peak).toBeLessThanOrEqual(0.01);
  });
});
