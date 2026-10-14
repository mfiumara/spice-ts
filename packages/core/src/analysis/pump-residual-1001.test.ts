import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// One MOS2, two capacitors and one gate source; five cycles retain the real
// #1019 default-step loss. Derived GPL-3.0-or-later corpus-k input, SOURCES.md.
// Historical #996 diagnostic: linear native-to-TS interpolation, no alignment,
// unchanged 1% reference-peak bound. Not a replacement for the shared scorer.
interface Capture {
  input: string;
  sha256: string;
  reference: { analyses: { series: { grid: number[]; signals: Record<string, { re: number }[]> } }[] };
}
async function currentError(name: string): Promise<number> {
  const capture = JSON.parse(gunzipSync(readFileSync(new URL(`../../../../benchmarks/results/issue-1001/${name}.json.gz`, import.meta.url))).toString()) as Capture;
  expect(createHash('sha256').update(capture.input).digest('hex')).toBe(capture.sha256);
  const actual = (await simulate(capture.input)).transient!;
  const reference = capture.reference.analyses[0].series;
  const samples = reference.signals['i(vnin)'].map(v => v.re);
  const peak = Math.max(1e-10, ...samples.map(Math.abs));
  const values = actual.current('vnin');
  let cursor = 1, worst = 0;
  for (let i = 0; i < actual.time.length; i++) {
    const t = actual.time[i];
    if (t < reference.grid[0] || t > reference.grid.at(-1)!) continue;
    while (cursor < reference.grid.length - 1 && reference.grid[cursor] <= t) cursor++;
    const low = reference.grid[cursor - 1], high = reference.grid[cursor];
    const expected = samples[cursor - 1] + (samples[cursor] - samples[cursor - 1]) * (t - low) / (high - low);
    worst = Math.max(worst, Math.abs(values[i] - expected) / peak);
  }
  return worst;
}
describe('MOS2 pump remaining adaptive-step residual (#1001 / #1019)', () => {
  it.skipIf(process.env.ISSUE1001_RED !== '1')('RED: reduced pump matches native ngspice-47 at default steps', async () => {
    expect(await currentError('pump-reduced')).toBeLessThanOrEqual(0.01);
  }, 30_000);
  it('same reduced pump matches with identical uniform TSTEP/20 maxstep in both engines', async () => {
    expect(await currentError('pump-reduced-fine')).toBeLessThanOrEqual(0.01);
  }, 30_000);
});
