import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { chargeTruncationTimestep } from './charge-state.js';

interface Capture {
  input: string;
  sha256: string;
  reference: { grid: number[]; signals: Record<string, number[]> };
}
async function supplyError(file: string): Promise<number> {
  const capture = JSON.parse(gunzipSync(readFileSync(new URL(`../../../../benchmarks/results/issue-1059/${file}.waveforms.json.gz`, import.meta.url))).toString()) as Capture;
  expect(createHash('sha256').update(capture.input).digest('hex')).toBe(capture.sha256);
  const actual = (await simulate(capture.input)).transient!;
  const { grid, signals } = capture.reference;
  const values = signals['i(vdd)'];
  const peak = Math.max(1e-10, ...values.map(Math.abs));
  let cursor = 1, worst = 0;
  const current = actual.current('vdd');
  for (let i = 0; i < actual.time.length; i++) {
    const time = actual.time[i];
    if (time < grid[0] || time > grid.at(-1)!) continue;
    while (cursor < grid.length - 1 && grid[cursor] <= time) cursor++;
    const fraction = (time - grid[cursor - 1]) / (grid[cursor] - grid[cursor - 1]);
    const expected = values[cursor - 1] + fraction * (values[cursor] - values[cursor - 1]);
    worst = Math.max(worst, Math.abs(current[i] - expected) / peak);
  }
  return worst;
}

describe('MOS3 adaptive transient residual #1059', () => {
  // Evidence-only: enable explicitly to reproduce RED; do not claim a fix.
  it.skipIf(process.env.ISSUE1059_RED !== '1')('RED: the reduced pair supply matches ngspice-47 at default steps', async () => {
    expect(await supplyError('reduced-pair')).toBeLessThanOrEqual(0.01);
  });
  it('the identical reduced pair agrees at uniform TSTEP/20 in both engines', async () => {
    expect(await supplyError('reduced-pair-fine')).toBeLessThanOrEqual(0.01);
  });
  it('CKTterr agrees with traced ngspice-47 mn1 qgb on the first rejected edge trial', () => {
    // a80f6e3e ngspice-47: mos3trun.c qgb -> cktterr.c, time 10.094080480255495 ns.
    const bound = chargeTruncationTimestep('trapezoidal', 2,
      4.4288958285460897e-15, 4.4288958285460897e-15, 2.5304044651794653e-15, 0,
      4.7017103874016187e-5, -4.7017103874016187e-5,
      { deltas: [5.3760274431710822e-11, 2.6880137215855411e-11, 1.3440068607927706e-11], reltol: 0.001, abstol: 1e-12, chgtol: 1e-14, trtol: 7 });
    expect(Math.abs(bound - 2.6831071573030077e-11)).toBeLessThan(1e-25);
  });
});
